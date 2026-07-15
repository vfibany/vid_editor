// server/utils/scriptSync.js
const fsPromises = require('fs').promises;
const path = require('path');

/**
 * Renders a captions array back into [speaker:tone] script.md format,
 * ordered by timeline position (start_ms) — not insertion order.
 */
function serializeCaptionsToScript(captions) {
    const ordered = [...captions].sort((a, b) => {
        if (a.start_ms !== b.start_ms) return a.start_ms - b.start_ms;
        return (a.lineIndex || 0) - (b.lineIndex || 0); // stable tiebreak
    });

    return ordered.map(c => {
        const speaker = c.speaker || 'narrator';
        const tone = c.tone || 'neutral';
        const cleanText = (c.text || '').replace(/\r?\n/g, ' ').trim();

        if (speaker === 'narrator' && tone === 'neutral') return cleanText;
        if (tone === 'neutral') return `[${speaker}] ${cleanText}`;
        return `[${speaker}:${tone}] ${cleanText}`;
    }).join('\n') + '\n';
}

/**
 * Writes the derived script.md for a project, given its current captions.
 * Call this any time config.json's captions array is mutated —
 * add, edit, delete, or reorder.
 */
async function syncScriptFromConfig(projectPath, scriptName, captions) {
    const scriptText = serializeCaptionsToScript(captions || []);
    const scriptFilePath = path.join(projectPath, `scripts/${scriptName}.md`);
    await fsPromises.writeFile(scriptFilePath, scriptText, 'utf8');
}

module.exports = { serializeCaptionsToScript, syncScriptFromConfig };