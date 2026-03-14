import { useAppStore } from '../store/useAppStore';
import { captureFrame } from '../utils/frameCapture';
import { analyzeFrame } from './geminiService';
import { AGENT_INTERVAL_MS } from '../config';
import {
  getRelevantMemories,
  saveMemory,
  saveConversation,
  pruneOldMemories,
} from './memoryService';

let intervalId = null;
let isRunning = false;

function handleSafetyAlert(alert, store) {
  if (!alert) return;
  const id = 'gemini-' + Date.now();

  if (alert.level === 'critical') {
    store.setSafetyAlert({ ...alert, id });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } else if (alert.level === 'warning') {
    store.setSafetyAlert({ ...alert, id });
    if (navigator.vibrate) navigator.vibrate(150);
  } else if (alert.level === 'info') {
    // Info alerts go only to caption, not banner
    if (alert.message) {
      store.setCurrentCaption(prev => prev || alert.message);
    }
  }
}

function handleMemoryUpdate(memoryUpdate) {
  if (!memoryUpdate || !memoryUpdate.content) return;
  try {
    saveMemory(
      memoryUpdate.content,
      memoryUpdate.category || 'general',
      memoryUpdate.importance || 0.5,
      memoryUpdate.tags || []
    );
  } catch (err) {
    console.warn('Memory save failed:', err);
  }
}

export function startAgentLoop() {
  if (intervalId) return;

  // Prune old memories on startup
  try { pruneOldMemories(); } catch (e) {}

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

      // Inject relevant memories
      const memories = getRelevantMemories('scene navigation obstacle', 5);

      const result = await analyzeFrame(base64, null, memories, store.mode);
      if (!result) {
        isRunning = false;
        store.setIsProcessing(false);
        return;
      }

      if (result.objects) store.setDetectedObjects(result.objects);
      if (result.caption) store.setCurrentCaption(result.caption);

      handleSafetyAlert(result.safety_alert, store);
      handleMemoryUpdate(result.memory_update);
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

    // Get relevant memories based on query or mode
    const searchQuery = userQuery || mode;
    const memories = getRelevantMemories(searchQuery, 5);

    const result = await analyzeFrame(base64, userQuery, memories, mode);
    if (!result) return null;

    if (result.objects) store.setDetectedObjects(result.objects);
    if (result.caption) store.setCurrentCaption(result.caption);

    handleSafetyAlert(result.safety_alert, store);
    handleMemoryUpdate(result.memory_update);

    // Save conversation turn
    if (userQuery && result.spoken_response) {
      try {
        await saveConversation({
          role: 'user',
          content: userQuery,
          response: result.spoken_response,
          mode,
        });
      } catch (e) {}
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
