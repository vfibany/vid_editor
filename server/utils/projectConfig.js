const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const PROJECTS_DIR = path.join(__dirname, '../../projects');

const getConfigPath = (projectId) => path.join(PROJECTS_DIR, projectId, 'config', `${projectId}.json`);

const loadConfig = async (projectId) => {
  const configPath = getConfigPath(projectId);
  const raw = await fsPromises.readFile(configPath, 'utf8');
  return JSON.parse(raw);
};

const saveConfig = async (projectId, config) => {
  const configPath = getConfigPath(projectId);
  await fsPromises.mkdir(path.dirname(configPath), { recursive: true });
  await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
};

const configExists = (projectId) => fs.existsSync(getConfigPath(projectId));

module.exports = {
  PROJECTS_DIR,
  getConfigPath,
  loadConfig,
  saveConfig,
  configExists,
};
