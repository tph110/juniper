// File: /api/grade.js
// Grades a student's drill response against the skill's explicit criteria.
//
// Two design choices carry most of the reliability:
//
//  1. Per-criterion, not holistic. The model judges each criterion separately
//     and must quote the student's own words as evidence. It cannot mark a
//     criterion met without pointing at where — which is the main guard
//     against invented judgements.
//
//  2. Generous by default. Telling a competent clinician their correct answer
//     was wrong loses them permanently, so the prompt credits clinical meaning
//     over phrasing and marks a criterion unmet only when clearly absent.
//
// With no OPENROUTER_API_KEY set, falls back to keyword matching so the mode
// is usable (and demonstrable) without keys, like the rest of the app.

import { skill as safetyNetting, criteriaForTurn } from '../drills/safety-netting.js';

const SKILLS = { 'safety-netting': safetyNetting };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.GRADER_MODEL || process.env.LLM_MODEL || 'moonshotai/kimi-k2.6';

function buildPrompt(skill, exercise, turn, criteria, response, priorTurns) {
    const criteriaText = criteria
        .map((c) => `- id "${c.id}"${c.essential ? ' (ESSENTIAL)' : ''}: ${c.label}`)
        .join('\n');

    // Later turns are follow-ups: the trainee has already said things, and it
    // would be unfair to mark them down for not repeating themselves.
    const history = priorTurns.length
        ? `\nEARLIER IN THIS EXCHANGE (do not re-mark, but do not penalise the trainee for not repeating it):\n${priorTurns
              .map((p) => `Patient: "${p.line}"\nTrainee: "${p.response}"`)
              .join('\n')}\n`
        : '';

    return `You are assessing a UK GP trainee practising a single clinical communication skill: ${skill.title}.

WHAT GOOD LOOKS LIKE:
${skill.teaching}

THE CLINICAL SITUATION:
${exercise.context}
${history}
THE PATIENT SAID:
"${turn.line}"

A STRONG MODEL ANSWER (for calibration only — the trainee does NOT have to match its wording or cover everything in it):
"${turn.exemplar}"

THE TRAINEE'S ACTUAL RESPONSE:
"${response}"

CRITERIA TO ASSESS — assess ONLY these, ignore anything else the skill involves:
${criteriaText}

HOW TO JUDGE:
- Judge each criterion separately. For every criterion you mark met, quote the trainee's own words as evidence. If you cannot quote them, it is not met.
- Credit clinical MEANING, not phrasing. "Ring an ambulance" and "call 999" are the same thing. "If you can't wake him" and "if he becomes unrousable" are the same thing.
- These are spoken responses transcribed from speech: ignore grammar, filler words, false starts and transcription errors.
- Do NOT require everything in the model answer. A safe, specific response that covers the essential criteria is a pass.
- Mark a criterion unmet only when it is genuinely absent — not when it is brief, or worded differently from the model answer.
- Never invent clinical content the trainee did not say. If they were vague ("come back if it gets worse"), that is not naming specific symptoms.

VERDICT:
- "pass" if every ESSENTIAL criterion is met
- "partial" if some but not all ESSENTIAL criteria are met
- "miss" if no ESSENTIAL criterion is met

FEEDBACK: two or three sentences, addressed to the trainee as "you". Say what worked before what was missing. Be specific and practical, never generic praise.
HINT: only if the verdict is not "pass" — one sentence pointing at what to add, without giving them the whole answer.

Respond with ONLY a JSON object, no markdown fences and no commentary:
{"criteria":[{"id":"symptoms","met":true,"evidence":"exact words from the trainee"}],"verdict":"pass","feedback":"...","hint":""}`;
}

// The model is asked for bare JSON, but tolerate fences or stray prose.
function extractJson(text) {
    if (!text) return null;
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch (_) {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end > start) {
            try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) { /* fall through */ }
        }
    }
    return null;
}

// Keyword fallback so the drill works without an API key. Crude on purpose —
// it exists to demonstrate the flow, not to assess anyone.
function gradeByKeyword(activeCriteria, response) {
    const text = (response || '').toLowerCase();
    const criteria = activeCriteria.map((c) => {
        const hit = (c.demoKeywords || []).find((k) => text.includes(k));
        return { id: c.id, met: Boolean(hit), evidence: hit || '' };
    });
    const essentialMet = activeCriteria
        .filter((c) => c.essential)
        .every((c) => criteria.find((x) => x.id === c.id)?.met);
    const anyEssential = activeCriteria
        .filter((c) => c.essential)
        .some((c) => criteria.find((x) => x.id === c.id)?.met);

    return {
        criteria,
        verdict: essentialMet ? 'pass' : anyEssential ? 'partial' : 'miss',
        feedback: 'Demo grading (no API key configured) — this is keyword matching, not real assessment. Set OPENROUTER_API_KEY for genuine feedback.',
        hint: essentialMet ? '' : 'Name the specific symptoms, and say exactly what the patient should do.',
        demo: true,
    };
}

// Ensure the response is shaped correctly whatever the model returned, so the
// UI never has to defend against a malformed grade.
function normalise(raw, activeCriteria) {
    const byId = new Map((raw?.criteria || []).map((c) => [c.id, c]));
    const criteria = activeCriteria.map((c) => {
        const got = byId.get(c.id);
        return {
            id: c.id,
            met: Boolean(got?.met && got?.evidence),
            evidence: typeof got?.evidence === 'string' ? got.evidence : '',
        };
    });
    // Recompute the verdict from the criteria rather than trusting the model's
    // own summary — the two occasionally disagree.
    const essential = activeCriteria.filter((c) => c.essential);
    const metEssential = essential.filter((c) => criteria.find((x) => x.id === c.id)?.met);
    const verdict = metEssential.length === essential.length ? 'pass'
        : metEssential.length > 0 ? 'partial' : 'miss';

    return {
        criteria,
        verdict,
        feedback: typeof raw?.feedback === 'string' ? raw.feedback : '',
        hint: verdict === 'pass' ? '' : (typeof raw?.hint === 'string' ? raw.hint : ''),
    };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { skillId, exerciseId, turnId, response, priorTurns } = req.body || {};
    const skill = SKILLS[skillId];
    const exercise = skill?.exercises.find((e) => e.id === exerciseId);
    const turn = exercise?.turns.find((t) => t.id === turnId);
    if (!skill || !exercise || !turn) {
        return res.status(400).json({ error: 'Unknown skill, exercise or turn' });
    }
    if (!response || !response.trim()) {
        return res.status(400).json({ error: 'No response to grade' });
    }

    const activeCriteria = criteriaForTurn(turn);

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(200).json(gradeByKeyword(activeCriteria, response));
    }

    try {
        const upstream = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL,
                messages: [{
                    role: 'user',
                    content: buildPrompt(skill, exercise, turn, activeCriteria, response,
                        Array.isArray(priorTurns) ? priorTurns : []),
                }],
                // Low temperature: the same answer should get the same grade.
                temperature: 0.1,
                max_tokens: 900,
                reasoning: { enabled: false },
            }),
        });

        if (!upstream.ok) {
            const detail = await upstream.text().catch(() => '');
            console.error('Grader upstream error', upstream.status, detail.slice(0, 300));
            return res.status(502).json({ error: 'Grading is unavailable right now. Please try again.' });
        }

        const data = await upstream.json();
        const parsed = extractJson(data?.choices?.[0]?.message?.content);
        if (!parsed) {
            console.error('Grader returned unparseable output');
            return res.status(502).json({ error: 'Grading is unavailable right now. Please try again.' });
        }

        return res.status(200).json(normalise(parsed, activeCriteria));
    } catch (err) {
        console.error('Grade handler error:', err);
        return res.status(502).json({ error: 'Grading is unavailable right now. Please try again.' });
    }
}
