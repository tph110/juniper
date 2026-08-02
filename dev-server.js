// Local dev server for Juniper. Serves the static frontend and mounts the
// /api/* handlers with a minimal Vercel-compatible req/res shim, so the same
// handler files run locally and on Vercel unchanged.
//
//   node dev-server.js        → http://localhost:4620

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 4620;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.mp3': 'audio/mpeg',
};

const apiHandlers = {
    '/api/chat': (await import('./api/chat.js')).default,
    '/api/tts': (await import('./api/tts.js')).default,
    '/api/voice-token': (await import('./api/voice-token.js')).default,
};

function shimRes(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(obj));
        return res;
    };
    return res;
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf-8');
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    const handler = apiHandlers[url.pathname];
    if (handler) {
        req.body = await readBody(req);
        try {
            await handler(req, shimRes(res));
        } catch (err) {
            console.error(`Handler ${url.pathname} threw:`, err);
            if (!res.headersSent) { res.statusCode = 500; }
            res.end();
        }
        return;
    }

    // Static files, with path traversal guarded by normalize + prefix check.
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const resolved = normalize(join(ROOT, filePath));
    if (!resolved.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }

    try {
        const content = await readFile(resolved);
        res.setHeader('Content-Type', MIME[extname(resolved)] || 'application/octet-stream');
        res.end(content);
    } catch {
        res.statusCode = 404;
        res.end('Not found');
    }
}).listen(PORT, () => {
    console.log(`Juniper dev server → http://localhost:${PORT}`);
    console.log(`LLM: ${process.env.OPENROUTER_API_KEY ? 'OpenRouter (' + (process.env.LLM_MODEL || 'moonshotai/kimi-k2.6') + ')' : 'DEMO MODE (no OPENROUTER_API_KEY)'}`);
    console.log(`TTS: ${process.env.MINIMAX_API_KEY ? 'MiniMax' : 'DEMO MODE (browser voice — no MINIMAX_API_KEY)'}`);
    console.log(`STT: ${process.env.DEEPGRAM_API_KEY ? 'Deepgram (' + (process.env.DEEPGRAM_STT_MODEL || 'nova-3') + ')' : 'DEMO MODE (browser speech recognition — no DEEPGRAM_API_KEY)'}`);
});
