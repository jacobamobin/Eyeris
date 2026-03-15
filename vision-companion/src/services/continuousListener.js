/**
 * continuousListener.js
 * Always-on voice detection using OpenAI Whisper API.
 *
 * Uses AudioContext AnalyserNode for VAD (voice activity detection).
 * When speech is detected → records → on silence → sends to Whisper → fires callback.
 * Speculatively captures a camera frame while user is talking.
 */

import { OPENAI_API_KEY } from '../config';

// ─── State ───────────────────────────────────────────────────────────────────
let active = false;
let micMuted = false;
let ttsActive = false;
let _ttsJustEnded = null;

let _onSpeech = null;
let _onBargeIn = null;
let _getVideoRef = null;
let _getIsSpeaking = null;

let audioCtx = null;
let analyser = null;
let micStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isSending = false;
let silenceTimer = null;
let vadInterval = null;
let latestFrameCapture = null;

// VAD tuning
const SPEECH_THRESHOLD = 15;      // RMS threshold to detect speech
const SILENCE_DURATION_MS = 800;   // silence before we cut and send
const VAD_CHECK_MS = 80;          // how often to check audio level

// ─── Public API ──────────────────────────────────────────────────────────────

export function setMicMuted(muted) {
  micMuted = muted;
  if (muted && isRecording) _stopRecording(true); // discard
}

export function onTTSStart() {
  ttsActive = true;
  if (isRecording) _stopRecording(true); // discard — AI is speaking
}

export function onTTSEnd() {
  ttsActive = false;
  _ttsJustEnded = Date.now();
}

export async function startContinuousListening({ onSpeech, onBargeIn, getVideoRef, getIsSpeaking }) {
  _onSpeech = onSpeech;
  _onBargeIn = onBargeIn;
  _getVideoRef = getVideoRef;
  _getIsSpeaking = getIsSpeaking;

  active = true;

  try {
    console.log('Whisper listener: requesting mic...');
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('Whisper listener: mic acquired, tracks:', micStream.getAudioTracks().length);
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    // Start VAD polling
    _startVAD();
    console.log('Whisper listener: VAD started, threshold:', SPEECH_THRESHOLD);
  } catch (err) {
    console.error('Mic access failed:', err);
    return false;
  }
  return true;
}

export function stopContinuousListening() {
  active = false;
  if (vadInterval) { clearInterval(vadInterval); vadInterval = null; }
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch (_) {}
  }
  if (micStream) {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

// Legacy exports
export function pauseListening() { /* no-op */ }
export function resumeListening() { /* no-op */ }

// ─── VAD (Voice Activity Detection) ─────────────────────────────────────────

function _getRMS() {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length) * 100;
}

function _startVAD() {
  if (vadInterval) clearInterval(vadInterval);
  vadInterval = setInterval(() => {
    if (!active || micMuted || ttsActive || isSending) return;

    // Suppress echo right after TTS
    if (_ttsJustEnded && Date.now() - _ttsJustEnded < 600) return;

    const rms = _getRMS();

    if (rms > SPEECH_THRESHOLD) {
      // Speech detected
      if (!isRecording) {
        console.log('VAD: speech detected, RMS:', rms.toFixed(1));
        _startRecording();
      }
      // Reset silence timer — user is still talking
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    } else if (isRecording) {
      // Silence while recording — start countdown
      if (!silenceTimer) {
        silenceTimer = setTimeout(() => {
          silenceTimer = null;
          _stopRecording(false); // send to Whisper
        }, SILENCE_DURATION_MS);
      }
    }
  }, VAD_CHECK_MS);
}

// ─── Recording ──────────────────────────────────────────────────────────────

function _startRecording() {
  if (isRecording || !micStream) return;
  isRecording = true;
  recordedChunks = [];

  // Capture a frame speculatively while user starts talking
  _captureFrameSpeculative();

  mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start(100); // collect in 100ms chunks
}

function _stopRecording(discard) {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }

  const recorder = mediaRecorder;
  mediaRecorder = null;

  if (discard) {
    try { recorder.stop(); } catch (_) {}
    recordedChunks = [];
    return;
  }

  recorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    recordedChunks = [];
    // Skip very short recordings (< 0.3s worth of data)
    if (blob.size < 5000) return;

    const preCapture = latestFrameCapture;
    latestFrameCapture = null;

    await _transcribe(blob, preCapture);
  };

  try { recorder.stop(); } catch (_) {}
}

// ─── Whisper Transcription ──────────────────────────────────────────────────

async function _transcribe(audioBlob, preCapture) {
  if (isSending) return;
  isSending = true;

  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'speech.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'text');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!res.ok) {
      console.error('Whisper API error:', res.status);
      return;
    }

    const transcript = (await res.text()).trim();
    console.log('Whisper transcript:', transcript);
    if (!transcript || transcript.length < 3) return;

    // Check if TTS started while we were transcribing (barge-in)
    if (ttsActive && _onBargeIn) {
      _onBargeIn(transcript);
    } else if (_onSpeech) {
      _onSpeech(transcript, preCapture);
    }
  } catch (err) {
    console.error('Whisper transcription error:', err);
  } finally {
    isSending = false;
  }
}

// ─── Speculative Frame Capture ──────────────────────────────────────────────

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
  } catch (_) {
    latestFrameCapture = null;
  }
}
