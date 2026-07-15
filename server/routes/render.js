const express = require('express');
const router = express.Router();
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '../../');
const CLIENT_ROOT = path.join(PROJECT_ROOT, 'client');
const PROJECTS_BASE_DIR = path.join(PROJECT_ROOT, 'projects');

router.post('/', async (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'Missing target field requirement: projectId' });
  }

  const projectDir = path.join(PROJECTS_BASE_DIR, projectId);
  const outputVideoPath = path.join(projectDir, 'output_render.mp4');

  if (!fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Target project directory matrix does not exist on disk.' });
  }

  const sourceConfigPath = path.join(projectDir, 'config', `${projectId}.json`);
  const renderPropsPath = path.join(projectDir, 'config', `render_props_tmp.json`);

  try {
    const rawConfigData = fs.readFileSync(sourceConfigPath, 'utf8');
    const configObj = JSON.parse(rawConfigData);
    configObj.projectId = projectId;

    fs.writeFileSync(renderPropsPath, JSON.stringify(configObj, null, 2), 'utf8');
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to process and build composition configurations.' });
  }

  // 🚀 OPTIMIZATION MATRIX: Force strict concurrency limits and visual frame caching parameters
  // This tells Chromium how to seek into deep frames reliably without getting choked out by file sizes.
  const remotionCommand = [
    "pnpm exec remotion render",
    "src/remotion-entry.tsx",
    "RenderEngine",
    `"${outputVideoPath}"`,
    `--props="${renderPropsPath}"`,
    "--concurrency=1",      // One frame at a time
    "--log=verbose",        // More Remotion logs
    "--gl=angle",
    "--overwrite"
  ].join(" ");


  console.log(`🎬 Initializing Remotion compilation core via pnpm inside client directory...`);
  console.log(`Executing: ${remotionCommand}`);

  // 🚀 CRITICAL FIX: Expand maxBuffer to 50MB to stop long renders from auto-killing themselves
  exec(remotionCommand, { cwd: CLIENT_ROOT, maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
    if (fs.existsSync(renderPropsPath)) {
      fs.unlinkSync(renderPropsPath);
    }

    if (error) {
      console.error(`❌ Remotion CLI Engine Crash:\n`, stderr || error.message);
      return res.status(500).json({
        error: 'Video pipeline compilation error.',
        details: stderr || error.message
      });
    }

    console.log(`📦 Render complete! Output cleanly written to:\n${outputVideoPath}`);
    return res.json({
      success: true,
      outputPath: outputVideoPath
    });
  });
});

module.exports = router;