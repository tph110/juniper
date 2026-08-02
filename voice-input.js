// Juniper voice input: live speech-to-text so the student can talk to the
// patient. Primary path streams raw PCM to Deepgram over a WebSocket (the
// same pipeline proven in Ambient's dictation — works on Safari, where
// MediaRecorder streaming doesn't). Falls back to the browser's built-in
// webkitSpeechRecognition when Deepgram isn't configured, or reports
// unsupported so the app can hide the mic.
//
// createVoiceInput({ onInterim, onUtterance, isBlocked }) → controller:
//   start()      begin listening (async; may prompt for mic permission)
//   stop()       stop listening and release the mic
//   listening    boolean
// onInterim(text)   fires with the in-progress phrase (may be '')
// onUtterance(text) fires when the speaker finishes a phrase (auto-send point)
// isBlocked()       return true to discard results (e.g. while patient speaks)

// Inlined AudioWorklet: Float32 [-1,1] → Int16 PCM, posted to the main thread.
let workletUrlCache = null;
function getWorkletUrl() {
    if (workletUrlCache) return workletUrlCache;
    const code = `
        class PCMProcessor extends AudioWorkletProcessor {
            process(inputs) {
                const input = inputs[0];
                if (input && input[0]) {
                    const data = input[0];
                    const out = new Int16Array(data.length);
                    for (let i = 0; i < data.length; i++) {
                        const s = Math.max(-1, Math.min(1, data[i]));
                        out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    }
                    this.port.postMessage(out.buffer, [out.buffer]);
                }
                return true;
            }
        }
        registerProcessor('pcm-processor', PCMProcessor);
    `;
    workletUrlCache = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    return workletUrlCache;
}

export function createVoiceInput({ onInterim, onUtterance, isBlocked, onError }) {
    let mode = null;            // 'deepgram' | 'browser' | null (undecided)
    let listening = false;
    let audioContext = null;
    let workletNode = null;
    let micStream = null;
    let socket = null;
    let keepAlive = null;
    let recognition = null;     // webkitSpeechRecognition instance
    let finalText = '';

    // --- Deepgram path -----------------------------------------------------

    async function startDeepgram(token) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.audioWorklet.addModule(getWorkletUrl());
        workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');

        // Muted sink keeps the worklet pulled without feeding mic to speakers.
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        workletNode.connect(silentGain);
        silentGain.connect(audioContext.destination);

        micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
        });
        audioContext.createMediaStreamSource(micStream).connect(workletNode);

        const params = new URLSearchParams({
            model: 'nova-3-medical',
            language: 'en-GB',
            punctuate: 'true',
            smart_format: 'true',
            interim_results: 'true',
            endpointing: '400',      // ms of silence that ends an utterance
            encoding: 'linear16',
            sample_rate: String(audioContext.sampleRate),
            channels: '1',
        });

        socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['bearer', token]);
        socket.binaryType = 'arraybuffer';

        workletNode.port.onmessage = (e) => {
            if (listening && socket && socket.readyState === WebSocket.OPEN) {
                try { socket.send(e.data); } catch (_) { /* dropped chunk */ }
            }
        };

        socket.onmessage = (e) => {
            let msg;
            try { msg = JSON.parse(e.data); } catch (_) { return; }
            if (msg.type !== 'Results') return;
            if (isBlocked()) { finalText = ''; onInterim(''); return; }

            const text = msg.channel?.alternatives?.[0]?.transcript || '';
            if (msg.is_final) {
                if (text.trim()) finalText += (finalText ? ' ' : '') + text.trim();
                onInterim(finalText);
                // speech_final = endpointing silence reached → utterance done.
                if (msg.speech_final && finalText) {
                    const utterance = finalText;
                    finalText = '';
                    onUtterance(utterance);
                }
            } else {
                onInterim((finalText + ' ' + text).trim());
            }
        };

        // Deepgram closes idle sockets after ~10s of no audio.
        keepAlive = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                try { socket.send(JSON.stringify({ type: 'KeepAlive' })); } catch (_) {}
            }
        }, 8000);

        socket.onclose = () => {
            // Token expiry or network blip: restart transparently if still on.
            if (listening) {
                cleanupDeepgram();
                start().catch(() => stop());
            }
        };
    }

    function cleanupDeepgram() {
        if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
        if (socket) { try { socket.onclose = null; socket.close(); } catch (_) {} socket = null; }
        if (workletNode) { try { workletNode.port.onmessage = null; workletNode.disconnect(); } catch (_) {} workletNode = null; }
        if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
        if (audioContext) { try { audioContext.close(); } catch (_) {} audioContext = null; }
    }

    // --- Browser fallback path ---------------------------------------------

    function startBrowserRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) throw new Error('No speech recognition available');
        recognition = new SR();
        recognition.lang = 'en-GB';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
            if (isBlocked()) return;
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const r = event.results[i];
                if (r.isFinal) {
                    const t = r[0].transcript.trim();
                    if (t) onUtterance(t);
                } else {
                    interim += r[0].transcript;
                }
            }
            onInterim(interim.trim());
        };
        recognition.onend = () => { if (listening) { try { recognition.start(); } catch (_) {} } };
        // Browser recognition reports mic denial via callback, not by throwing.
        recognition.onerror = (e) => {
            if (['not-allowed', 'audio-capture', 'service-not-allowed'].includes(e.error)) {
                stop();
                if (onError) onError(new Error(`Speech recognition: ${e.error}`));
            }
        };
        recognition.start();
    }

    // --- Public API ---------------------------------------------------------

    async function start() {
        if (listening && mode) return;
        if (mode === null || mode === 'deepgram') {
            try {
                const resp = await fetch('/api/deepgram-token', { method: 'POST' });
                const data = await resp.json().catch(() => ({}));
                if (resp.ok && data.token) {
                    mode = 'deepgram';
                    await startDeepgram(data.token);
                    listening = true;
                    return;
                }
                // Deepgram is configured but broken (bad key, wrong role…):
                // surface the server's explanation instead of silently falling
                // back to a worse recogniser. Only data.demo means "not set up".
                if (data && data.error) throw new Error(data.error);
            } catch (err) {
                cleanupDeepgram();
                // Mic permission denied is fatal either way — don't fall through
                // to a second permission prompt from the browser recogniser.
                if (err && err.name === 'NotAllowedError') throw err;
                if (err && err.message && !(err instanceof TypeError)) throw err;
            }
        }
        mode = 'browser';
        listening = true;
        startBrowserRecognition();
    }

    function stop() {
        listening = false;
        finalText = '';
        onInterim('');
        cleanupDeepgram();
        if (recognition) { try { recognition.onend = null; recognition.stop(); } catch (_) {} recognition = null; }
    }

    return {
        start,
        stop,
        get listening() { return listening; },
    };
}
