const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const https = require('https'); // Native Node module for secure streaming downloads

const PROJECTS_DIR = path.join(__dirname, '../../projects');

// Setup Dynamic Storage Router mapping for Multer files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.query.projectId || req.body.projectId;
    
    if (!projectId) {
      return cb(new Error('Missing projectId query parameter on deployment upload session.'));
    }

    let folder = 'public/images';
    if (file.mimetype.startsWith('video/')) folder = 'public/video';
    if (file.mimetype.startsWith('audio/')) folder = 'public/audio';

    const targetDir = path.join(PROJECTS_DIR, projectId, folder);
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// GET /api/assets?projectId=xxx -> Scans and groups public folders
router.get('/', (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'Missing projectId' });

  const projectPublicPath = path.join(PROJECTS_DIR, projectId, 'public');
  if (!fs.existsSync(projectPublicPath)) return res.json([]);

  const assetList = [];
  const categories = ['video', 'audio', 'images'];

  categories.forEach((cat) => {
    const catPath = path.join(projectPublicPath, cat);
    if (fs.existsSync(catPath)) {
      const files = fs.readdirSync(catPath);
      files.forEach((file) => {
        if (file === '.DS_Store') return;
        const fullPath = path.join(catPath, file);
        const stats = fs.statSync(fullPath);
        
        assetList.push({
          name: file,
          relativePath: `${cat}/${file}`,
          type: cat === 'images' ? 'image' : cat,
          size: stats.size
        });
      });
    }
  });

  res.json(assetList);
});

// POST /api/assets/upload
router.post('/upload', upload.array('assets'), (req, res) => {
  res.json({ success: true, message: 'Assets written to processing deck safely' });
});

// POST /api/assets/download-url -> Server-side download to bypass CORS blocks
router.post('/download-url', (req, res) => {
  const projectId = req.query.projectId || req.body.projectId;
  const { url } = req.body;

  if (!projectId || !url) {
    return res.status(400).json({ error: 'Missing projectId or target file URL parameter.' });
  }

  const downloadStream = (targetUrl) => {
    https.get(targetUrl, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadStream(response.headers.location);
      }

      if (response.statusCode !== 200) {
        return res.status(response.statusCode).json({ error: `Server rejected remote resource query: ${response.statusCode}` });
      }

      const contentType = response.headers['content-type'] || '';
      let folder = 'images';
      if (contentType.startsWith('video/')) folder = 'video';
      if (contentType.startsWith('audio/')) folder = 'audio';

      const urlFilename = url.split('/').pop().split('?')[0] || `downloaded_asset_${Date.now()}.gif`;
      const targetDir = path.join(PROJECTS_DIR, projectId, 'public', folder);
      
      fs.mkdirSync(targetDir, { recursive: true });
      const targetFilePath = path.join(targetDir, urlFilename);

      const fileWriter = fs.createWriteStream(targetFilePath);
      response.pipe(fileWriter);

      fileWriter.on('finish', () => {
        fileWriter.close();
        res.json({ success: true, message: 'Remote asset downloaded successfully', filename: urlFilename });
      });

      fileWriter.on('error', (err) => {
        fs.unlink(targetFilePath, () => {});
        res.status(500).json({ error: 'Stream write error encountered during asset storage', details: err.message });
      });

    }).on('error', (err) => {
      res.status(500).json({ error: 'Network fetch operations completely rejected target link request.', details: err.message });
    });
  };

  downloadStream(url);
});

// POST /api/assets/rename -> Updates file system AND deep refactors references in config.json
router.post('/rename', (req, res) => {
  const { projectId, oldRelativePath, newRelativePath } = req.body;
  if (!projectId || !oldRelativePath || !newRelativePath) {
    return res.status(400).json({ error: 'Missing deployment parameters for refactor matrix' });
  }

  const projectRoot = path.join(PROJECTS_DIR, projectId);
  const oldFilePath = path.join(projectRoot, 'public', oldRelativePath);
  const newFilePath = path.join(projectRoot, 'public', newRelativePath);

  try {
    if (!fs.existsSync(oldFilePath)) return res.status(404).json({ error: 'Source target file missing' });

    fs.mkdirSync(path.dirname(newFilePath), { recursive: true });
    fs.renameSync(oldFilePath, newFilePath);

    const configPath = path.join(projectRoot, 'config', `${projectId}.json`);
    if (fs.existsSync(configPath)) {
      let configData = fs.readFileSync(configPath, 'utf8');
      
      const matchOld = `public/${oldRelativePath}`;
      const matchNew = `public/${newRelativePath}`;
      
      configData = configData.split(matchOld).join(matchNew);
      fs.writeFileSync(configPath, configData, 'utf8');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed executing asset path refactor operations', details: err.message });
  }
});

router.post('/delete', (req, res) => {
  const { projectId, relativePath } = req.body;
  if (!projectId || !relativePath) {
    return res.status(400).json({ error: 'Missing deployment parameters for asset destruction matrix' });
  }

  const filePath = path.join(PROJECTS_DIR, projectId, 'public', relativePath);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.json({ success: true, message: 'Asset purged from storage deck successfully.' });
    } else {
      return res.status(404).json({ error: 'Target file not found on disk filesystem.' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed executing physical file destruction pipelines', details: err.message });
  }
});

// FIX: GET /api/assets/serve -> Manual HTTP Range Streaming Architecture for safe browser seeking
router.get('/serve', (req, res) => {
  const { projectId, relativePath } = req.query;
  if (!projectId || !relativePath) {
    return res.status(400).json({ error: 'Missing serving parameters' });
  }

  const filePath = path.join(PROJECTS_DIR, projectId, 'public', relativePath);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Requested source binary file is missing from drive' });
  }

  const stat = fs.statSync(filePath);
  const totalFileSize = stat.size;
  const rangeHeader = req.headers.range;

  // Resolve Content-Type metadata cleanly
  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.mp4') contentType = 'video/mp4';
  if (ext === '.mov' || ext === '.qt') contentType = 'video/quicktime';
  if (ext === '.mp3') contentType = 'audio/mpeg';
  if (ext === '.wav') contentType = 'audio/wav';
  if (ext === '.png') contentType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  if (ext === '.gif') contentType = 'image/gif';
  if (ext === '.webp') contentType = 'image/webp';

  // If the browser requests discrete video buffer byte segments
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const startByte = parseInt(parts[0], 10);
    const endByte = parts[1] ? parseInt(parts[1], 10) : totalFileSize - 1;

    if (startByte >= totalFileSize) {
      res.setHeader('Content-Range', `bytes */${totalFileSize}`);
      return res.status(416).send('Requested range out of bounds.');
    }

    const chunkLength = (endByte - startByte) + 1;
    const readStream = fs.createReadStream(filePath, { start: startByte, end: endByte });

    res.writeHead(206, {
      'Content-Range': `bytes ${startByte}-${endByte}/${totalFileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkLength,
      'Content-Type': contentType,
    });

    readStream.pipe(res);
  } else {
    // Standard streaming fallback for full assets/images
    res.writeHead(200, {
      'Content-Length': totalFileSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;