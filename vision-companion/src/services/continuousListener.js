/**
 * continuousListener.js
 * Always-on voice detection with speculative frame capture and barge-in support.
 *
 * Key design:
 * - interimResults: true — on interim result, capture frame speculatively
 * - On final result: if micMuted, ignore. If isSpeaking, fire onBargeIn. Else fire onSpeech.
 * - Auto-restart on end/error
 */

let recognition = null;
let active = false;
let restartTimer = null;
let micMuted = false;

let latestFrameCapture = null; // pre-captured base64 from interim speech
let _ttsJustEnded = null;      // timestamp — suppress echo after TTS stops

let _onSpeech = null;
let _onBargeIn = null;
let _getVideoRef = null;
let _getIsSpeaking = null;

export function setMicMuted(muted) {
  micMuted = muted;
}

// Called by ttsService when TTS starts — abort recognition so AI voice isn't picked up
export function onTTSStart() {
  if (recognition) {
    try { recognition.abort(); } catch (_) {}
  }
}

// Called by ttsService when TTS ends — wait for echo to clear, then restart
export function onTTSEnd() {
  _ttsJustEnded = Date.now();
  if (active) {
    restartTimer = setTimeout(_start, 450); // 450ms gap clears echo
  }
}

export function startContinuousListening({ onSpeech, onBargeIn, getVideoRef, getIsSpeaking }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Web Speech API not supported — continuous listening unavailable');
    return false;
  }

  _onSpeech = onSpeech;
  _onBargeIn = onBargeIn;
  _getVideoRef = getVideoRef;
  _getIsSpeaking = getIsSpeaking;

  active = true;
  _start();
  return true;
}

function _captureFrameSpeculative() {
  try {
    const videoRef = _getVideoRef?.();
    if (!videoRef || videoRef.readyState < 2) return;

    const canvas = document.createElement('canvas');
    const maxWidth = 640;
    const scale = maxWidth / videoRef.videoWidth;
    canvas.width = maxWidth;
    canvas.height = Math.round(videoRef.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    latestFrameCapture = dataUrl.split(',')[1];
  } catch (e) {
    latestFrameCapture = null;
  }
}

function _start() {
  if (!active) return;
  if (recognition) {
    try { recognition.stop(); } catch (_) {}
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];

    if (!result.isFinal) {
      // Interim result — speculatively capture a frame right now
      _captureFrameSpeculative();
      return;
    }

    // Final result — apply quality filters before firing
    const transcript = result[0].transcript.trim();
    const confidence = result[0].confidence ?? 1;
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;

    // Reject: muted, too short, too few words, low confidence
    if (micMuted) return;
    if (transcript.length < 6) return;
    if (wordCount < 2) return;
    if (confidence < 0.60) return;

    // Reject if it looks like the AI echoed its own output back
    // (very short pause after speaking → skip this result)
    if (_ttsJustEnded && Date.now() - _ttsJustEnded < 600) return;

    const preCapture = latestFrameCapture;
    latestFrameCapture = null;
    if (_onSpeech) _onSpeech(transcript, preCapture);
  };

  recognition.onerror = (event) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.warn('Speech recognition error:', event.error);
    }
  };

  recognition.onend = () => {
    if (active) {
      restartTimer = setTimeout(_start, 300);
    }
  };

  try {
    recognition.start();
  } catch (e) {
    // Already started — ignore
  }
}

export function stopContinuousListening() {
  active = false;
  if (restartTimer) clearTimeout(restartTimer);
  if (recognition) {
    try { recognition.stop(); } catch (_) {}
    recognition = null;
  }
}

// Legacy exports kept for backward compat
export function pauseListening() {
  if (recognition) {
    try { recognition.abort(); } catch (_) {}
  }
}

export function resumeListening() {
  if (active) _start();
}
