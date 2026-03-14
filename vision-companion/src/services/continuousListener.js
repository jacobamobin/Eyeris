/**
 * continuousListener.js
 * Always-on voice detection using Web Speech API continuous mode.
 * Fires a callback whenever speech is finalized, with no user button press required.
 */

let recognition = null;
let onSpeechCallback = null;
let active = false;
let restartTimer = null;

export function startContinuousListening(onSpeech) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Web Speech API not supported — continuous listening unavailable');
    return false;
  }

  onSpeechCallback = onSpeech;
  active = true;
  _start();
  return true;
}

function _start() {
  if (!active) return;
  if (recognition) {
    try { recognition.stop(); } catch (_) {}
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (result.isFinal) {
      const transcript = result[0].transcript.trim();
      if (transcript.length > 1 && onSpeechCallback) {
        onSpeechCallback(transcript);
      }
    }
  };

  recognition.onerror = (event) => {
    // 'no-speech' and 'aborted' are normal — just restart
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.warn('Speech recognition error:', event.error);
    }
  };

  recognition.onend = () => {
    // Auto-restart after a brief pause to keep it always-on
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

export function pauseListening() {
  if (recognition) {
    try { recognition.abort(); } catch (_) {}
  }
}

export function resumeListening() {
  if (active) _start();
}
