/**
 * agentLoop.js — Always-on VisionCompanion agent.
 *
 * Two parallel tracks:
 *   Track A (vision): Gemini analyzes the camera frame every 2.5s.
 *   Track B (voice):  Continuous Web Speech listens for user speech anytime.
 *
 * When the user speaks, Track B interrupts, processes the voice query through
 * the Railtracks backend (or Gemini directly as fallback), then resumes.
 */

import { useAppStore } from '../store/useAppStore';
import { captureFrame } from '../utils/frameCapture';
import { analyzeFrame } from './geminiService';
import { speak, stopSpeaking, unlockAudio } from './ttsService';
import { startContinuousListening, stopContinuousListening, pauseListening, resumeListening } from './continuousListener';
import { getRelevantMemories, saveMemory, saveConversation, pruneOldMemories } from './memoryService';
import { AGENT_INTERVAL_MS, RAILTRACKS_API_URL } from '../config';

let scanIntervalId = null;
let isScanRunning = false;
let isVoiceRunning = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function handleSafetyAlert(alert, store) {
  if (!alert) return;
  const id = 'gemini-' + Date.now();
  if (store.dismissedAlerts?.includes(id)) return;

  if (alert.level === 'critical') {
    store.setSafetyAlert({ ...alert, id });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } else if (alert.level === 'warning') {
    store.setSafetyAlert({ ...alert, id });
  }
  // info: caption only, no banner
}

function handleMemoryUpdate(memoryUpdate) {
  if (!memoryUpdate?.content) return;
  try {
    saveMemory(memoryUpdate.content, memoryUpdate.category || 'general', memoryUpdate.importance || 0.5, memoryUpdate.tags || []);
  } catch (_) {}
}

// ─── Railtracks Backend ───────────────────────────────────────────────────────
// Routes voice queries through the Railtracks Python agent when available.
// Falls back to direct Gemini if the backend isn't running.

async function queryRailtracksAgent(imageBase64, userQuery, depthContext, memories) {
  try {
    const res = await fetch(`${RAILTRACKS_API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ image_b64: imageBase64, user_query: userQuery, depth_context: depthContext, memories }),
    });
    if (!res.ok) throw new Error(`Railtracks API ${res.status}`);
    return await res.json();
  } catch (err) {
    // Backend not running — fall through to direct Gemini
    return null;
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

      // Proactively speak critical alerts and first-time scene summaries
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

// ─── Track B: Always-On Voice Processing ─────────────────────────────────────

export function startVoiceAgent() {
  unlockAudio();

  startContinuousListening(async (transcript) => {
    if (isVoiceRunning) return;

    const store = useAppStore.getState();
    if (store.isSpeaking) {
      // Barge-in: stop current speech then process new query
      stopSpeaking();
      await new Promise(r => setTimeout(r, 150));
    }

    isVoiceRunning = true;
    pauseListening(); // Don't pick up TTS output as speech input
    store.setAvatarState('thinking');
    store.setUserQuery(transcript);
    store.setCurrentCaption(`You: "${transcript}"`);

    try {
      const base64 = await captureFrame(store.videoRef);
      if (!base64) {
        await speak("I couldn't see anything. Please make sure the camera is active.");
        return;
      }

      const { depthBuffer, depthWidth, depthHeight } = store;
      const depthContext = buildDepthContext(depthBuffer, depthWidth, depthHeight);
      const memories = getRelevantMemories(transcript, 5);

      // Try Railtracks backend first, fall back to direct Gemini
      let result = await queryRailtracksAgent(base64, transcript, depthContext, memories.map(m => m.content));
      if (!result) {
        result = await analyzeFrame(base64, transcript, memories, 'talk');
      }

      if (!result) {
        await speak("Sorry, I couldn't process that. Please try again.");
        return;
      }

      if (result.objects?.length) store.setDetectedObjects(result.objects);
      if (result.caption) store.setCurrentCaption(result.caption);
      handleSafetyAlert(result.safety_alert, store);
      handleMemoryUpdate(result.memory_update);

      const response = result.spoken_response || result.caption || "I see the scene but have no specific response.";
      store.setAvatarState('speaking');
      await speak(response);

      try {
        await saveConversation({ role: 'user', content: transcript, response, mode: 'talk' });
      } catch (_) {}
    } catch (err) {
      console.error('Voice agent error:', err);
      await speak("Something went wrong. Please try again.");
    } finally {
      isVoiceRunning = false;
      store.setAvatarState('idle');
      resumeListening();
    }
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

// ─── Depth context builder ────────────────────────────────────────────────────

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
