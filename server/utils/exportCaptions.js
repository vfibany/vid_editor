// server/utils/exportCaptions.js
function msToSrtTimestamp(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const msRem = ms % 1000;
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRem, 3)}`;
}

// Splits a single caption entry into readable sub-cues if it's too long for its duration
function splitIntoReadableCues(caption, opts = {}) {
    const maxCharsPerLine = opts.maxCharsPerLine || 40;
    const maxLines = opts.maxLines || 2;
    const minCueMs = opts.minCueMs || 1000;
    const charsPerSecond = opts.charsPerSecond || 17;

    const maxCharsPerCue = maxCharsPerLine * maxLines;
    const words = caption.text.split(' ');

    // Greedy pack words into chunks under maxCharsPerCue
    const chunks = [];
    let current = '';
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxCharsPerCue && current) {
            chunks.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);

    if (chunks.length === 1) {
        return [{ start_ms: caption.start_ms, end_ms: caption.start_ms + caption.audio_duration_ms, text: chunks[0] }];
    }

    // Distribute duration proportionally to chunk length, respecting a minimum cue duration
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
    let cursor = caption.start_ms;
    const cues = [];
    chunks.forEach((chunk, idx) => {
        const isLast = idx === chunks.length - 1;
        const proportional = Math.max(minCueMs, (chunk.length / totalChars) * caption.audio_duration_ms);
        const end = isLast ? caption.start_ms + caption.audio_duration_ms : cursor + proportional;
        cues.push({ start_ms: cursor, end_ms: end, text: chunk });
        cursor = end;
    });
    return cues;
}

function exportToSrt(captions) {
    const visible = captions
        .filter(c => c.show_captions !== false)
        .sort((a, b) => a.start_ms - b.start_ms);

    let cueIndex = 1;
    let srt = '';

    visible.forEach(caption => {
        const cues = splitIntoReadableCues(caption);
        cues.forEach(cue => {
            srt += `${cueIndex}\n${msToSrtTimestamp(cue.start_ms)} --> ${msToSrtTimestamp(cue.end_ms)}\n${cue.text}\n\n`;
            cueIndex++;
        });
    });

    return srt;
}

function exportToVtt(captions) {
    const srtBody = exportToSrt(captions).replace(/,/g, '.'); // VTT uses . not , for ms
    return `WEBVTT\n\n${srtBody}`;
}

module.exports = { exportToSrt, exportToVtt };