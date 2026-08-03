// Juniper — main consultation logic.
// Flow: student types → /api/chat streams the patient's reply → completed
// sentences are queued to /api/tts (MiniMax) and played through WebAudio,
// whose live amplitude drives the portrait's mouth. If TTS isn't configured,
// falls back to the browser's speechSynthesis with a synthetic mouth envelope.

import { scenario } from './scenarios/margaret-hughes.js';
import { createPortrait } from './portrait.js';
import { createVoiceInput } from './voice-input.js';

// --- DOM ------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const transcriptEl = el('transcript');
const decisionPanel = el('decision-panel');
const inputEl = el('doctor-input');
const sendBtn = el('send-btn');
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
    awaitingOpening: true, // Margaret speaks only after the student greets her
};

const portrait = createPortrait(el('portrait'));

// --- Audio: WebAudio playback + amplitude → mouth -------------------------
let audioCtx = null;
let analyser = null;
const speakQueue = [];
let speaking = false;
let muted = false;
let currentSource = null; // the BufferSource playing right now, if any
let audioEl = null;       // reusable <audio> element for the fallback path
let currentAudioEl = null;
let decodeBroken = false; // set once decodeAudioData is shown to be unusable

// Readable from the console as __gpsim.audio — tells you at a glance which
// playback path a session actually used when a voice problem is reported.
const audioDebug = { played: 0, fellBack: 0, path: 'none' };
window.__gpsim = { audio: audioDebug };

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

// Trim near-silence from the edges of a decoded clip so consecutive clips
// butt together naturally instead of stacking their padding into a pause.
function trimSilence(buffer) {
    const data = buffer.getChannelData(0);
    const threshold = 0.012;
    let start = 0;
    let end = data.length - 1;
    while (start < end && Math.abs(data[start]) < threshold) start++;
    while (end > start && Math.abs(data[end]) < threshold) end--;
    // Keep a whisker of padding so words don't start abruptly.
    const pad = Math.floor(buffer.sampleRate * 0.04);
    start = Math.max(0, start - pad);
    end = Math.min(data.length, end + pad);
    if (end - start < buffer.sampleRate * 0.05 || (start === 0 && end === data.length)) return buffer;

    const trimmed = audioCtx.createBuffer(buffer.numberOfChannels, end - start, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        trimmed.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
    }
    return trimmed;
}

// Preferred path: decode to a buffer so we can trim edge silence and play
// clips back-to-back with no gap.
async function playDecoded(arrayBuffer) {
    ensureAudio();
    // decodeAudioData detaches the buffer it is given (even on failure), so
    // hand it a copy — the original must survive for the fallback path.
    const buffer = trimSilence(await audioCtx.decodeAudioData(arrayBuffer.slice(0)));
    return new Promise((resolve) => {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        const stopSignal = { stopped: false };
        trackAmplitude(stopSignal);
        source.onended = () => { stopSignal.stopped = true; if (currentSource === source) currentSource = null; resolve(); };
        currentSource = source;
        source.start();
    });
}

// Fallback path: an <audio> element uses the browser's media pipeline, which
// is far more tolerant than decodeAudioData — Safari rejects MiniMax's MP3s
// because of their ID3 metadata, and would otherwise play nothing at all.
function ensureAudioElement() {
    if (audioEl) return audioEl;
    ensureAudio();
    audioEl = new Audio();
    audioEl.preload = 'auto';
    try {
        // Routing through the analyser keeps the mouth animation working.
        audioCtx.createMediaElementSource(audioEl).connect(analyser);
    } catch (err) {
        console.warn('Audio element not routed through analyser', err);
    }
    return audioEl;
}

function playViaElement(arrayBuffer) {
    const el = ensureAudioElement();
    const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mpeg' }));
    return new Promise((resolve) => {
        const stopSignal = { stopped: false };
        let settled = false;
        const done = (ok) => {
            if (settled) return;
            settled = true;
            stopSignal.stopped = true;
            el.onended = el.onerror = null;
            URL.revokeObjectURL(url);
            if (currentAudioEl === el) currentAudioEl = null;
            resolve(ok);
        };
        el.onended = () => done(true);
        el.onerror = () => done(false);
        el.src = url;
        currentAudioEl = el;
        trackAmplitude(stopSignal);
        el.play().catch((err) => { console.warn('Element playback failed', err); done(false); });
    });
}

// Returns true if the clip was actually heard, so the caller knows whether it
// still needs to fall back to the browser's own voice.
async function playAudio(arrayBuffer) {
    if (!decodeBroken) {
        try {
            await playDecoded(arrayBuffer);
            audioDebug.path = 'decoded';
            return true;
        } catch (err) {
            console.warn('decodeAudioData failed — switching to element playback', err);
            decodeBroken = true;
        }
    }
    const ok = await playViaElement(arrayBuffer);
    audioDebug.path = ok ? 'element' : 'failed';
    return ok;
}

// Immediately silence the patient: kill the playing clip and drop the queue.
// The transcript is untouched — only the audio stops.
function stopAllSpeech() {
    speakQueue.length = 0;
    if (currentSource) { try { currentSource.stop(); } catch (_) {} currentSource = null; }
    if (currentAudioEl) { try { currentAudioEl.pause(); currentAudioEl.currentTime = 0; } catch (_) {} currentAudioEl = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    portrait.stopSpeaking();
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

// Fetches one sentence's audio. Resolves to an ArrayBuffer, or null when TTS
// isn't configured (use the browser voice), or undefined on a hard error
// (skip the audio silently rather than surprise the student with a robot).
async function fetchTtsAudio(text) {
    try {
        const resp = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voiceId: scenario.patient.voiceId }),
        });
        const isAudio = (resp.headers.get('content-type') || '').includes('audio');
        if (resp.ok && isAudio) return await resp.arrayBuffer();

        // Only an explicit {demo:true} means "TTS isn't configured". A transient
        // failure (timeout, quota, cold start) must NOT latch the whole session
        // into demo mode — it should cost this one clip and nothing more.
        const body = await resp.json().catch(() => ({}));
        if (body && body.demo) {
            state.ttsDemo = true;
            return null;
        }
        console.warn('TTS unavailable for this line', resp.status, body && body.error);
        return null; // speak this one line with the browser voice
    } catch (err) {
        console.warn('TTS fetch failed', err);
        return null;
    }
}

// Audio is PREFETCHED at enqueue time so sentences play back-to-back with no
// network gap between them — the fetch for sentence 2 runs while sentence 1
// is still playing.
function enqueueSpeech(sentence) {
    const clean = sentence.trim();
    if (!clean) return;
    speakQueue.push({
        text: clean,
        audio: state.ttsDemo ? Promise.resolve(null) : fetchTtsAudio(clean),
    });
    if (!speaking) drainSpeech();
}

async function drainSpeech() {
    speaking = true;
    setStatus('speaking');
    while (speakQueue.length) {
        const item = speakQueue.shift();
        if (muted) continue; // voice paused: swallow the queue, keep the text
        const buffer = await item.audio;
        if (muted) continue;
        // Never let a failure become silence: if there is no audio, or neither
        // the decoded nor the element path can play it, use the browser voice.
        if (buffer && await playAudio(buffer)) { audioDebug.played++; continue; }
        audioDebug.fellBack++;
        await playFallbackVoice(item.text);
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
    // First sentence as its own clip so she starts speaking quickly, the rest
    // as one clip so there are no pauses mid-line. Both are fetched in
    // parallel, so the wait is the first sentence's synthesis, not the whole line.
    const sentences = splitSentences(text);
    enqueueSpeech(sentences[0]);
    if (sentences.length > 1) enqueueSpeech(sentences.slice(1).join(' '));
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
    // First words of the consultation: the student opens, and Margaret's
    // authored opening line is her reply — no LLM call needed.
    if (state.awaitingOpening) {
        state.awaitingOpening = false;
        state.history.push({ role: 'doctor', text: doctorText });
        addBubble('doctor', doctorText);
        sayAuthoredLine(state.stage.patientOpening, state.stage.expression);
        maybeShowDecision();
        return;
    }

    state.busy = true;
    setStatus('thinking');
    sendBtn.disabled = true;

    state.history.push({ role: 'doctor', text: doctorText });
    addBubble('doctor', doctorText);

    const bubble = addBubble('patient', '');
    bubble.classList.add('streaming');
    let full = '';
    let pending = '';
    // Speak the first sentence as its own clip (fast time-to-voice), then the
    // rest of the reply as ONE clip — sentence-per-clip playback put an
    // audible pause at every full stop.
    let firstSpoken = false;

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
            if (!firstSpoken) {
                const [sentences, rest] = extractSentences(pending);
                if (sentences.length) {
                    enqueueSpeech(sentences[0]);
                    firstSpoken = true;
                    pending = sentences.slice(1).join(' ') + (rest ? ' ' + rest : '');
                }
            }
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

// --- Pause voice / finish consultation -------------------------------------
const voiceBtn = el('voice-btn');
voiceBtn.addEventListener('click', () => {
    muted = !muted;
    // Only the label changes — the icons live in the DOM and swap via CSS.
    const label = voiceBtn.querySelector('.btn-label');
    if (muted) {
        stopAllSpeech();
        label.textContent = 'Voice paused — resume';
        voiceBtn.classList.add('voice-paused');
    } else {
        label.textContent = 'Pause voice';
        voiceBtn.classList.remove('voice-paused');
    }
});

const finishBtn = el('finish-btn');
let finishArmTimer = null;
finishBtn.addEventListener('click', () => {
    if (!finishBtn.classList.contains('arming')) {
        finishBtn.classList.add('arming');
        finishBtn.textContent = 'End now? Click again';
        finishArmTimer = setTimeout(() => {
            finishBtn.classList.remove('arming');
            finishBtn.textContent = 'Finish consultation';
        }, 4000);
        return;
    }
    clearTimeout(finishArmTimer);
    stopAllSpeech();
    if (voice.listening) voice.stop();
    showDebrief();
});

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

    el('debrief-score').textContent = state.decisions.length ? `${total} / ${max}` : '—';
    el('debrief-verdict').textContent = !state.decisions.length
        ? 'The consultation ended before any clinical decisions were made.'
        : unsafe ? 'One of your decisions was unsafe — read the feedback below.'
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

    debriefOverlay.classList.add('active');
}

el('restart-btn').addEventListener('click', () => window.location.reload());

// --- Input ----------------------------------------------------------------
async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || state.busy) return;
    inputEl.value = '';
    state.doctorTurnsInStage += 1;
    await getPatientReply(text);
}

el('input-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSend();
});

// --- Voice input (talk to the patient) -------------------------------------
const micBtn = el('mic-btn');

const voice = createVoiceInput({
    onInterim(text) {
        // Live transcript appears in the input box as the student speaks.
        if (voice.listening) inputEl.value = text;
    },
    onUtterance(text) {
        // The student finished a phrase — send it to Margaret automatically,
        // unless she's still replying (then leave it in the box to edit/send).
        inputEl.value = text;
        if (!state.busy) handleSend();
    },
    // Discard anything "heard" while Margaret is talking or thinking, so her
    // own voice (or a half-distracted student) doesn't become a question.
    isBlocked: () => speaking || state.busy,
    onError() {
        micBtn.classList.remove('listening');
        micBtn.classList.add('unavailable');
        micBtn.title = 'Microphone unavailable — check permissions';
        inputEl.placeholder = 'Speak to Margaret… (e.g. ‘Tell me more about this tightness’)';
    },
});

async function toggleMic() {
    if (voice.listening) {
        voice.stop();
        micBtn.classList.remove('listening');
        micBtn.title = 'Talk to Margaret';
        return;
    }
    micBtn.disabled = true;
    try {
        await voice.start();
        micBtn.classList.add('listening');
        micBtn.title = 'Stop listening';
        inputEl.placeholder = 'Listening — just talk to Margaret…';
    } catch (err) {
        console.error('Voice input failed:', err);
        micBtn.classList.add('unavailable');
        micBtn.title = err?.name === 'NotAllowedError'
            ? 'Microphone blocked — allow it in your browser settings for this site'
            : (err?.message || 'Voice input unavailable');
    }
    micBtn.disabled = false;
}

micBtn.addEventListener('click', toggleMic);

// --- Start ----------------------------------------------------------------
el('start-btn').addEventListener('click', () => {
    ensureAudio(); // user gesture unlocks audio
    if ('speechSynthesis' in window) speechSynthesis.getVoices(); // warm voice list
    startOverlay.classList.remove('active');
    portrait.setExpression(state.stage.expression);
    addCard('Consultation started', ['Margaret settles into the chair. Greet her when you’re ready — she’s waiting for you to begin.']);
    inputEl.focus();
});

// Populate start card from the scenario so it always matches the content.
el('scenario-title').textContent = scenario.title;
el('scenario-setting').textContent = scenario.setting;
el('patient-name').textContent = scenario.patient.name;
el('patient-meta').textContent = `${scenario.patient.age} · ${scenario.patient.occupation}`;
