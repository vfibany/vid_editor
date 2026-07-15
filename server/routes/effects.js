const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); // 💡 Added for proactive path verification

const PROJECTS_DIR = path.join(__dirname, '../../projects');

// GET /api/effects/apply-comic-fx
router.get('/apply-comic-fx', (req, res) => {
  const { projectId, assetPath } = req.query;
  if (!projectId || !assetPath) {
    return res.status(400).json({ error: 'Missing stream references' });
  }

  // SSE Stream Configuration Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Strip leading slashes to prevent path.join from treating it as root
  const cleanAssetPath = assetPath.replace(/^\/+/, '');
  const projectPath = path.join(PROJECTS_DIR, projectId);
  const inputAbsolute = path.join(projectPath, 'public', cleanAssetPath);

  // Inside your Express SSE handler logic block:
  const ext = path.extname(inputAbsolute);
  const baseName = path.basename(inputAbsolute, ext);
  const dirName = path.dirname(inputAbsolute);

  const outputAbsolute = path.join(dirName, `${baseName}_comic${ext}`);

  // Resolve engine script paths
  const scriptPath = path.join(__dirname, '../python/comic_fx.py');
  const venvPythonPath = path.join(__dirname, '../python/.venv/bin/python');

  // 💡 Guard 1: Verify the source video asset actually exists on disk
  if (!fs.existsSync(inputAbsolute)) {
    res.write(`data: ${JSON.stringify({ status: 'failed', error: `Input video asset not found at target lookups: ${inputAbsolute}` })}\n\n`);
    return res.end();
  }

  // 💡 Guard 2: Verify the Python script path is correctly aligned
  if (!fs.existsSync(scriptPath)) {
    res.write(`data: ${JSON.stringify({ status: 'failed', error: `Processing script missing! Check path resolution: ${scriptPath}` })}\n\n`);
    return res.end();
  }

  // 💡 Guard 3: Verify the Python Virtual Environment interpreter exists
  if (!fs.existsSync(venvPythonPath)) {
    res.write(`data: ${JSON.stringify({ status: 'failed', error: `Python virtual environment binary not found at: ${venvPythonPath}` })}\n\n`);
    return res.end();
  }

  // Accumulate error messages from Python's stderr to pass directly back to the UI layout
  let stderrBuffer = '';

  // Spawns Python with '-u' to force unbuffered stdout lines
  const pythonProcess = spawn(venvPythonPath, ['-u', scriptPath, inputAbsolute, outputAbsolute]);

  pythonProcess.stdout.on('data', (data) => {
    const textOutput = data.toString();

    // Matches floating point strings like "12.5%" or "85%"
    const progressMatch = textOutput.match(/([\d.]+)%/);
    if (progressMatch) {
      const progressPercent = Math.round(parseFloat(progressMatch[1]));
      res.write(`data: ${JSON.stringify({ status: 'processing', progress: progressPercent })}\n\n`);
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    const errorString = data.toString();
    stderrBuffer += errorString;
    console.error(`[Python FX Error Logger]: ${errorString}`);
  });

  pythonProcess.on('close', (code) => {
    if (code === 0) {
      res.write(`data: ${JSON.stringify({ status: 'complete' })}\n\n`);
    } else {
      // 💡 Clean Transmission: Pass the exact CLI/argparse error back to the frontend
      const finalError = stderrBuffer.trim() || `Python exited with code ${code}`;
      res.write(`data: ${JSON.stringify({ status: 'failed', error: finalError })}\n\n`);
    }
    res.end();
  });

  // Kill the Python processing thread safely if the user abandons the web layout panel
  req.on('close', () => {
    if (!pythonProcess.killed) {
      console.log('Client disconnected. Killing Python process matrix safely...');
      pythonProcess.kill();
    }
  });
});

module.exports = router;