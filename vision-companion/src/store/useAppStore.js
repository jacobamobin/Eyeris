import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // Navigation
  screen: 'landing', // 'landing' | 'app'
  setScreen: (screen) => set({ screen }),

  // Camera
  videoRef: null,
  setVideoRef: (ref) => set({ videoRef: ref }),
  cameraReady: false,
  setCameraReady: (v) => set({ cameraReady: v }),
  cameraError: null,
  setCameraError: (e) => set({ cameraError: e }),

  // Depth
  depthBuffer: null,
  depthWidth: 0,
  depthHeight: 0,
  depthFPS: 0,
  depthReady: false,
  setDepthBuffer: (data, w, h) => set({ depthBuffer: data, depthWidth: w, depthHeight: h }),
  setDepthFPS: (fps) => set({ depthFPS: fps }),
  setDepthReady: (v) => set({ depthReady: v }),
  depthModelLoading: false,
  depthModelProgress: 0,
  setDepthModelLoading: (v) => set({ depthModelLoading: v }),
  setDepthModelProgress: (p) => set({ depthModelProgress: p }),

  // Objects & overlays
  detectedObjects: [],
  setDetectedObjects: (objs) => set({ detectedObjects: objs }),
  currentCaption: '',
  setCurrentCaption: (c) => set({ currentCaption: c }),

  // Safety
  safetyAlert: null,
  setSafetyAlert: (a) => set({ safetyAlert: a }),
  dismissedAlerts: [],
  dismissAlert: (id) => set(s => ({ dismissedAlerts: [...s.dismissedAlerts, id] })),

  // Mode
  mode: 'scan', // 'scan' | 'talk' | 'read' | 'find'
  setMode: (m) => set({ mode: m }),
  isScanning: true,
  setIsScanning: (v) => set({ isScanning: v }),

  // Voice / Avatar
  avatarState: 'idle', // 'idle' | 'listening' | 'thinking' | 'speaking'
  setAvatarState: (s) => set({ avatarState: s }),
  isRecording: false,
  setIsRecording: (v) => set({ isRecording: v }),
  isSpeaking: false,
  setIsSpeaking: (v) => set({ isSpeaking: v }),
  userQuery: null,
  setUserQuery: (q) => set({ userQuery: q }),

  // Memory
  memories: [],
  setMemories: (m) => set({ memories: m }),

  // Status
  geminiConnected: false,
  setGeminiConnected: (v) => set({ geminiConnected: v }),
  isProcessing: false,
  setIsProcessing: (v) => set({ isProcessing: v }),
}));
