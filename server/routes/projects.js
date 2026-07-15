const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { syncScriptFromConfig } = require('../utils/scriptSync');
const { resolveExpressiveTuning, resolveReferencePath } = require('../utils/chatterboxTone');

const PROJECTS_DIR = path.join(__dirname, '../../projects');

// Helper to guarantee directory matrices exist
const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// Dialogue script parser utility module
function parseScriptLines(scriptText) {
    const lines = scriptText.split('\n');
    const pattern = /^(?:\[([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?\]\s*)?(.*)$/;

    return lines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map((line, idx) => {
            const match = line.match(pattern);
            const speaker = match[1] || 'narrator';
            const tone = match[2] || 'neutral';
            const text = match[3];
            return { lineIndex: idx + 1, speaker, tone, text };
        });
}

/**
 * GET /api/projects
 * Scans the local projects folder and returns a list of project workspace names
 */
router.get('/', (req, res) => {
    try {
        ensureDir(PROJECTS_DIR);
        const files = fs.readdirSync(PROJECTS_DIR);
        const projects = files.filter(file => {
            return fs.statSync(path.join(PROJECTS_DIR, file)).isDirectory();
        });
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve project spaces index.', details: err.message });
    }
});

/**
 * POST /api/projects
 * Allocates a project on disk and handles bulk sequential TTS script generation with live progress streaming
 */
router.post('/', async (req, res) => {
    const { title, script, exaggeration_scale, cfg_weight } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'A valid project identifier title string is required.' });
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const projectPath = path.join(PROJECTS_DIR, safeTitle);

    // Establish Server-Sent Events response channels for streaming progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgressEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // 1. Scaffold out the clean structural workspace directory tree
        ensureDir(projectPath);
        ensureDir(path.join(projectPath, 'scripts'));
        ensureDir(path.join(projectPath, 'config'));
        ensureDir(path.join(projectPath, 'public/audio'));
        ensureDir(path.join(projectPath, 'public/video'));
        ensureDir(path.join(projectPath, 'public/images'));
        ensureDir(path.join(projectPath, 'voices'));

        // 2. Save down the raw markdown script asset backup using the Title convention
        const rawScriptPath = path.join(projectPath, 'scripts', `${safeTitle}.md`);
        await fsPromises.writeFile(rawScriptPath, script || '', 'utf8');

        // If no dialogue script block is provided, initialize a fast baseline default canvas layout
        if (!script || script.trim().length === 0) {
            const emptyConfig = {
                total_ms: 10000,
                captions: [],
                visuals: [],
                audio_tracks: [],
                blurRegions: [],
                render: { width: 1080, height: 1920, fps: 30 }
            };
            await fsPromises.writeFile(path.join(projectPath, 'config', `${safeTitle}.json`), JSON.stringify(emptyConfig, null, 2));
            sendProgressEvent({ stage: 'complete', projectId: safeTitle, message: 'Empty workspace initialized successfully.' });
            return res.end();
        }

        // 3. Process script compilation parsing arrays
        const parsedLines = parseScriptLines(script);
        const totalLines = parsedLines.length;
        const baseExaggerationScale = Number.isFinite(Number(exaggeration_scale)) ? Number(exaggeration_scale) : 1.0;
        const baseCfgWeight = Number.isFinite(Number(cfg_weight)) ? Number(cfg_weight) : 0.3;

        sendProgressEvent({ stage: 'start', total: totalLines, message: `Parsed ${totalLines} structural script lines. Starting bulk pipeline synthesis...` });

        const captionsTimeline = [];
        let timelineCursorMs = 0;

        // 4. Sequential generation loops running audio assets cleanly against the backend pipeline
        for (let i = 0; i < parsedLines.length; i++) {
            const currentLine = parsedLines[i];
            // CONVENTION FIXED: Audio filenames now correctly use the safeTitle prefix
            const permanentName = `${safeTitle}_${currentLine.lineIndex}.wav`;
            const outPath = path.join(projectPath, 'public/audio', permanentName);

            const refPath = resolveReferencePath(projectPath, currentLine.speaker);
            const expressiveTuning = resolveExpressiveTuning({
                tone: currentLine.tone,
                exaggerationScale: baseExaggerationScale,
                cfgWeight: baseCfgWeight,
            });

            const taskPayload = [{
                text: currentLine.text,
                ref_path: refPath,
                out_path: outPath,
                exaggeration_scale: expressiveTuning.exaggeration_scale,
                cfg_weight: expressiveTuning.cfg_weight,
            }];
            const venvPythonPath = path.join(__dirname, '../python/.venv/bin/python');
            const pythonEngineScript = path.join(__dirname, '../python/generate_tts.py');

            let extractedDurationMs = 0;

            // Run process execution worker tasks synchronously per line
            await new Promise((resolve, reject) => {
                const pyEngine = spawn(venvPythonPath, [pythonEngineScript]);

                pyEngine.stdin.write(JSON.stringify(taskPayload));
                pyEngine.stdin.end();

                pyEngine.stdout.on('data', (data) => {
                    const match = data.toString().match(/PROGRESS:\d+\/\d+\|DURATION:(\d+)/);
                    if (match) {
                        extractedDurationMs = parseInt(match[1]);
                    }
                });

                pyEngine.stderr.on('data', (data) => {
                    console.error(`[Bulk Engine Exception Node]: ${data.toString()}`);
                });

                pyEngine.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Core voice generator processing broken on script step index line: ${currentLine.lineIndex}`));
                });
            });

            // Fallback duration protection rule algorithms
            if (!extractedDurationMs) {
                const wordCount = currentLine.text.split(/\s+/).length;
                extractedDurationMs = Math.max(1000, wordCount * 360 + 400);
            }

            // Append track elements directly onto structural arrays shifts
            captionsTimeline.push({
                id: `bulk_line_${Math.random().toString(36).substring(2, 11)}`,
                lineIndex: currentLine.lineIndex,
                text: currentLine.text,
                speaker: currentLine.speaker,
                tone: currentLine.tone,
                start_ms: timelineCursorMs,
                audio_asset: `public/audio/${permanentName}`,
                audio_duration_ms: extractedDurationMs,
                show_captions: true,
                exaggeration_scale: expressiveTuning.exaggeration_scale,
                cfg_weight: expressiveTuning.cfg_weight,
                loudness_scale: 2.4
            });

            sendProgressEvent({
                stage: 'processing',
                current: i + 1,
                total: totalLines,
                text: currentLine.text
            });

            // Advance timeline cursor sequence blocks accurately using actual audio parameters
            timelineCursorMs += extractedDurationMs;
        }

        // 5. Finalize master structural workspace JSON manifest configuration files
        const finalizedProjectConfig = {
            total_ms: Math.max(10000, timelineCursorMs),
            captions: captionsTimeline,
            visuals: [],
            audio_tracks: [],
            blurRegions: [],
            render: {
                width: 1080,
                height: 1920,
                fps: 30
            }
        };

        // CONVENTION FIXED: Written directly to config/[safeTitle].json
        const configPath = path.join(projectPath, 'config', `${safeTitle}.json`);
        await fsPromises.writeFile(configPath, JSON.stringify(finalizedProjectConfig, null, 2), 'utf8');
        await syncScriptFromConfig(projectPath, safeTitle, captionsTimeline);

        console.log(`\x1b[32m%s\x1b[0m`, `[Bulk Generator] Successfully initialized and built workspace layout for: "${safeTitle}"`);

        // Finalize SSE data connection streaming pipelines safely
        sendProgressEvent({ stage: 'complete', projectId: safeTitle, message: 'Workspace fully created.' });
        res.end();

    } catch (err) {
        console.error('[Bulk Generator Interruption Critical Fault Error]:', err);
        sendProgressEvent({ stage: 'error', error: err.message });
        res.end();
    }
});

/**
 * POST /api/projects/save-title-image
 * Captures an inbound Base64 string stream from the canvas and saves it as a real physical PNG asset
 */
router.post('/save-title-image', (req, res) => {
    try {
        const { projectId, assetId, imageData } = req.body;

        if (!projectId || !assetId || !imageData) {
            return res.status(400).json({ error: 'Missing baseline payload properties.' });
        }

        const pureBase64Data = imageData.replace(/^data:image\/png;base64,/, "");
        const imagesDirectory = path.join(PROJECTS_DIR, projectId, 'public/images');
        
        ensureDir(imagesDirectory);

        const outputFilePath = path.join(imagesDirectory, `${assetId}.png`);
        fs.writeFileSync(outputFilePath, pureBase64Data, 'base64');

        console.log(`\x1b[32m%s\x1b[0m`, `[Asset Engine] Rendered static overlay file to disk at: ${outputFilePath}`);
        res.json({ success: true, file: `public/images/${assetId}.png` });

    } catch (err) {
        console.error('[Asset Engine Write Fault]:', err);
        res.status(500).json({ error: 'Failed saving title canvas image instance asset.', details: err.message });
    }
});

module.exports = router;
