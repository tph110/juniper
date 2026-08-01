// File: /api/chat.js
// Streams the AI patient's next reply as plain text. The browser accumulates
// chunks, splits them into sentences and feeds them to TTS as they complete.
// With no OPENROUTER_API_KEY set, falls back to the scenario's canned demo
// replies (streamed word-by-word) so the whole app works without any keys.

import { scenario } from '../scenarios/margaret-hughes.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.LLM_MODEL || 'moonshotai/kimi-k2.6';

const CONVERSATION_RULES = `RESPONSE RULES:
- Reply as Margaret only, with the words she speaks. No stage directions, no quotes, no narration, no markdown.
- 1 to 3 short sentences. Never more.`;

function buildSystemPrompt(stageId) {
    const stage = scenario.stages.find((s) => s.id === stageId) || scenario.stages[0];
    return [scenario.caseSheet, stage.brief, CONVERSATION_RULES].join('\n\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Demo mode: pick the next canned line for this stage based on how many
// patient replies have already happened in it, and stream it word-by-word.
async function streamDemoReply(res, stageId, history) {
    const lines = scenario.demoReplies[stageId] || [];
    const fallback = `I'm not too sure what to say to that, doctor. What do you need to know?`;
    const patientTurns = history.filter((m) => m.role === 'patient').length;
    const line = lines.length ? lines[Math.min(patientTurns, lines.length - 1)] : fallback;

    for (const word of line.split(' ')) {
        res.write(word + ' ');
        await sleep(35);
    }
    res.end();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { stageId, history } = req.body || {};
    if (!stageId || !Array.isArray(history)) {
        return res.status(400).json({ error: 'stageId and history are required' });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return streamDemoReply(res, stageId, history);
    }

    const messages = [
        { role: 'system', content: buildSystemPrompt(stageId) },
        ...history.slice(-30).map((m) => ({
            role: m.role === 'doctor' ? 'user' : 'assistant',
            content: m.text,
        })),
    ];

    try {
        const upstream = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL,
                messages,
                stream: true,
                temperature: 0.6,
                // Roomy cap + reasoning off: Kimi is a reasoning model, and if
                // it "thinks" it can spend the whole token budget before any
                // visible words, returning an empty reply.
                max_tokens: 800,
                reasoning: { enabled: false },
            }),
        });

        if (!upstream.ok) {
            const detail = await upstream.text().catch(() => '');
            console.error('OpenRouter error', upstream.status, detail);
            res.write(`I'm sorry doctor, I lost my train of thought. Could you say that again?`);
            return res.end();
        }

        // Parse the SSE stream and forward only the text deltas.
        const decoder = new TextDecoder();
        let buffer = '';
        let wroteAny = false;
        for await (const chunk of upstream.body) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep any partial line for the next chunk
            for (const line of lines) {
                const data = line.replace(/^data: ?/, '').trim();
                if (!data || data === '[DONE]' || !line.startsWith('data:')) continue;
                try {
                    const parsed = JSON.parse(data);
                    if (parsed?.error) console.error('OpenRouter mid-stream error:', parsed.error);
                    const delta = parsed?.choices?.[0]?.delta?.content;
                    if (delta) { res.write(delta); wroteAny = true; }
                } catch (_) { /* ignore malformed keepalive lines */ }
            }
        }

        // Providers occasionally return an empty stream. Never pass silence on
        // to the student — retry once without streaming, then fall back to an
        // in-character line.
        if (!wroteAny) {
            console.error('Empty stream from OpenRouter; retrying non-streaming');
            const retry = await fetch(OPENROUTER_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ model: MODEL, messages, stream: false, temperature: 0.6, max_tokens: 800, reasoning: { enabled: false } }),
            }).then((r) => r.json()).catch(() => null);
            const text = retry?.choices?.[0]?.message?.content;
            if (!text) console.error('Retry also empty. Response shape:', JSON.stringify(retry)?.slice(0, 600));
            res.write(text || `Sorry, doctor — my mind went completely blank for a second there. What was it you asked?`);
        }
        res.end();
    } catch (err) {
        console.error('Chat handler error:', err);
        if (!res.headersSent) res.status(502);
        res.end();
    }
}
