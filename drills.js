// GP Sim — skills drill mode.
//
// Deliberate practice rather than whole-consultation simulation: one authored
// patient line, one response from the student, immediate criterion-by-criterion
// feedback. No LLM roleplay and no TTS at runtime — the patient's line is a
// pre-rendered video (or, until one exists, the line rendered as text).

import { skill } from './drills/safety-netting.js';
import { createVoiceInput } from './voice-input.js';

const el = (id) => document.getElementById(id);

const state = {
    index: 0,
    results: [],      // one entry per exercise: 'pass' | 'partial' | 'miss'
    grading: false,
    attempts: 0,
};

// --- Static skill content --------------------------------------------------
el('skill-title').textContent = skill.title;
el('skill-name').textContent = skill.title;
el('skill-blurb').textContent = skill.blurb;
el('skill-teaching').innerHTML = skill.teaching
    .split('\n\n')
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
el('criteria-list').innerHTML = skill.criteria
    .map((c) => `<li${c.essential ? ' class="essential"' : ''}>${c.label}${c.essential ? '<span class="req">required</span>' : ''}</li>`)
    .join('');

// --- Exercise rendering ----------------------------------------------------
function currentExercise() {
    return skill.exercises[state.index];
}

// showCurrent is false on the summary screen, where no exercise is active.
function renderProgress(showCurrent = true) {
    el('drill-count').textContent = showCurrent
        ? `Exercise ${state.index + 1} of ${skill.exercises.length}`
        : 'Complete';
    el('drill-dots').innerHTML = skill.exercises
        .map((_, i) => {
            const done = state.results[i];
            const cls = showCurrent && i === state.index ? 'current' : done ? `done ${done}` : '';
            return `<span class="dot ${cls}"></span>`;
        })
        .join('');
}

function renderExercise() {
    const ex = currentExercise();
    state.attempts = 0;
    document.querySelector('.drill-stage').hidden = false;
    renderProgress();

    // Video if it exists, otherwise a placeholder carrying the same information
    // so the mode is fully usable before any clips are generated.
    const video = el('drill-video');
    video.innerHTML = `
        <video id="drill-clip" playsinline preload="auto" poster="">
            <source src="${ex.video}" type="video/mp4">
        </video>
        <div class="drill-video-fallback" id="drill-fallback" hidden>
            <div class="fallback-badge">Video not generated yet</div>
            <div class="fallback-patient">${ex.patient}</div>
        </div>`;

    const clip = el('drill-clip');
    clip.addEventListener('error', showFallback, { once: true });
    // A source that 404s fires error on the <source>, not always the <video>.
    clip.querySelector('source').addEventListener('error', showFallback, { once: true });
    clip.addEventListener('loadeddata', () => { clip.classList.add('ready'); clip.play().catch(() => {}); }, { once: true });

    el('drill-context').textContent = ex.context;
    el('drill-who').textContent = `${ex.patient}:`;
    el('drill-line').textContent = `“${ex.patientLine}”`;

    el('drill-input').value = '';
    el('drill-result').innerHTML = '';
    el('drill-respond').hidden = false;
    el('drill-submit').disabled = false;
    el('drill-submit').textContent = 'Submit response';
}

function showFallback() {
    const clip = el('drill-clip');
    const fallback = el('drill-fallback');
    if (clip) clip.hidden = true;
    if (fallback) fallback.hidden = false;
}

// --- Grading ---------------------------------------------------------------
const VERDICT = {
    pass: { label: 'Met the standard', cls: 'v-pass' },
    partial: { label: 'Partly there', cls: 'v-partial' },
    miss: { label: 'Not yet safe', cls: 'v-miss' },
};

async function submit() {
    const response = el('drill-input').value.trim();
    if (!response || state.grading) return;

    state.grading = true;
    state.attempts += 1;
    el('drill-submit').disabled = true;
    el('drill-submit').textContent = 'Marking…';
    if (voice.listening) toggleMic();

    try {
        const resp = await fetch('/api/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skillId: skill.id, exerciseId: currentExercise().id, response }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || `Grading failed (${resp.status})`);
        renderResult(data);
    } catch (err) {
        console.error(err);
        el('drill-result').innerHTML = `<div class="drill-error">${err.message}</div>`;
        el('drill-submit').disabled = false;
        el('drill-submit').textContent = 'Try again';
    } finally {
        state.grading = false;
    }
}

function renderResult(data) {
    const v = VERDICT[data.verdict] || VERDICT.miss;
    const isLast = state.index === skill.exercises.length - 1;

    // Only record the first attempt, so the progress dots reflect performance
    // rather than persistence.
    if (state.attempts === 1) state.results[state.index] = data.verdict;
    renderProgress();

    const criteriaHtml = skill.criteria.map((c) => {
        const got = data.criteria.find((x) => x.id === c.id) || { met: false, evidence: '' };
        return `<li class="${got.met ? 'met' : 'unmet'}">
            <span class="tick">${got.met ? '✓' : '·'}</span>
            <span class="crit-label">${c.label}${c.essential ? '<span class="req">required</span>' : ''}</span>
            ${got.evidence ? `<span class="crit-evidence">“${got.evidence}”</span>` : ''}
        </li>`;
    }).join('');

    el('drill-result').innerHTML = `
        <div class="drill-verdict ${v.cls}">${v.label}</div>
        ${data.demo ? '<div class="drill-demo-note">Demo grading — keyword matching only. Add OPENROUTER_API_KEY for real assessment.</div>' : ''}
        <ul class="result-criteria">${criteriaHtml}</ul>
        ${data.feedback ? `<p class="drill-feedback">${data.feedback}</p>` : ''}
        ${data.hint ? `<p class="drill-hint"><strong>Hint:</strong> ${data.hint}</p>` : ''}
        <div class="drill-actions">
            ${data.verdict !== 'pass' ? '<button class="secondary-btn" id="retry-btn">Try this one again</button>' : ''}
            <button class="primary-btn" id="next-btn">${isLast ? 'See summary' : 'Next exercise'}</button>
            <button class="link-btn" id="model-btn">Show a model answer</button>
        </div>
        <div class="drill-model" id="drill-model" hidden>
            <div class="skill-eyebrow">Model answer</div>
            <p>${currentExercise().exemplar}</p>
        </div>`;

    el('drill-respond').hidden = true;

    el('next-btn').addEventListener('click', next);
    el('model-btn').addEventListener('click', () => {
        const box = el('drill-model');
        box.hidden = !box.hidden;
        el('model-btn').textContent = box.hidden ? 'Show a model answer' : 'Hide model answer';
    });
    const retry = el('retry-btn');
    if (retry) {
        retry.addEventListener('click', () => {
            el('drill-result').innerHTML = '';
            el('drill-respond').hidden = false;
            el('drill-submit').disabled = false;
            el('drill-submit').textContent = 'Submit response';
            el('drill-input').focus();
        });
    }
}

function next() {
    if (state.index < skill.exercises.length - 1) {
        state.index += 1;
        renderExercise();
        return;
    }
    renderSummary();
}

function renderSummary() {
    const counts = state.results.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
    const passed = counts.pass || 0;
    document.querySelector('.drill-stage').hidden = true;
    el('drill-respond').hidden = true;
    renderProgress(false);
    el('drill-result').innerHTML = `
        <div class="drill-summary">
            <h2>${skill.title} — practice complete</h2>
            <div class="summary-score">${passed} / ${skill.exercises.length}</div>
            <p>${passed === skill.exercises.length
                ? 'Every response met the standard first time. Try the full consultation to use this under pressure.'
                : 'Scored on your first attempt at each exercise. Repetition is the point — run it again.'}</p>
            <div class="drill-actions">
                <button class="primary-btn" id="restart-drill">Practise again</button>
                <a class="link-btn" href="index.html">Back to the full consultation</a>
            </div>
        </div>`;
    el('restart-drill').addEventListener('click', () => {
        state.index = 0;
        state.results = [];
        renderExercise();
    });
}

// --- Voice input -----------------------------------------------------------
const micBtn = el('drill-mic');
const voice = createVoiceInput({
    onInterim(text) { if (voice.listening && text) el('drill-input').value = text; },
    onUtterance(text) {
        // Drill responses are often several sentences, so accumulate rather
        // than auto-submitting on the first pause.
        const box = el('drill-input');
        box.value = (box.value ? box.value.replace(/\s*$/, ' ') : '') + text;
    },
    isBlocked: () => state.grading,
    onError() {
        micBtn.classList.remove('listening');
        micBtn.classList.add('unavailable');
        micBtn.title = 'Microphone unavailable — check permissions';
    },
});

async function toggleMic() {
    if (voice.listening) {
        voice.stop();
        micBtn.classList.remove('listening');
        return;
    }
    micBtn.disabled = true;
    try {
        await voice.start();
        micBtn.classList.add('listening');
    } catch (err) {
        console.error('Voice input failed:', err);
        micBtn.classList.add('unavailable');
        micBtn.title = err?.message || 'Voice input unavailable';
    }
    micBtn.disabled = false;
}

micBtn.addEventListener('click', toggleMic);
el('drill-submit').addEventListener('click', submit);
el('drill-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
});

renderExercise();
