// Text → viseme timeline.
//
// Real lip-sync needs to know which SOUND is being made, not how loud it is.
// MiniMax doesn't return phoneme timestamps, so we estimate them: map the
// spoken text to a sequence of mouth shapes, weight each by how long that
// sound typically lasts, then stretch the sequence to the clip's real
// duration (which we know once the audio is decoded).
//
// It can't know that she paused mid-sentence, so it drifts a little on long
// lines — but it puts the right shape on the right sound, which is what the
// eye actually reads as speech. Swapping in a TTS that returns real
// timestamps later means replacing only this file's output.

// The five shapes the portrait can draw, plus how long each tends to be held.
const LETTER_VISEME = {
    a: ['open', 1.6],
    e: ['wide', 1.3], i: ['wide', 1.3], y: ['wide', 1.1],
    o: ['round', 1.5], u: ['round', 1.4],
    m: ['closed', 0.9], b: ['closed', 0.8], p: ['closed', 0.8],
    w: ['round', 1.0], q: ['round', 0.9],
    f: ['half', 0.9], v: ['half', 0.9],
    // Everything else is a consonant that barely parts the lips.
    c: ['half', 0.8], d: ['half', 0.8], g: ['half', 0.8], h: ['half', 0.7],
    j: ['half', 0.8], k: ['half', 0.8], l: ['half', 0.9], n: ['half', 0.8],
    r: ['half', 0.9], s: ['half', 0.9], t: ['half', 0.8], x: ['half', 0.9],
    z: ['half', 0.9],
};

const WORD_GAP = ['closed', 0.6]; // lips settle between words

export function textToVisemeTimeline(text, durationSeconds) {
    if (!text || !(durationSeconds > 0)) return [];

    // 1. Letters → weighted viseme sequence.
    const raw = [];
    for (const ch of text.toLowerCase()) {
        if (ch >= 'a' && ch <= 'z') {
            const entry = LETTER_VISEME[ch];
            if (entry) raw.push(entry);
        } else if (/\s|[,.;:!?—–-]/.test(ch)) {
            raw.push(WORD_GAP);
        }
    }
    if (!raw.length) return [];

    // 2. Collapse runs of the same shape ("ee" is one longer wide, not two).
    const merged = [];
    for (const [viseme, weight] of raw) {
        const last = merged[merged.length - 1];
        // Repeats add less than the first instance — a doubled letter
        // lengthens the sound, it doesn't double it.
        if (last && last.v === viseme) last.w += weight * 0.5;
        else merged.push({ v: viseme, w: weight });
    }

    // 3. Stretch the weights to fill the clip's real duration.
    const total = merged.reduce((sum, m) => sum + m.w, 0);
    const timeline = [];
    let t = 0;
    for (const m of merged) {
        timeline.push({ t, v: m.v });
        t += (m.w / total) * durationSeconds;
    }
    // Close the mouth as the clip ends rather than freezing mid-vowel.
    timeline.push({ t: Math.max(0, durationSeconds - 0.06), v: 'closed' });
    return timeline;
}
