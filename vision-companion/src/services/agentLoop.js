import { useAppStore } from '../store/useAppStore';
import { captureFrame } from '../utils/frameCapture';
import { analyzeFrame } from './geminiService';
import { AGENT_INTERVAL_MS } from '../config';

let intervalId = null;
let isRunning = false;

export function startAgentLoop() {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    const store = useAppStore.getState();
    if (!store.isScanning || isRunning) return;
    if (store.mode !== 'scan') return;
    if (!store.videoRef) return;

    isRunning = true;
    store.setIsProcessing(true);

    try {
      const base64 = await captureFrame(store.videoRef);
      if (!base64) {
        isRunning = false;
        store.setIsProcessing(false);
        return;
      }

      const result = await analyzeFrame(base64, null, store.memories, store.mode);
      if (!result) {
        isRunning = false;
        store.setIsProcessing(false);
        return;
      }

      if (result.objects) store.setDetectedObjects(result.objects);
      if (result.caption) store.setCurrentCaption(result.caption);
      if (result.safety_alert) {
        store.setSafetyAlert({
          ...result.safety_alert,
          id: 'gemini-' + Date.now(),
        });
        if (navigator.vibrate && result.safety_alert.level === 'critical') {
          navigator.vibrate([200, 100, 200]);
        }
      }
    } catch (err) {
      console.error('Agent loop error:', err);
    }

    isRunning = false;
    store.setIsProcessing(false);
  }, AGENT_INTERVAL_MS);
}

export function stopAgentLoop() {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  isRunning = false;
}

export async function runOnce(mode, userQuery = null) {
  const store = useAppStore.getState();
  if (!store.videoRef) return null;
  if (isRunning) return null;

  isRunning = true;
  store.setIsProcessing(true);
  store.setAvatarState('thinking');

  try {
    const base64 = await captureFrame(store.videoRef);
    if (!base64) return null;

    const result = await analyzeFrame(base64, userQuery, store.memories, mode);
    if (!result) return null;

    if (result.objects) store.setDetectedObjects(result.objects);
    if (result.caption) store.setCurrentCaption(result.caption);
    if (result.safety_alert) {
      store.setSafetyAlert({
        ...result.safety_alert,
        id: 'gemini-' + Date.now(),
      });
    }

    return result;
  } catch (err) {
    console.error('runOnce error:', err);
    return null;
  } finally {
    isRunning = false;
    store.setIsProcessing(false);
  }
}
