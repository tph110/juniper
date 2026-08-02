// File: /api/deepgram-token.js
// Mints a short-lived Deepgram token so the secret DEEPGRAM_API_KEY never
// reaches the browser. The frontend opens a streaming WebSocket directly to
// Deepgram with it (audio never passes through Vercel). With no key set,
// returns { demo: true } and the app falls back to the browser's built-in
// speech recognition where available.

export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = (process.env.DEEPGRAM_API_KEY || '').trim();
    if (!apiKey) {
        return res.status(200).json({ demo: true });
    }

    try {
        // ttl_seconds only needs to outlive the WebSocket handshake; the live
        // stream stays open past expiry once connected.
        const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ttl_seconds: 120 }),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error('Deepgram grant error:', response.status, errText.slice(0, 300));
            if (response.status === 403) {
                return res.status(403).json({
                    error: 'This Deepgram API key cannot mint temporary tokens. Create a key with the "Member" role in the Deepgram Console.',
                });
            }
            return res.status(response.status).json({ error: `Deepgram token failed (${response.status})` });
        }

        const data = await response.json();
        return res.status(200).json({ token: data.access_token, expiresIn: data.expires_in });
    } catch (err) {
        console.error('Deepgram token error:', err);
        return res.status(500).json({ error: 'Token generation failed' });
    }
}
