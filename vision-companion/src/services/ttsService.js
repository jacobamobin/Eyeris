import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL } from '../config';
import { useAppStore } from '../store/useAppStore';

// Global AudioContext — created once on user gesture (unlockAudio), never recreated.
let audioCtx = null;
let currentSource = null;
let isPlaying = false;
let isStopped = false;
let speakerMuted = false;
let lastSpokenText = ''; // for barge-in detection

export function unlockAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

export function setSpeakerMuted(muted) {
  speakerMuted = muted;
  if (muted) stopSpeaking();
}

export function getLastSpokenText() {
  return lastSpokenText;
}

export function stopSpeaking() {
  isStopped = true;
  if (currentSource) {
    try { currentSource.stop(); } catch (e) {}
    currentSource = null;
  }
  isPlaying = false;
  const store = useAppStore.getState();
  store.setIsSpeaking(false);
  store.setAvatarState('idle');
}

// Single utterance — used for error/fallback messages
export async function speak(text) {
  if (!text || speakerMuted) return;
  stopSpeaking();
  isStopped = false;

  const store = useAppStore.getState();
  store.setIsSpeaking(true);
  store.setAvatarState('speaking');
  lastSpokenText = text;

  try {
    const audioBuffer = await fetchAndDecodeAudio(text);
    if (audioBuffer && !isStopped) {
      await playBuffer(audioBuffer);
    }
  } catch (err) {
    console.warn('ElevenLabs TTS failed:', err.message);
    // SpeechSynthesis fallback
    try {
      await speakWithSynthesis(text);
    } catch (err2) {
      console.warn('SpeechSynthesis fallback also failed:', err2.message);
    }
  } finally {
    if (!isStopped) {
      store.setIsSpeaking(false);
      store.setAvatarState('idle');
    }
  }
}

// Streaming pipeline: takes an async iterable of text chunks from Gemini SSE,
// detects sentence boundaries, fetches ElevenLabs audio in parallel, plays in order.
export async function streamAndSpeak(textStream) {
  if (speakerMuted) {
    // Drain the stream silently
    for await (const _ of textStream) {}
    return;
  }

  isStopped = false;
  const store = useAppStore.getState();
  store.setIsSpeaking(true);

  let buffer = '';
  const audioQueue = []; // Array of Promise<AudioBuffer|null>

  try {
    for await (const chunk of textStream) {
      if (isStopped) break;
      buffer += chunk;
      const { sentences, remainder } = extractSentences(buffer);
      buffer = remainder;

      for (const sentence of sentences) {
        if (sentence.length < 3) continue;
        lastSpokenText += sentence + ' ';
        // Start fetching audio immediately — don't await
        audioQueue.push(fetchAndDecodeAudio(sentence));
      }
    }

    // Flush any remaining text
    if (!isStopped && buffer.trim().length > 2) {
      lastSpokenText += buffer.trim() + ' ';
      audioQueue.push(fetchAndDecodeAudio(buffer.trim()));
    }

    // Play in order — by the time we get here, most fetches are already done
    for (const audioPromise of audioQueue) {
      if (isStopped) break;
      const audioBuffer = await audioPromise;
      if (isStopped) break;
      if (audioBuffer) {
        await playBuffer(audioBuffer);
      }
    }
  } catch (err) {
    console.warn('streamAndSpeak error:', err.message);
  } finally {
    if (!isStopped) {
      store.setIsSpeaking(false);
      store.setAvatarState('idle');
    }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractSentences(buffer) {
  const sentences = [];
  const regex = /[^.!?]*[.!?]+(?:\s|$)/g;
  let match;
  let lastIndex = 0;
  while ((match = regex.exec(buffer)) !== null) {
    sentences.push(match[0].trim());
    lastIndex = match.index + match[0].length;
  }
  return { sentences, remainder: buffer.slice(lastIndex) };
}

async function fetchAndDecodeAudio(text) {
  try {
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
    const arrayBuffer = await response.arrayBuffer();
    if (!audioCtx) unlockAudio();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn('fetchAndDecodeAudio failed:', err.message);
    return null;
  }
}

function playBuffer(audioBuffer) {
  return new Promise((resolve) => {
    if (!audioCtx) unlockAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    currentSource = source;
    isPlaying = true;

    source.onended = () => {
      currentSource = null;
      isPlaying = false;
      resolve();
    };

    source.start(0);
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
