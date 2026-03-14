import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL } from '../config';
import { useAppStore } from '../store/useAppStore';

let currentAudio = null;
let bargeInEnabled = false;

export async function speak(text) {
  if (!text) return;

  // Stop current speech if any
  stopSpeaking();

  const store = useAppStore.getState();
  store.setIsSpeaking(true);
  store.setAvatarState('speaking');

  try {
    // Try ElevenLabs first
    const audioBlob = await fetchElevenLabs(text);
    if (audioBlob) {
      await playAudioBlob(audioBlob);
      return;
    }
  } catch (err) {
    console.warn('ElevenLabs failed:', err.message);
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

async function fetchElevenLabs(text) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs error: ${response.status}`);
  }

  return await response.blob();
}

function playAudioBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      useAppStore.getState().setIsSpeaking(false);
      useAppStore.getState().setAvatarState('idle');
      resolve();
    };

    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      currentAudio = null;
      reject(e);
    };

    audio.play().catch(reject);
  });
}

function speakWithSynthesis(text) {
  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      reject(new Error('No speech synthesis'));
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      useAppStore.getState().setIsSpeaking(false);
      useAppStore.getState().setAvatarState('idle');
      resolve();
    };

    utterance.onerror = reject;
    synth.speak(utterance);
  });
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  useAppStore.getState().setIsSpeaking(false);
}
