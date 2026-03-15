/**
 * agentLoop.js — Always-on VisionCompanion agent.
 *
 * Scan loop runs in ALL modes continuously — provides overlays everywhere.
 * Voice handler adds 2s cooldown after speaking so scan doesn't compete.
 */

import { useAppStore } from '../store/useAppStore';
import { captureFrame } from '../utils/frameCapture';
import { analyzeFrame, streamVoiceResponse, addToHistory } from './geminiService';
import { speak, stopSpeaking, unlockAudio, streamAndSpeak, registerTTSHooks } from './ttsService';
import { startContinuousListening, stopContinuousListening, onTTSStart, onTTSEnd } from './continuousListener';
import { getRelevantMemories, saveMemory, saveConversation, pruneOldMemories } from './memoryService';
import { AGENT_INTERVAL_MS } from '../config';

function jaccardSimilarity(a, b) {
  if (!a || !b) return 0;
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

let scanIntervalId = null;
let isScanRunning = false;
let isVoiceRunning = false;
let lastVoiceEndTime = 0;
let postVoiceScanTimer = null;

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

// ─── Voice speech handler ─────────────────────────────────────────────────────

async function handleSpeech(transcript, preCapture) {
  if (isVoiceRunning) return;
  isVoiceRunning = true;

  const store = useAppStore.getState();
  store.setAvatarState('thinking');
  store.setUserQuery(transcript);
  store.setCurrentCaption(`"${transcript}"`);

  try {
    const frame = preCapture || await captureFrame(store.videoRef);
    if (!frame) return;

    const memories = getRelevantMemories(transcript, 3).map(m => m.content);

    // Add user message to history
    addToHistory('user', transcript);

    const textStream = streamVoiceResponse(frame, transcript, memories);
    store.setAvatarState('speaking');
    const fullResponse = await streamAndSpeak(textStream);

    // Add model response to history for multi-turn
    if (fullResponse) addToHistory('model', fullResponse);

    try { await saveConversation({ role: 'user', content: transcript, mode: store.mode }); } catch (_) {}
  } catch (err) {
    console.error('Voice agent error:', err);
    try { await speak('Sorry, something went wrong. Please try again.'); } catch (_) {}
  } finally {
    isVoiceRunning = false;
    lastVoiceEndTime = Date.now();
    store.setAvatarState('idle');
    // Fire an immediate scan once audio settles so overlays refresh right away
    if (postVoiceScanTimer) clearTimeout(postVoiceScanTimer);
    postVoiceScanTimer = setTimeout(() => { lastVoiceEndTime = 0; runScanOnce(); }, 300);
  }
}

async function runScanOnce() {
  if (isScanRunning || isVoiceRunning) return;
  isScanRunning = true;
  const store = useAppStore.getState();
  store.setIsProcessing(true);
  try {
    const base64 = await captureFrame(store.videoRef);
    if (!base64) return;
    const memories = getRelevantMemories('scene navigation', 3);
    const result = await analyzeFrame(base64, null, memories, 'scan');
    if (!result) return;
    if (result.objects?.length) store.setDetectedObjects(result.objects);
    if (result.caption && jaccardSimilarity(result.caption, store.currentCaption) < 0.65) {
      store.setCurrentCaption(result.caption);
    }
    handleSafetyAlert(result.safety_alert, store);
    handleMemoryUpdate(result.memory_update);
  } catch (_) {}
  finally {
    isScanRunning = false;
    store.setIsProcessing(false);
  }
}

// ─── Track A: Always-On Vision Scan (runs in ALL modes) ───────────────────────

export function startAgentLoop() {
  if (scanIntervalId) return;
  try { pruneOldMemories(); } catch (_) {}

  scanIntervalId = setInterval(async () => {
    const store = useAppStore.getState();
    // Skip if voice is active or recently ended (2s cooldown)
    if (isScanRunning || isVoiceRunning) return;
    if (Date.now() - lastVoiceEndTime < 2000) return;
    if (!store.videoRef) return;

    isScanRunning = true;
    store.setIsProcessing(true);

    try {
      const base64 = await captureFrame(store.videoRef);
      if (!base64) return;

      const memories = getRelevantMemories('scene navigation', 3);
      const result = await analyzeFrame(base64, null, memories, 'scan');
      if (!result) return;

      if (result.objects?.length) {
        console.log('Scan: setting', result.objects.length, 'objects');
        store.setDetectedObjects(result.objects);
      }
      if (result.caption && jaccardSimilarity(result.caption, store.currentCaption) < 0.65) {
        store.setCurrentCaption(result.caption);
      }
      handleSafetyAlert(result.safety_alert, store);
      handleMemoryUpdate(result.memory_update);
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
  registerTTSHooks(onTTSStart, onTTSEnd);

  startContinuousListening({
    onSpeech: async (transcript, preCapture) => {
      await handleSpeech(transcript, preCapture);
    },
    onBargeIn: async (transcript) => {
      stopSpeaking();
      isVoiceRunning = false;
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

// ─── READ mode one-shot (streaming) ──────────────────────────────────────────

export async function runOnceRead() {
  const store = useAppStore.getState();
  if (!store.videoRef || isVoiceRunning) return;
  isVoiceRunning = true;
  store.setAvatarState('thinking');

  try {
    const frame = await captureFrame(store.videoRef);
    if (!frame) return;
    const memories = getRelevantMemories('read text', 3).map(m => m.content);
    const textStream = streamVoiceResponse(frame, 'Describe the full scene in front of me — what you see, where things are spatially, and read any visible text word for word.', memories);
    store.setAvatarState('speaking');
    await streamAndSpeak(textStream);
  } catch (err) {
    console.error('runOnceRead error:', err);
  } finally {
    isVoiceRunning = false;
    lastVoiceEndTime = Date.now();
    store.setAvatarState('idle');
    if (postVoiceScanTimer) clearTimeout(postVoiceScanTimer);
    postVoiceScanTimer = setTimeout(() => { lastVoiceEndTime = 0; runScanOnce(); }, 300);
  }
}
