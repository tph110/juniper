// File: /api/voice-token.js
// Mints a short-lived Deepgram access token so the browser can stream mic
// audio straight to Deepgram's live STT WebSocket without ever seeing the
// real API key. With no DEEPGRAM_API_KEY set, responds { demo: true } so the
// browser falls back to its built-in SpeechRecognition (demo mode).

const GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';
const MODEL = process.env.DEEPGRAM_STT_MODEL || 'nova-3';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
        // Not an error: tells the browser to use its built-in recognition.
        return res.status(200).json({ demo: true });
    }

    try {
        const upstream = await fetch(GRANT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'application/json',
            },
            // Max TTL, so one token comfortably covers a whole consultation.
            body: JSON.stringify({ ttl_seconds: 3600 }),
        });

        const data = await upstream.json().catch(() => null);
        if (!upstream.ok || !data?.access_token) {
            console.error('Deepgram grant error:', upstream.status, JSON.stringify(data)?.slice(0, 300));
            return res.status(502).json({ error: 'Could not mint voice token' });
        }

        res.status(200).json({
            accessToken: data.access_token,
            expiresIn: data.expires_in,
            model: MODEL,
        });
    } catch (err) {
        console.error('Voice token handler error:', err);
        res.status(502).json({ error: 'Voice token request failed' });
    }
}
