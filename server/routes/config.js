const express = require('express');
const router = express.Router();
const fs = require('fs');
const { getConfigPath } = require('../utils/projectConfig');

// GET /api/config?projectId=xxx
router.get('/', (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

  const configPath = getConfigPath(projectId);
  if (!fs.existsSync(configPath)) {
    return res.status(404).json({ error: 'Project configuration matrix not found' });
  }

  try {
    const data = fs.readFileSync(configPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed reading setup configurations', details: err.message });
  }
});

// POST /api/config
router.post('/', (req, res) => {
  const { projectId, config } = req.body;
  if (!projectId || !config) return res.status(400).json({ error: 'Missing required parameters' });

  const configPath = getConfigPath(projectId);
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed saving target deployment config', details: err.message });
  }
});

module.exports = router;
