const path = require('path');
const fs = require('fs');

const TONE_PRESETS = {
  neutral: { exaggeration: 1.0, cfg: 1.0 },
  slow: { exaggeration: 0.78, cfg: 1.12 },
  loud: { exaggeration: 1.22, cfg: 0.84 },
  whisper: { exaggeration: 0.68, cfg: 1.18 },
  exaggerated: { exaggeration: 1.45, cfg: 0.72 },
  exagerrated: { exaggeration: 1.45, cfg: 0.72 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveExpressiveTuning = ({ tone, exaggerationScale = 1.0, cfgWeight = 0.3 }) => {
  const toneKey = String(tone || 'neutral').toLowerCase();
  const preset = TONE_PRESETS[toneKey] || TONE_PRESETS.neutral;

  return {
    tone: toneKey,
    exaggeration_scale: clamp(toNumber(exaggerationScale, 1.0) * preset.exaggeration, 0.05, 3.0),
    cfg_weight: clamp(toNumber(cfgWeight, 0.3) * preset.cfg, 0.05, 2.0),
  };
};

const getSystemNarratorFallback = (projectPath) => {
  const possiblePaths = [
    path.join(__dirname, '../python/narrator.wav'),
    path.join(__dirname, '../python/voices/narrator.wav'),
    path.join(projectPath, 'voices/narrator.wav'),
  ];

  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
};

const resolveReferencePath = (projectPath, speaker) => {
  if (speaker && speaker !== 'narrator') {
    const candidate = path.join(projectPath, `voices/${speaker}/neutral.wav`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return getSystemNarratorFallback(projectPath);
};

module.exports = {
  resolveExpressiveTuning,
  resolveReferencePath,
  getSystemNarratorFallback,
};
