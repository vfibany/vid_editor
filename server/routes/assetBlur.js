const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const { PROJECTS_DIR } = require('../utils/projectConfig');

const router = express.Router();

const parsePoints = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

const clampPoint = ([x, y]) => [
  Math.min(1, Math.max(0, Number(x))),
  Math.min(1, Math.max(0, Number(y))),
];

router.get('/blur', (req, res) => {
  const {
    projectId,
    relativePath,
    duration_ms,
    width,
    height,
    fps = 30,
    start_ms,
    end_ms,
    blur_px = 18,
    points,
  } = req.query;

  const parsedDuration = Number(duration_ms);
  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const parsedFps = Number(fps);
  const parsedStart = Number(start_ms);
  const parsedEnd = Number(end_ms);
  const parsedBlur = Number(blur_px);
  const parsedPoints = parsePoints(points);

  if (!projectId || !relativePath || !Number.isFinite(parsedDuration) || !Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight)) {
    return res.status(400).json({ error: 'Missing required blur export parameters' });
  }
  if (!Array.isArray(parsedPoints) || parsedPoints.length < 3) {
    return res.status(400).json({ error: 'points must define a closed polygon (3+ vertices)' });
  }
  if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd) || parsedEnd <= parsedStart) {
    return res.status(400).json({ error: 'end_ms must be greater than start_ms' });
  }

  const projectDir = path.join(PROJECTS_DIR, projectId);
  const sourcePath = path.join(projectDir, 'public', relativePath);

  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'source asset not found' });
  }

  const ext = path.extname(relativePath) || path.extname(sourcePath) || '.mov';
  const baseName = path.basename(relativePath, ext);
  const outputRelativePath = path.join(path.dirname(relativePath), `${baseName}_blur.mov`).replace(/\\/g, '/');
  const outputPath = path.join(projectDir, 'public', outputRelativePath);

  const scriptPath = path.join(__dirname, '../python/blur_asset.py');
  const pythonPath = path.join(__dirname, '../python/.venv/bin/python');

  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ error: 'blur processor script missing' });
  }
  if (!fs.existsSync(pythonPath)) {
    return res.status(500).json({ error: 'python virtual environment missing' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ stage: 'loading', message: 'Starting Python blur processor...' });

  const child = spawn(pythonPath, [
    '-u',
    scriptPath,
    '--input', sourcePath,
    '--output', outputPath,
    '--width', String(parsedWidth),
    '--height', String(parsedHeight),
    '--fps', String(parsedFps),
    '--start-ms', String(parsedStart),
    '--end-ms', String(parsedEnd),
    '--blur-px', String(parsedBlur),
    '--points', JSON.stringify(parsedPoints.map(clampPoint)),
  ]);

  console.log('[blur export] spawning python command:', {
    cwd: path.join(__dirname, '../../server/python'),
    pythonPath,
    scriptPath,
    args: [
      '-u',
      scriptPath,
      '--input', sourcePath,
      '--output', outputPath,
      '--width', String(parsedWidth),
      '--height', String(parsedHeight),
      '--fps', String(parsedFps),
      '--start-ms', String(parsedStart),
      '--end-ms', String(parsedEnd),
      '--blur-px', String(parsedBlur),
      '--points', JSON.stringify(parsedPoints.map(clampPoint)),
    ],
  });

  let stderrBuffer = '';

  child.stdout.on('data', (data) => {
    const text = data.toString();
    text.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed === 'READY') {
        sendEvent({ stage: 'processing', message: 'Python blur engine loaded' });
        return;
      }

      const match = trimmed.match(/^FRAME:(\d+)\/(\d+)$/);
      if (match) {
        sendEvent({ stage: 'processing', frame: Number(match[1]), total: Number(match[2]), message: `Working frame ${match[1]} of ${match[2]}` });
        return;
      }

      const progressMatch = trimmed.match(/^PROGRESS:([\d.]+)%$/);
      if (progressMatch) {
        sendEvent({ stage: 'processing', message: `Progress ${progressMatch[1]}%` });
        return;
      }

      if (trimmed === 'MUXING') {
        sendEvent({ stage: 'muxing', message: 'Finalizing silent mov output' });
        return;
      }

      if (trimmed === 'DONE') {
        sendEvent({ stage: 'complete', message: 'Blur export complete', outputRelativePath });
        return;
      }

      sendEvent({ stage: 'processing', message: trimmed });
    });
  });

  child.stderr.on('data', (data) => {
    stderrBuffer += data.toString();
  });

  child.on('close', (code) => {
    if (code !== 0) {
      sendEvent({ stage: 'failed', error: stderrBuffer.trim() || `python exited with code ${code}` });
    }
    res.end();
  });

  req.on('close', () => {
    if (!child.killed) child.kill();
  });
});

module.exports = router;
