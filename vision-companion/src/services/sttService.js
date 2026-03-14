import { OPENAI_API_KEY } from '../config';

export async function transcribeAudio(audioBlob) {
  // Try Whisper API first
  try {
    const formData = new FormData();
    const file = new File([audioBlob], 'audio.webm', { type: audioBlob.type });
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.status}`);
    }
    const data = await response.json();
    return data.text || '';
  } catch (err) {
    console.warn('Whisper failed, using Web Speech fallback:', err.message);
    return null; // Caller will handle fallback
  }
}

export function startWebSpeechRecognition() {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      reject(new Error('Speech recognition not supported'));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      resolve(transcript);
    };

    recognition.onerror = (event) => {
      reject(new Error(`Web Speech error: ${event.error}`));
    };

    recognition.start();

    // Timeout after 10s
    setTimeout(() => {
      recognition.stop();
      reject(new Error('Speech recognition timeout'));
    }, 10000);
  });
}
