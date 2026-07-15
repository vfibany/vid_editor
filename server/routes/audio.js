const express = require('express');
const router = express.Router();
const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { syncScriptFromConfig } = require('../utils/scriptSync');
const { resolveExpressiveTuning, resolveReferencePath } = require('../utils/chatterboxTone');

/**
 * POST /api/audio/generate
 * Generates a sandbox preview clip and returns file access handles to the UI layout
 */
router.post('/generate', async (req, res) => {
    try {
        // MODIFIED: Destructure expressiveness attributes arriving from the client sliders
        const { text, voice, projectId, tone, exaggeration_scale, cfg_weight, loudness_scale } = req.body;

        if (!text || !projectId) {
            return res.status(400).json({ error: 'Missing required text or projectId payload attributes.' });
        }

        const projectPath = path.join(__dirname, `../../projects/${projectId}`);
        const publicAudioDir = path.join(projectPath, 'public/audio');

        if (!fs.existsSync(publicAudioDir)) {
            fs.mkdirSync(publicAudioDir, { recursive: true });
        }

        const tempFileName = `preview_${Date.now()}.wav`;
        const outPath = path.join(publicAudioDir, tempFileName);

        const refPath = resolveReferencePath(projectPath, voice);
        const expressiveTuning = resolveExpressiveTuning({ tone, exaggerationScale: exaggeration_scale, cfgWeight: cfg_weight });

        console.log(`[Sandbox TTS] Synthesizing preview: "${text.substring(0, 30)}..." | Voice Reference: ${refPath || 'Internal Default'}`);

        // MODIFIED: Forward extracted frontend values down into Python sys.stdin task pipeline
        const loudness = Number.isFinite(Number(loudness_scale)) ? Number(loudness_scale) : 2.4;

        const singleTask = [{
            text: text,
            ref_path: refPath,
            out_path: outPath,
            exaggeration_scale: expressiveTuning.exaggeration_scale,
            cfg_weight: expressiveTuning.cfg_weight,
            loudness_scale: loudness
        }];

        const venvPythonPath = path.join(__dirname, '../python/.venv/bin/python');
        const scriptPath = path.join(__dirname, '../python/generate_tts.py');

        const pyEngine = spawn(venvPythonPath, [scriptPath]);

        pyEngine.stderr.on('data', (data) => {
            const errorString = data.toString();
            if (
                errorString.includes('FutureWarning:') ||
                errorString.includes('UserWarning:') ||
                errorString.includes('LoRACompatibleLinear') ||
                errorString.includes('pkg_resources')
            ) {
                return;
            }
            console.error(`[Python Sandbox Engine Exception]: ${errorString}`);
        });

        pyEngine.stdin.write(JSON.stringify(singleTask));
        pyEngine.stdin.end();

        pyEngine.on('close', (code) => {
            if (code !== 0) {
                return res.status(500).json({ error: 'Python core synthesis failed on sandbox output generation.' });
            }

            res.json({
                success: true,
                filename: tempFileName,
                url: `http://localhost:4000/projects/${projectId}/public/audio/${tempFileName}`
            });
        });

    } catch (err) {
        console.error('[Standalone Line Process Error]:', err);
        res.status(500).json({ error: 'Failed executing single-line generation.', details: err.message });
    }
});

/**
 * POST /api/audio/commit-sandbox
 * Promotes a sandbox preview file to a permanent line item on the narrative timeline
 */
router.post('/commit-sandbox', async (req, res) => {
    try {
        const { projectId, scriptName, previewFilename, text, speaker, tone } = req.body;

        if (!projectId || !previewFilename || !text) {
            return res.status(400).json({ error: 'Missing required configuration parameters.' });
        }

        const activeScriptName = (scriptName && scriptName !== 'script') ? scriptName : projectId;

        const projectPath = path.join(__dirname, `../../projects/${projectId}`);
        const configPath = path.join(projectPath, `config/${activeScriptName}.json`);

        const configContent = await fsPromises.readFile(configPath, 'utf8');
        const projectConfig = JSON.parse(configContent);

        const nextLineIndex = projectConfig.captions.length + 1;
        const permanentName = `${activeScriptName}_${nextLineIndex}.wav`;

        const sourcePath = path.join(projectPath, 'public/audio', previewFilename);
        const targetPath = path.join(projectPath, 'public/audio', permanentName);

        if (fs.existsSync(sourcePath)) {
            await fsPromises.rename(sourcePath, targetPath);
        } else {
            return res.status(404).json({ error: 'Sandbox source preview file missing or expired.' });
        }

        const wordCount = text.split(/\s+/).length;
        const estimatedDurationMs = Math.max(1000, wordCount * 360 + 400);

        let timelineCursor = 0;
        if (projectConfig.captions.length > 0) {
            const lastCaption = projectConfig.captions[projectConfig.captions.length - 1];
            timelineCursor = lastCaption.start_ms + lastCaption.audio_duration_ms + 500;
        }

        const newCaption = {
            id: `sandbox_${Math.random().toString(36).substring(2, 11)}`,
            lineIndex: nextLineIndex,
            text: text,
            speaker: speaker || 'narrator',
            tone: tone || 'neutral',
            start_ms: timelineCursor,
            audio_asset: `public/audio/${permanentName}`,
            audio_duration_ms: estimatedDurationMs,
            show_captions: true
        };

        projectConfig.captions.push(newCaption);
        projectConfig.total_ms = Math.max(projectConfig.total_ms || 10000, timelineCursor + estimatedDurationMs);

        await fsPromises.writeFile(configPath, JSON.stringify(projectConfig, null, 2));
        await syncScriptFromConfig(projectPath, activeScriptName, projectConfig.captions);

        res.json({ success: true, config: projectConfig });

    } catch (err) {
        console.error('[Sandbox Commit Failure]:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/audio/regenerate-line
 * Re-synthesizes a single text track block and ripples downstream elements dynamically
 */
router.post('/regenerate-line', async (req, res) => {
    try {
        // MODIFIED: Added extraction filters capturing parameters from frontend timeline actions
        const { projectId, scriptName, captionId, updatedText, speaker, tone, exaggeration_scale, cfg_weight, loudness_scale } = req.body;

        if (!projectId || !captionId || updatedText === undefined) {
            return res.status(400).json({ error: 'Missing target modification payload attributes.' });
        }

        const activeScriptName = (scriptName && scriptName !== 'script') ? scriptName : projectId;

        const projectPath = path.join(__dirname, `../../projects/${projectId}`);
        const configPath = path.join(projectPath, `config/${activeScriptName}.json`);

        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ error: `Project configuration manifest missing at: ${configPath}` });
        }

        const configContent = await fsPromises.readFile(configPath, 'utf8');
        const projectConfig = JSON.parse(configContent);

        const targetCaptionIndex = projectConfig.captions.findIndex(c => c.id === captionId);
        if (targetCaptionIndex === -1) return res.status(404).json({ error: 'Target timeline block link broken.' });

        const activeCaption = projectConfig.captions[targetCaptionIndex];
        const targetLineIndex = activeCaption.lineIndex || (targetCaptionIndex + 1);

        const refPath = resolveReferencePath(projectPath, speaker);
        const expressiveTuning = resolveExpressiveTuning({ tone, exaggerationScale: exaggeration_scale, cfgWeight: cfg_weight });

        console.log(refPath ? `[Line Regeneration] Using reference audio: ${refPath}` : '[Line Regeneration] WARNING: No reference audio found, using default synthesis weights.');

        const audioFileName = `${activeScriptName}_${targetLineIndex}.wav`;
        const relativeAudioPath = `public/audio/${audioFileName}`;

        // MODIFIED: Pack exact slider values down into task processing layout blocks
        const loudness = Number.isFinite(Number(loudness_scale)) ? Number(loudness_scale) : 2.4;

        const singleTask = [{
            text: updatedText,
            ref_path: refPath,
            out_path: path.join(projectPath, relativeAudioPath),
            exaggeration_scale: expressiveTuning.exaggeration_scale,
            cfg_weight: expressiveTuning.cfg_weight,
            loudness_scale: loudness
        }];

        let extractedNewDurationMs = 0;
        const venvPythonPath = path.join(__dirname, '../python/.venv/bin/python');
        const scriptPath = path.join(__dirname, '../python/generate_tts.py');

        const pyEngine = spawn(venvPythonPath, [scriptPath]);

        pyEngine.stderr.on('data', (data) => {
            console.error(`[Python Core Runtime Error]: ${data.toString()}`);
        });

        pyEngine.stdin.write(JSON.stringify(singleTask));
        pyEngine.stdin.end();

        await new Promise((resolve, reject) => {
            pyEngine.stdout.on('data', (data) => {
                const match = data.toString().match(/PROGRESS:\d+\/\d+\|DURATION:(\d+)/);
                if (match) extractedNewDurationMs = parseInt(match[1]);
            });
            pyEngine.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error('Python local synthesis worker failed updating line.'));
            });
        });

        if (!extractedNewDurationMs) {
            extractedNewDurationMs = updatedText.split(' ').length * 350;
        }

        const oldDurationMs = activeCaption.audio_duration_ms;
        const timingDeltaMs = extractedNewDurationMs - oldDurationMs;

        activeCaption.text = updatedText;
        if (speaker) activeCaption.speaker = speaker;
        if (tone) activeCaption.tone = tone;
        activeCaption.audio_duration_ms = extractedNewDurationMs;
        activeCaption.audio_asset = relativeAudioPath;

        for (let i = targetCaptionIndex + 1; i < projectConfig.captions.length; i++) {
            projectConfig.captions[i].start_ms += timingDeltaMs;
        }

        if (projectConfig.visuals && projectConfig.visuals.length > 0) {
            projectConfig.visuals.forEach((visual) => {
                if (visual.start_ms > activeCaption.start_ms) {
                    visual.start_ms = Math.max(0, visual.start_ms + timingDeltaMs);
                }
            });
        }

        if (projectConfig.audio_tracks && projectConfig.audio_tracks.length > 0) {
            projectConfig.audio_tracks.forEach((track) => {
                if (track.asset === relativeAudioPath || track.id === `track_${captionId}`) {
                    track.duration_ms = extractedNewDurationMs;
                } else if (track.start_ms > activeCaption.start_ms) {
                    track.start_ms = Math.max(0, track.start_ms + timingDeltaMs);
                }
            });
        }

        if (projectConfig.captions.length > 0) {
            const lastCap = projectConfig.captions[projectConfig.captions.length - 1];
            projectConfig.total_ms = Math.max(10000, lastCap.start_ms + lastCap.audio_duration_ms);
        }

        await fsPromises.writeFile(configPath, JSON.stringify(projectConfig, null, 2));
        await syncScriptFromConfig(projectPath, activeScriptName, projectConfig.captions);

        res.json({ success: true, message: 'Line updated and timeline rippled successfully.', config: projectConfig });

    } catch (err) {
        console.error('[Single Line Process Error]:', err);
        res.status(500).json({ error: 'Failed executing sound synthesis adjustments.', details: err.message });
    }
});

module.exports = router;
