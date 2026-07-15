router.get('/:projectId/export-captions', async (req, res) => {
    const { projectId } = req.params;
    const { format = 'srt', scriptName = 'script' } = req.query;

    const configPath = path.join(__dirname, `../../projects/${projectId}/config/${scriptName}.json`);
    const projectConfig = JSON.parse(await fsPromises.readFile(configPath, 'utf8'));

    const output = format === 'vtt' ? exportToVtt(projectConfig.captions) : exportToSrt(projectConfig.captions);
    const ext = format === 'vtt' ? 'vtt' : 'srt';

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${projectId}.${ext}"`);
    res.send(output);
});