const express = require('express');
const crypto = require('crypto');
const { loadConfig, saveConfig } = require('../utils/projectConfig');

const router = express.Router();

const clampPoint = ([x, y]) => [
  Math.min(1, Math.max(0, x)),
  Math.min(1, Math.max(0, y)),
];

const normalizeRegion = (region) => ({
  ...region,
  points: (region.points || []).map(clampPoint),
});

router.post('/:id/blur-regions', async (req, res) => {
  const { start_ms, end_ms, points, blur_px = 18 } = req.body;

  if (!Array.isArray(points) || points.length < 3) {
    return res.status(400).json({ error: 'points must define a closed polygon (3+ vertices)' });
  }
  if (typeof start_ms !== 'number' || typeof end_ms !== 'number' || end_ms <= start_ms) {
    return res.status(400).json({ error: 'end_ms must be greater than start_ms' });
  }

  try {
    const config = await loadConfig(req.params.id);
    config.blurRegions = Array.isArray(config.blurRegions) ? config.blurRegions : [];

    const region = normalizeRegion({
      id: `blur_${crypto.randomUUID().slice(0, 8)}`,
      start_ms,
      end_ms,
      points,
      blur_px,
    });

    config.blurRegions.push(region);
    config.total_ms = Math.max(config.total_ms || 0, end_ms);

    await saveConfig(req.params.id, config);
    return res.json({ region });
  } catch (err) {
    return res.status(500).json({ error: 'Failed saving blur region', details: err.message });
  }
});

router.put('/:id/blur-regions/:regionId', async (req, res) => {
  try {
    const config = await loadConfig(req.params.id);
    config.blurRegions = Array.isArray(config.blurRegions) ? config.blurRegions : [];

    const idx = config.blurRegions.findIndex((r) => r.id === req.params.regionId);
    if (idx === -1) return res.status(404).json({ error: 'region not found' });

    const { start_ms, end_ms, points, blur_px } = req.body;
    const region = config.blurRegions[idx];

    if (start_ms !== undefined) region.start_ms = start_ms;
    if (end_ms !== undefined) region.end_ms = end_ms;
    if (blur_px !== undefined) region.blur_px = blur_px;
    if (points !== undefined) {
      if (!Array.isArray(points) || points.length < 3) {
        return res.status(400).json({ error: 'points must define a closed polygon (3+ vertices)' });
      }
      region.points = points.map(clampPoint);
    }

    if (typeof region.start_ms !== 'number' || typeof region.end_ms !== 'number' || region.end_ms <= region.start_ms) {
      return res.status(400).json({ error: 'end_ms must be greater than start_ms' });
    }

    config.total_ms = Math.max(config.total_ms || 0, region.end_ms);
    await saveConfig(req.params.id, config);
    return res.json({ region });
  } catch (err) {
    return res.status(500).json({ error: 'Failed updating blur region', details: err.message });
  }
});

router.delete('/:id/blur-regions/:regionId', async (req, res) => {
  try {
    const config = await loadConfig(req.params.id);
    const before = Array.isArray(config.blurRegions) ? config.blurRegions.length : 0;

    config.blurRegions = (config.blurRegions || []).filter((r) => r.id !== req.params.regionId);
    if (config.blurRegions.length === before) {
      return res.status(404).json({ error: 'region not found' });
    }

    await saveConfig(req.params.id, config);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed deleting blur region', details: err.message });
  }
});

module.exports = router;
