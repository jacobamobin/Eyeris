import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL } from '../config';
import { useAppStore } from '../store/useAppStore';

// Global AudioContext — must be created/resumed during a user gesture to bypass autoplay policy.
// We unlock it once on first TALK press and reuse it for all subsequent audio.
let audioCtx = null;
let currentSource = null;

export function unlockAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

export function stopSpeaking() {
  if (currentSource) {
    try { currentSource.stop(); } catch (e) {}
    currentSource = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  const store = useAppStore.getState();
  store.setIsSpeaking(false);
  store.setAvatarState('idle');
}

export async function speak(text) {
  if (!text) return;
  stopSpeaking();

  const store = useAppStore.getState();
  store.setIsSpeaking(true);
  store.setAvatarState('speaking');

  try {
    const arrayBuffer = await fetchElevenLabsBuffer(text);
    if (arrayBuffer) {
      await playBuffer(arrayBuffer);
      return;
    }
  } catch (err) {
    console.warn('ElevenLabs failed, falling back to SpeechSynthesis:', err.message);
  }

  // SpeechSynthesis fallback
  try {
    await speakWithSynthesis(text);
  } catch (err) {
    console.warn('SpeechSynthesis fallback failed:', err.message);
  } finally {
    useAppStore.getState().setIsSpeaking(false);
    useAppStore.getState().setAvatarState('idle');
  }
}

async function fetchElevenLabsBuffer(text) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!response.ok) throw new Error(`ElevenLabs ${response.status}`);
  return await response.arrayBuffer();
}

function playBuffer(arrayBuffer) {
  return new Promise((resolve, reject) => {
    // Ensure AudioContext is running
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    audioCtx.decodeAudioData(arrayBuffer, (decoded) => {
      const source = audioCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(audioCtx.destination);
      currentSource = source;

      source.onended = () => {
        currentSource = null;
        useAppStore.getState().setIsSpeaking(false);
        useAppStore.getState().setAvatarState('idle');
        resolve();
      };

      source.start(0);
    }, reject);
  });
}

function speakWithSynthesis(text) {
  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis;
    if (!synth) { reject(new Error('No speech synthesis')); return; }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.onend = () => {
      useAppStore.getState().setIsSpeaking(false);
      useAppStore.getState().setAvatarState('idle');
      resolve();
    };
    utterance.onerror = reject;
    synth.speak(utterance);
  });
}
