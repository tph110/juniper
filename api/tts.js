// File: /api/tts.js
// Text-to-speech via MiniMax (international endpoint). Returns raw MP3 bytes.
// With no MINIMAX_API_KEY set, responds 424 so the browser falls back to the
// built-in speechSynthesis voice (demo mode).

const MINIMAX_URL = 'https://api.minimax.io/v1/t2a_v2';
const MODEL = process.env.TTS_MODEL || 'speech-02-turbo';

// A MiniMax API key is a JWT whose payload embeds the account's GroupID.
// Deriving it from the key means it can never mismatch (the "token not match
// group" error) — MINIMAX_GROUP_ID is only a fallback for unusual keys.
function groupIdFromKey(key) {
    try {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf-8'));
        return payload.GroupID || payload.group_id || null;
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text, voiceId } = req.body || {};
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'text is required' });
    }

    const apiKey = (process.env.MINIMAX_API_KEY || '').trim();
    const groupId = groupIdFromKey(apiKey) || (process.env.MINIMAX_GROUP_ID || '').trim();
    if (!apiKey || !groupId) {
        // Not an error: tells the browser to use its built-in voice (demo mode).
        // 200 so it doesn't pollute production logs as a failure.
        return res.status(200).json({ demo: true });
    }

    try {
        const upstream = await fetch(`${MINIMAX_URL}?GroupId=${encodeURIComponent(groupId)}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL,
                text: text.slice(0, 2000),
                stream: false,
                voice_setting: {
                    voice_id: voiceId || 'Wise_Woman',
                    speed: 1.1,
                    vol: 1.0,
                    pitch: 0,
                },
                audio_setting: {
                    sample_rate: 32000,
                    bitrate: 128000,
                    format: 'mp3',
                    channel: 1,
                },
            }),
        });

        const data = await upstream.json().catch(() => null);
        const hex = data?.data?.audio;
        if (!upstream.ok || !hex) {
            const msg = data?.base_resp?.status_msg || `MiniMax HTTP ${upstream.status}`;
            console.error('MiniMax TTS error:', msg);
            return res.status(502).json({ error: msg });
        }

        const audio = Buffer.from(hex, 'hex');
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).end(audio);
    } catch (err) {
        console.error('TTS handler error:', err);
        res.status(502).json({ error: 'TTS request failed' });
    }
}
