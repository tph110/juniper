// Juniper voice input: lets the student talk to the patient instead of typing.
// Streams mic audio to Deepgram's live STT WebSocket as raw 16 kHz PCM (no
// container, so it behaves identically in every browser), authenticated with
// a short-lived token from /api/voice-token. Deepgram's endpointing decides
// when the student has finished a thought and the utterance is auto-sent.
// With no DEEPGRAM_API_KEY configured, falls back to the browser's built-in
// SpeechRecognition — the same demo-mode philosophy as TTS.

const DG_URL = 'wss://api.deepgram.com/v1/listen';
const TARGET_RATE = 16000;

// createVoiceInput({ onInterim, onUtterance, onState })
//   onInterim(text)    — live transcript of what the student is saying so far
//   onUtterance(text)  — a finished utterance, ready to send to the patient
//   onState(state, detail) — 'idle' | 'connecting' | 'listening' | 'error' | 'unsupported'
export function createVoiceInput({ onInterim, onUtterance, onState }) {
    let listening = false;   // user intent: mic toggled on
    let ws = null;
    let micStream = null;
    let captureCtx = null;
    let sourceNode = null;
    let processor = null;
    let recognition = null;
    let finals = [];
    let keepAliveTimer = null;
    let restartTimer = null;
    let flushTimer = null;
    let restartAttempts = 0;

    // --- Transcript assembly ---------------------------------------------
    function emitInterim(tail) {
        onInterim([...finals, tail].join(' ').replace(/\s+/g, ' ').trim());
    }

    function flush() {
        clearTimeout(flushTimer);
        const text = finals.join(' ').replace(/\s+/g, ' ').trim();
        finals = [];
        onInterim('');
        if (text) onUtterance(text);
    }

    // --- Deepgram path ----------------------------------------------------
    async function connectDeepgram(cfg) {
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,   // cancels the patient's own voice from the mic
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
            },
        });
        if (!listening) { teardownTransport(); return; }

        // Ask for 16 kHz capture; if the browser won't resample, use its rate
        // and tell Deepgram what we're actually sending.
        const AC = window.AudioContext || window.webkitAudioContext;
        try { captureCtx = new AC({ sampleRate: TARGET_RATE }); }
        catch { captureCtx = new AC(); }
        const sampleRate = Math.round(captureCtx.sampleRate);

        const params = new URLSearchParams({
            model: cfg.model || 'nova-3',
            language: 'en',
            smart_format: 'true',
            interim_results: 'true',
            endpointing: '300',
            utterance_end_ms: '1200',
            vad_events: 'true',
            encoding: 'linear16',
            sample_rate: String(sampleRate),
            channels: '1',
        });

        ws = new WebSocket(`${DG_URL}?${params}`, ['bearer', cfg.accessToken]);
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => {
            if (!listening) { teardownTransport(); return; }
            restartAttempts = 0;
            beginCapture();
            setState('listening');
        };
        ws.onmessage = (e) => handleDeepgramMessage(e.data);
        ws.onclose = () => { if (listening) scheduleRestart(); };

        // Harmless while audio flows; keeps the socket alive if capture stalls
        // (e.g. the tab is backgrounded).
        keepAliveTimer = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }));
        }, 8000);
    }

    function beginCapture() {
        sourceNode = captureCtx.createMediaStreamSource(micStream);
        processor = captureCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            const f32 = e.inputBuffer.getChannelData(0);
            const i16 = new Int16Array(f32.length);
            for (let i = 0; i < f32.length; i++) {
                const s = Math.max(-1, Math.min(1, f32[i]));
                i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            ws.send(i16.buffer);
        };
        sourceNode.connect(processor);
        // ScriptProcessor only fires when connected to the destination in some
        // browsers — route it through a muted gain so the mic never plays back.
        const mute = captureCtx.createGain();
        mute.gain.value = 0;
        processor.connect(mute);
        mute.connect(captureCtx.destination);
    }

    function handleDeepgramMessage(raw) {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (msg.type === 'Results') {
            const text = (msg.channel?.alternatives?.[0]?.transcript || '').trim();
            if (msg.is_final) {
                if (text) finals.push(text);
                if (msg.speech_final) flush();
                else emitInterim('');
            } else {
                emitInterim(text);
            }
        } else if (msg.type === 'UtteranceEnd') {
            // Backstop: fires after a pause even if speech_final never arrived.
            flush();
        }
    }

    function scheduleRestart() {
        teardownTransport();
        restartAttempts += 1;
        if (restartAttempts > 3) {
            listening = false;
            setState('error', 'Voice connection lost — tap the mic to try again.');
            return;
        }
        restartTimer = setTimeout(() => { if (listening) connect(); }, 800 * restartAttempts);
    }

    // --- Browser SpeechRecognition fallback (demo mode) -------------------
    function connectBrowser() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            listening = false;
            setState('unsupported', 'Voice input needs Deepgram configured, or a browser with built-in speech recognition.');
            return;
        }
        recognition = new SR();
        recognition.lang = 'en-GB';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
            clearTimeout(flushTimer);
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const r = e.results[i];
                if (r.isFinal) finals.push(r[0].transcript.trim());
                else interim += r[0].transcript;
            }
            if (interim.trim()) {
                emitInterim(interim);
            } else {
                emitInterim('');
                // No endpointing here — treat a short silence after a final
                // result as the end of the utterance.
                flushTimer = setTimeout(flush, 900);
            }
        };
        recognition.onend = () => {
            if (listening) { try { recognition.start(); } catch { /* already running */ } }
        };
        recognition.onerror = (e) => {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                listening = false;
                teardownTransport();
                setState('error', 'Microphone access was blocked — check browser permissions.');
            }
        };
        recognition.start();
        setState('listening');
    }

    // --- Lifecycle --------------------------------------------------------
    function setState(s, detail) { onState(s, detail); }

    async function connect() {
        try {
            const resp = await fetch('/api/voice-token', { method: 'POST' });
            const cfg = await resp.json().catch(() => null);
            if (!listening) return;
            if (cfg?.accessToken) await connectDeepgram(cfg);
            else if (cfg?.demo) connectBrowser();
            else throw new Error(`voice-token ${resp.status}`);
        } catch (err) {
            console.warn('Voice input failed to start:', err);
            listening = false;
            teardownTransport();
            const blocked = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
            setState('error', blocked
                ? 'Microphone access was blocked — check browser permissions.'
                : 'Voice input is unavailable right now — tap the mic to try again.');
        }
    }

    function teardownTransport() {
        clearInterval(keepAliveTimer);
        clearTimeout(restartTimer);
        clearTimeout(flushTimer);
        if (processor) { try { processor.disconnect(); } catch { } processor.onaudioprocess = null; processor = null; }
        if (sourceNode) { try { sourceNode.disconnect(); } catch { } sourceNode = null; }
        if (captureCtx) { captureCtx.close().catch(() => { }); captureCtx = null; }
        if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
        if (ws) {
            ws.onclose = null;
            if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { }
            }
            try { ws.close(); } catch { }
            ws = null;
        }
        if (recognition) {
            recognition.onend = null;
            recognition.onresult = null;
            recognition.onerror = null;
            try { recognition.stop(); } catch { }
            recognition = null;
        }
        finals = [];
        onInterim('');
    }

    function start() {
        if (listening) return;
        listening = true;
        restartAttempts = 0;
        setState('connecting');
        connect();
    }

    function stop() {
        if (!listening) { teardownTransport(); return; }
        listening = false;
        teardownTransport();
        setState('idle');
    }

    return {
        toggle() { listening ? stop() : start(); },
        stop,
        get listening() { return listening; },
    };
}
