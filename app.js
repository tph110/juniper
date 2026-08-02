// Juniper — main consultation logic.
// Flow: student types or talks (Deepgram STT via voice.js) → /api/chat
// streams the patient's reply → completed sentences are queued to /api/tts
// (MiniMax) and played through WebAudio, whose live amplitude drives the
// portrait's mouth. If TTS isn't configured, falls back to the browser's
// speechSynthesis with a synthetic mouth envelope.

import { scenario } from './scenarios/margaret-hughes.js';
import { createPortrait } from './portrait.js';
import { createVoiceInput } from './voice.js';

// --- DOM ------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const transcriptEl = el('transcript');
const decisionPanel = el('decision-panel');
const inputEl = el('doctor-input');
const sendBtn = el('send-btn');
const micBtn = el('mic-btn');
const voiceInterimEl = el('voice-interim');
const examineBtn = el('examine-btn');
const startOverlay = el('start-overlay');
const debriefOverlay = el('debrief-overlay');
const statusEl = el('patient-status');

// --- State ----------------------------------------------------------------
const state = {
    stage: scenario.stages[0],
    history: [],           // {role: 'doctor'|'patient', text}
    doctorTurnsInStage: 0,
    decisions: [],         // {question, option}
    decisionShown: false,
    examined: false,
    busy: false,
    ttsDemo: false,        // flips true once /api/tts reports it's unconfigured
};

const portrait = createPortrait(el('portrait'));

// --- Audio: WebAudio playback + amplitude → mouth -------------------------
let audioCtx = null;
let analyser = null;
const speakQueue = [];
let speaking = false;

function ensureAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function trackAmplitude(stopSignal) {
    const data = new Uint8Array(analyser.fftSize);
    (function loop() {
        if (stopSignal.stopped) { portrait.stopSpeaking(); return; }
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
        }
        portrait.setMouth(Math.min(1, Math.sqrt(sum / data.length) * 4.5));
        requestAnimationFrame(loop);
    })();
}

async function playMp3(arrayBuffer) {
    ensureAudio();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    return new Promise((resolve) => {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        const stopSignal = { stopped: false };
        trackAmplitude(stopSignal);
        source.onended = () => { stopSignal.stopped = true; resolve(); };
        source.start();
    });
}

// speechSynthesis fallback with a synthetic mouth envelope (we can't tap its
// audio output, so we fake a plausible amplitude while it talks).
function playFallbackVoice(text) {
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) { resolve(); return; }
        const utter = new SpeechSynthesisUtterance(text);
        const voices = speechSynthesis.getVoices();
        utter.voice =
            voices.find((v) => v.lang === 'en-GB' && /female|Kate|Serena|Stephanie|Martha/i.test(v.name)) ||
            voices.find((v) => v.lang === 'en-GB') || null;
        utter.rate = 0.95;
        utter.pitch = 1.05;
        let env = 0;
        const tick = setInterval(() => {
            env = Math.max(0, Math.min(1, env + (Math.random() - 0.45) * 0.5));
            portrait.setMouth(env * 0.8);
        }, 70);
        let finished = false;
        const done = () => {
            if (finished) return;
            finished = true;
            clearInterval(tick);
            clearTimeout(watchdog);
            portrait.stopSpeaking();
            resolve();
        };
        // Safari's speechSynthesis often fails to fire onend — cap the wait at a
        // generous estimate of the line's spoken duration so we never hang.
        const watchdog = setTimeout(done, 3000 + text.length * 90);
        utter.onend = done;
        utter.onerror = done;
        // Safari can be stuck paused or holding a dead utterance and silently
        // say nothing — clear stale state, but never cancel right before speak
        // unless something is actually queued (that swallows the new line).
        if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
        speechSynthesis.resume();
        speechSynthesis.speak(utter);
    });
}

async function speakSentence(text) {
    const clean = text.trim();
    if (!clean) return;
    if (!state.ttsDemo) {
        try {
            const resp = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: clean, voiceId: scenario.patient.voiceId }),
            });
            const isAudio = (resp.headers.get('content-type') || '').includes('audio');
            if (resp.ok && isAudio) {
                await playMp3(await resp.arrayBuffer());
                return;
            } else if (resp.status === 424 || resp.ok) {
                state.ttsDemo = true; // not configured — fall through to browser voice
            } else {
                console.warn('TTS error', resp.status);
                return; // silent failure beats a robotic surprise mid-consult
            }
        } catch (err) {
            console.warn('TTS fetch failed', err);
            return;
        }
    }
    await playFallbackVoice(clean);
}

function enqueueSpeech(sentence) {
    speakQueue.push(sentence);
    if (!speaking) drainSpeech();
}

async function drainSpeech() {
    speaking = true;
    setStatus('speaking');
    while (speakQueue.length) {
        await speakSentence(speakQueue.shift());
    }
    speaking = false;
    setStatus('idle');
}

// Never let a stuck voice block the consultation flow: give up waiting after
// a bounded time and let the UI move on (the transcript is always complete).
function waitForSpeechEnd(maxMs = 25000) {
    const deadline = Date.now() + maxMs;
    return new Promise((resolve) => {
        (function check() {
            if ((!speaking && speakQueue.length === 0) || Date.now() > deadline) resolve();
            else setTimeout(check, 150);
        })();
    });
}

// --- Transcript UI --------------------------------------------------------
function addBubble(role, text) {
    const div = document.createElement('div');
    div.className = `bubble ${role}`;
    div.textContent = text;
    transcriptEl.appendChild(div);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    return div;
}

function addCard(title, lines) {
    const div = document.createElement('div');
    div.className = 'bubble card';
    div.innerHTML = `<strong>${title}</strong>` + lines.map((l) => `<div>• ${l}</div>`).join('');
    transcriptEl.appendChild(div);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function setStatus(mode) {
    statusEl.textContent = mode === 'speaking' ? 'Speaking…'
        : mode === 'thinking' ? 'Listening…' : '';
}

// --- Patient speech: authored lines + streamed LLM replies ----------------
function sayAuthoredLine(text, expression) {
    if (expression) portrait.setExpression(expression);
    state.history.push({ role: 'patient', text });
    addBubble('patient', text);
    // Split authored lines into sentences too, so TTS chunks stay short.
    splitSentences(text).forEach(enqueueSpeech);
}

// Splits streamed text into complete sentences; returns [sentences, remainder].
function extractSentences(buffer) {
    const out = [];
    let rest = buffer;
    const re = /[^.!?…]*[.!?…]+["']?\s*/g;
    let consumed = 0;
    let m;
    while ((m = re.exec(buffer)) !== null) {
        out.push(m[0].trim());
        consumed = re.lastIndex;
    }
    rest = buffer.slice(consumed);
    return [out, rest];
}

function splitSentences(text) {
    const [sentences, rest] = extractSentences(text);
    if (rest.trim()) sentences.push(rest.trim());
    return sentences;
}

async function getPatientReply(doctorText) {
    state.busy = true;
    setStatus('thinking');
    sendBtn.disabled = true;

    state.history.push({ role: 'doctor', text: doctorText });
    addBubble('doctor', doctorText);

    const bubble = addBubble('patient', '');
    bubble.classList.add('streaming');
    let full = '';
    let pending = '';

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stageId: state.stage.id, history: state.history }),
        });
        if (!resp.ok || !resp.body) throw new Error(`chat ${resp.status}`);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            full += chunk;
            pending += chunk;
            bubble.textContent = full;
            transcriptEl.scrollTop = transcriptEl.scrollHeight;
            const [sentences, rest] = extractSentences(pending);
            sentences.forEach(enqueueSpeech);
            pending = rest;
        }
        if (pending.trim()) enqueueSpeech(pending.trim());
        if (!full.trim()) {
            full = `Sorry doctor, I didn't quite catch that. Could you say it again?`;
            bubble.textContent = full;
            enqueueSpeech(full);
        }
    } catch (err) {
        console.error(err);
        full = full || `Sorry doctor, I didn't quite catch that.`;
        bubble.textContent = full;
    }

    bubble.classList.remove('streaming');
    state.history.push({ role: 'patient', text: full.trim() });
    state.busy = false;
    sendBtn.disabled = false;

    maybeShowDecision();
}

// --- Decision engine ------------------------------------------------------
function maybeShowDecision() {
    const d = state.stage.decision;
    if (!d || state.decisionShown) return;
    if (state.doctorTurnsInStage < d.afterDoctorTurns) return;
    state.decisionShown = true;

    (async () => {
        await waitForSpeechEnd();
        if (d.promptLine) sayAuthoredLine(d.promptLine, null);
        renderDecision(d);
    })();
}

function renderDecision(d) {
    decisionPanel.innerHTML = `
        <div class="decision-question">${d.question}</div>
        <div class="decision-options">
            ${d.options.map((o, i) => `
                <button class="decision-option" data-i="${i}">
                    <span class="decision-label">${o.label}</span>
                    <span class="decision-detail">${o.detail}</span>
                </button>`).join('')}
        </div>
        <div class="decision-hint">You can keep talking to Margaret, or commit to a decision.</div>`;
    decisionPanel.classList.add('active');
    decisionPanel.querySelectorAll('.decision-option').forEach((btn) => {
        btn.addEventListener('click', () => chooseOption(d, d.options[+btn.dataset.i]));
    });
}

async function chooseOption(d, option) {
    if (state.busy) return;
    state.decisions.push({ question: d.question, option });
    decisionPanel.classList.remove('active');
    decisionPanel.innerHTML = '';
    addCard('Decision', [option.label]);

    sayAuthoredLine(option.patientReaction, option.expression);
    await waitForSpeechEnd();
    advanceStage(option.next);
}

function advanceStage(stageId) {
    const next = scenario.stages.find((s) => s.id === stageId);
    if (!next) return;
    state.stage = next;
    state.doctorTurnsInStage = 0;
    state.decisionShown = false;

    if (next.id === 'debrief') { showDebrief(); return; }

    portrait.setExpression(next.expression);
    if (next.patientOpening) sayAuthoredLine(next.patientOpening, null);
}

// --- Examination ----------------------------------------------------------
examineBtn.addEventListener('click', () => {
    if (state.examined) return;
    state.examined = true;
    examineBtn.disabled = true;
    addCard(scenario.examination.title, scenario.examination.findings);
});

// --- Debrief --------------------------------------------------------------
const QUALITY = {
    good: { label: 'Good call', score: 2, cls: 'q-good' },
    okay: { label: 'Reasonable', score: 1, cls: 'q-okay' },
    poor: { label: 'Missed opportunity', score: 0, cls: 'q-poor' },
    dangerous: { label: 'Unsafe', score: 0, cls: 'q-dangerous' },
};

function showDebrief() {
    const total = state.decisions.reduce((s, d) => s + QUALITY[d.option.quality].score, 0);
    const max = state.decisions.length * 2;
    const unsafe = state.decisions.some((d) => d.option.quality === 'dangerous');

    el('debrief-score').textContent = `${total} / ${max}`;
    el('debrief-verdict').textContent = unsafe
        ? 'One of your decisions was unsafe — read the feedback below.'
        : total === max ? 'An excellent consultation.'
        : total >= max / 2 ? 'A solid consultation with room to sharpen.'
        : 'Plenty to take away from this one.';

    el('debrief-decisions').innerHTML = state.decisions.map((d) => {
        const q = QUALITY[d.option.quality];
        return `<div class="debrief-item ${q.cls}">
            <div class="debrief-choice"><span class="debrief-badge">${q.label}</span> ${d.option.label}</div>
            <div class="debrief-feedback">${d.option.feedback}</div>
        </div>`;
    }).join('');

    el('debrief-learning').innerHTML = scenario.learningPoints
        .map((p) => `<li>${p}</li>`).join('');

    voice.stop(); // release the mic — the consultation is over
    debriefOverlay.classList.add('active');
}

el('restart-btn').addEventListener('click', () => window.location.reload());

// --- Input ----------------------------------------------------------------
async function sendDoctorText(text) {
    if (!text || state.busy) return;
    state.doctorTurnsInStage += 1;
    await getPatientReply(text);
}

async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || state.busy) return;
    inputEl.value = '';
    await sendDoctorText(text);
}

el('input-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSend();
});

// --- Voice input ----------------------------------------------------------
// The mic streams continuously; echo cancellation strips the patient's own
// voice from the capture, and anything the student says while the patient is
// still talking is discarded — you let the patient finish, like a real room.
const voice = createVoiceInput({
    onInterim(text) {
        if (state.busy || speaking) text = '';
        voiceInterimEl.textContent = text;
        voiceInterimEl.classList.toggle('active', !!text);
    },
    onUtterance(text) {
        if (state.busy || speaking) return;
        sendDoctorText(text);
    },
    onState(s, detail) {
        micBtn.classList.toggle('listening', s === 'listening');
        micBtn.classList.toggle('connecting', s === 'connecting');
        micBtn.disabled = s === 'unsupported';
        micBtn.title = (s === 'error' || s === 'unsupported') && detail
            ? detail
            : s === 'listening' ? 'Stop listening' : 'Talk to Margaret';
    },
});

micBtn.addEventListener('click', () => voice.toggle());

// --- Start ----------------------------------------------------------------
el('start-btn').addEventListener('click', () => {
    ensureAudio(); // user gesture unlocks audio
    if ('speechSynthesis' in window) speechSynthesis.getVoices(); // warm voice list
    startOverlay.classList.remove('active');
    portrait.setExpression(state.stage.expression);
    sayAuthoredLine(state.stage.patientOpening, null);
});

// Populate start card from the scenario so it always matches the content.
el('scenario-title').textContent = scenario.title;
el('scenario-setting').textContent = scenario.setting;
el('patient-name').textContent = scenario.patient.name;
el('patient-meta').textContent = `${scenario.patient.age} · ${scenario.patient.occupation}`;
