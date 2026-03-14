/**
 * agentLoop.js — Always-on VisionCompanion agent.
 *
 * Two parallel tracks:
 *   Track A (vision): Gemini analyzes the camera frame every 2.5s (scan/read/find overlays).
 *   Track B (voice):  Continuous Web Speech listens for user speech anytime.
 *
 * Voice is ALWAYS on. No mode toggle required to speak.
 * Barge-in is supported: speaking while AI talks cancels TTS and processes new query.
 */

import { useAppStore } from '../store/useAppStore';
import { captureFrame } from '../utils/frameCapture';
import { analyzeFrame, streamVoiceResponse } from './geminiService';
import { speak, stopSpeaking, unlockAudio, streamAndSpeak } from './ttsService';
import { startContinuousListening, stopContinuousListening } from './continuousListener';
import { getRelevantMemories, saveMemory, saveConversation, pruneOldMemories } from './memoryService';
import { AGENT_INTERVAL_MS } from '../config';

let scanIntervalId = null;
let isScanRunning = false;
let isVoiceRunning = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function handleSafetyAlert(alert, store) {
  if (!alert) return;
  const id = 'gemini-' + Date.now();
  if (store.dismissedAlerts?.includes(id)) return;
  if (alert.level === 'critical' || alert.level === 'warning') {
    store.setSafetyAlert({ ...alert, id });
    if (alert.level === 'critical' && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
}

function handleMemoryUpdate(memoryUpdate) {
  if (!memoryUpdate?.content) return;
  try {
    saveMemory(
      memoryUpdate.content,
      memoryUpdate.category || 'general',
      memoryUpdate.importance || 0.5,
      memoryUpdate.tags || []
    );
  } catch (_) {}
}

function buildDepthContext(depthBuffer, depthWidth, depthHeight) {
  if (!depthBuffer) return 'No depth data available.';
  const positions = [
    { name: 'top-left', x: 0.1, y: 0.1 }, { name: 'top-center', x: 0.5, y: 0.1 }, { name: 'top-right', x: 0.9, y: 0.1 },
    { name: 'center-left', x: 0.1, y: 0.5 }, { name: 'center', x: 0.5, y: 0.5 }, { name: 'center-right', x: 0.9, y: 0.5 },
    { name: 'bottom-center', x: 0.5, y: 0.9 },
  ];
  const readings = positions.map(p => {
    const x = Math.round(p.x * depthWidth);
    const y = Math.round(p.y * depthHeight);
    const val = depthBuffer[y * depthWidth + x] || 0;
    const dist = val > 200 ? 'very close' : val > 150 ? 'close' : val > 100 ? 'mid' : val > 50 ? 'far' : 'very far';
    return `${p.name}:${dist}(${val})`;
  });
  return `Depth (255=nearest,0=farthest): ${readings.join(', ')}`;
}

// ─── Voice speech handler (shared between onSpeech and barge-in retry) ────────

async function handleSpeech(transcript, preCapture) {
  if (isVoiceRunning) return;
  isVoiceRunning = true;

  const store = useAppStore.getState();
  store.setAvatarState('thinking');
  store.setUserQuery(transcript);
  store.setCurrentCaption(`"${transcript}"`);

  try {
    const frame = preCapture || await captureFrame(store.videoRef);
    const { depthBuffer, depthWidth, depthHeight } = store;
    const depthCtx = buildDepthContext(depthBuffer, depthWidth, depthHeight);
    const memories = getRelevantMemories(transcript, 3).map(m => m.content);

    // Start Gemini streaming immediately — yields text chunks
    const textStream = streamVoiceResponse(frame, transcript, memories, depthCtx);

    store.setAvatarState('speaking');
    await streamAndSpeak(textStream);

    try {
      await saveConversation({ role: 'user', content: transcript, mode: 'voice' });
    } catch (_) {}
  } catch (err) {
    console.error('Voice agent error:', err);
    await speak('Sorry, something went wrong. Please try again.');
  } finally {
    isVoiceRunning = false;
    store.setAvatarState('idle');
  }
}

// ─── Track A: Always-On Vision Scan ──────────────────────────────────────────

export function startAgentLoop() {
  if (scanIntervalId) return;
  try { pruneOldMemories(); } catch (_) {}

  scanIntervalId = setInterval(async () => {
    const store = useAppStore.getState();
    if (isScanRunning || isVoiceRunning) return;
    if (!store.videoRef || !store.isScanning) return;

    isScanRunning = true;
    store.setIsProcessing(true);

    try {
      const base64 = await captureFrame(store.videoRef);
      if (!base64) return;

      const memories = getRelevantMemories('scene navigation', 3);
      const result = await analyzeFrame(base64, null, memories, 'scan');
      if (!result) return;

      if (result.objects?.length) store.setDetectedObjects(result.objects);
      if (result.caption) store.setCurrentCaption(result.caption);
      handleSafetyAlert(result.safety_alert, store);
      handleMemoryUpdate(result.memory_update);

      if (result.safety_alert?.level === 'critical' && result.spoken_response) {
        store.setAvatarState('speaking');
        await speak(result.spoken_response);
        store.setAvatarState('idle');
      }
    } catch (err) {
      console.error('Scan loop error:', err);
    } finally {
      isScanRunning = false;
      store.setIsProcessing(false);
    }
  }, AGENT_INTERVAL_MS);
}

export function stopAgentLoop() {
  if (scanIntervalId) clearInterval(scanIntervalId);
  scanIntervalId = null;
  isScanRunning = false;
}

// ─── Track B: Always-On Voice (streaming, barge-in) ──────────────────────────

export function startVoiceAgent() {
  unlockAudio();

  startContinuousListening({
    onSpeech: async (transcript, preCapture) => {
      await handleSpeech(transcript, preCapture);
    },
    onBargeIn: async (transcript) => {
      // Cancel current TTS immediately
      stopSpeaking();
      isVoiceRunning = false;
      // Small pause to let audio buffers drain
      setTimeout(() => handleSpeech(transcript, null), 100);
    },
    getVideoRef: () => useAppStore.getState().videoRef,
    getIsSpeaking: () => useAppStore.getState().isSpeaking,
  });
}

export function stopVoiceAgent() {
  stopContinuousListening();
  isVoiceRunning = false;
}

// ─── One-shot for READ / FIND modes ──────────────────────────────────────────

export async function runOnce(mode, userQuery = null) {
  const store = useAppStore.getState();
  if (!store.videoRef || isScanRunning) return null;

  isScanRunning = true;
  store.setIsProcessing(true);
  store.setAvatarState('thinking');

  try {
    const base64 = await captureFrame(store.videoRef);
    if (!base64) return null;

    const memories = getRelevantMemories(userQuery || mode, 5);
    const result = await analyzeFrame(base64, userQuery, memories, mode);
    if (!result) return null;

    if (result.objects?.length) store.setDetectedObjects(result.objects);
    if (result.caption) store.setCurrentCaption(result.caption);
    handleSafetyAlert(result.safety_alert, store);
    handleMemoryUpdate(result.memory_update);

    return result;
  } catch (err) {
    console.error('runOnce error:', err);
    return null;
  } finally {
    isScanRunning = false;
    store.setIsProcessing(false);
  }
}
