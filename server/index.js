const express = require('express');
const cors = require('cors');
const path = require('path');

const projectsRouter = require('./routes/projects');
const configRouter = require('./routes/config');
const blurRegionsRouter = require('./routes/blurRegions');
const assetBlurRouter = require('./routes/assetBlur');
const assetsRouter = require('./routes/assets');
const effectsRouter = require('./routes/effects');
const renderRouter = require('./routes/render');
const audioRouter = require('./routes/audio');

const app = express();
const PORT = 4000;

// Middleware configuration
app.use(cors());
app.use(express.json());

// // 🚀 FIX: Swap out the default limited parser for an expanded limit configuration
// app.use(express.json({ limit: '100mb' }));
// app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Serve static project outputs safely
app.use('/projects', express.static(path.join(__dirname, '../projects')));

// Core Routes Mount Routing Matrix
app.use('/api/projects', projectsRouter);
app.use('/api/projects', blurRegionsRouter);
app.use('/api/config', configRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/assets', assetBlurRouter);
app.use('/api/effects', effectsRouter);
app.use('/api/render', renderRouter);
app.use('/api/audio', audioRouter);

// Fallback Unhandled API Path Block
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Endpoint ${req.originalUrl} not found on processing rig.` });
});

app.listen(PORT, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `🚀 Express backend processing rig engine online at http://localhost:${PORT}`);
});
