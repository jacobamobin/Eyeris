let mediaRecorder = null;
let audioChunks = [];
let analyserNode = null;
let audioCtx = null;

export async function startRecording(stream) {
  audioChunks = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
  mediaRecorder = new MediaRecorder(stream, { mimeType });
  mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
  mediaRecorder.start();
}

export async function stopRecording() {
  return new Promise((resolve) => {
    mediaRecorder.onstop = () => resolve(new Blob(audioChunks, { type: mediaRecorder.mimeType }));
    mediaRecorder.stop();
  });
}

export function createAnalyser(stream) {
  if (audioCtx) {
    try { audioCtx.close(); } catch (e) {}
  }
  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 256;
  source.connect(analyserNode);
  return analyserNode;
}

export function getRMS(analyser) {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

export function detectSilence(analyser, threshold = 0.01, durationMs = 2000) {
  return new Promise((resolve) => {
    let silenceStart = null;
    const check = () => {
      const rms = getRMS(analyser);
      if (rms < threshold) {
        if (!silenceStart) silenceStart = Date.now();
        else if (Date.now() - silenceStart >= durationMs) { resolve(); return; }
      } else {
        silenceStart = null;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

export function closeAudioContext() {
  if (audioCtx) {
    try { audioCtx.close(); } catch (e) {}
    audioCtx = null;
  }
}
