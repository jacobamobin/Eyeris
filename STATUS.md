# VisionCompanion — Build Status v2.0

**Project:** VisionCompanion (Web Architecture)  
**Reference:** [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) v2.0  
**Legend:** ⬜ Not started | 🟡 In progress | ✅ Complete

---

## Phase 1: Project Setup, Camera Feed & Depth Anything V2

**Goal:** Scaffold the React/Vite project, get the live camera feed rendering, and run Depth Anything V2 Small in a Web Worker producing a real per-pixel depth map with a color-coded mini-map visualization.

> Refer to: SDD §3.3 (Tech Stack), §3.4 (Dependencies), §3.5 (Decisions 2, 5: Depth model in Worker), §6.4 (Depth Anything V2), §7.6 (Depth Mini-Map), §9.1 (File Structure)

- [ ] Initialize project: `npm create vite@latest vision-companion -- --template react`
- [ ] Install dependencies: `@huggingface/transformers`, `zustand`, `framer-motion`, `lucide-react`, `idb-keyval`
- [ ] Configure Tailwind CSS + PostCSS
- [ ] Create file structure: `src/services/`, `src/components/`, `src/workers/`, `src/utils/`, `src/store/`
- [ ] Create `src/config.js` — API keys (Gemini, ElevenLabs, Whisper), model IDs, intervals
- [ ] Create `src/store/useAppStore.js` — Zustand store with full state shape (objects, caption, depthBuffer, mode, memories, avatarState, etc.)
- [ ] Implement `src/components/CameraFeed.jsx`:
  - [ ] `getUserMedia({ video: { facingMode: 'environment' }, audio: true })` on mount
  - [ ] Render `<video autoPlay playsInline muted>` full-screen
  - [ ] Handle permission denied state with user-facing message
- [ ] Implement `src/workers/depthWorker.js`:
  - [ ] Import `pipeline` from `@huggingface/transformers`
  - [ ] Initialize `depth-estimation` pipeline with `onnx-community/depth-anything-v2-small` and `device: 'webgpu'` (WASM fallback)
  - [ ] Listen for `postMessage` with ImageBitmap frame
  - [ ] Run inference → post back `{ depthData: Uint8Array, width, height }`
- [ ] Implement `src/services/depthService.js`:
  - [ ] Create and manage Web Worker lifecycle
  - [ ] Capture frame from `<video>` → `OffscreenCanvas` → `ImageBitmap` → post to worker
  - [ ] On worker response: update Zustand store `depthBuffer`, `depthWidth`, `depthHeight`
  - [ ] Run at ~200ms interval (5 FPS target), skip if previous inference still running
- [ ] Implement `src/utils/depthColorMap.js` — function mapping depth value (0–255) to RGB (cyan=near → red=far)
- [ ] Implement `src/components/DepthMiniMap.jsx`:
  - [ ] Small `<canvas>` (120×90px) in top-left corner
  - [ ] On depthBuffer update: iterate pixels, map via `depthColorMap`, render with `putImageData`
  - [ ] "3D DEPTH" label overlay, rounded corners, semi-transparent background
- [ ] Implement `src/components/MainView.jsx` — full-screen container with `<CameraFeed>` + `<DepthMiniMap>` layered
- [ ] Create `src/App.jsx` — render `<MainView>`
- [ ] Test: `npx vite --host` → open on phone → camera feed displays → depth mini-map shows color-coded depth updating at 3–8 FPS

**Exit Criteria:** Camera feed renders full-screen. Depth Anything V2 runs in Web Worker, depth mini-map shows real per-pixel depth visualization updating continuously.

---

## Phase 2: Gemini Vision Pipeline & Overlay Rendering

**Goal:** Build the frame → Gemini → structured JSON → canvas overlay pipeline. The AI sees through the camera and draws bounding boxes, labels, icons, and depth-masked highlights on screen.

> Refer to: SDD §6.1 (Gemini API), §7.1 (Depth-Based Masking), §5.2 (Overlay Types), §9.2 (System Prompt)

- [ ] Implement `src/utils/frameCapture.js`:
  - [ ] Draw `<video>` to offscreen `<canvas>` at reduced resolution
  - [ ] Export as JPEG base64 (60% quality, <500KB validation)
  - [ ] Brightness check: reject frames with average pixel value < 20
- [ ] Implement `src/services/geminiService.js`:
  - [ ] `analyzeFrame(base64Jpeg, depthContext, userQuery, mode, memories)` async function
  - [ ] Construct request body with system prompt (from §9.2), `responseMimeType: "application/json"`, response schema
  - [ ] POST to Gemini API, parse `candidates[0].content.parts[0].text`
  - [ ] Clean markdown fences, decode JSON into typed response
  - [ ] Handle bbox format `[y_min, x_min, y_max, x_max]` normalized 0–1000
- [ ] Implement `src/utils/bboxMapper.js`:
  - [ ] `geminiToScreen(bbox, videoWidth, videoHeight)` → `{x, y, width, height}` in screen pixels
- [ ] Implement `src/utils/depthMask.js`:
  - [ ] `createDepthMask(bbox, depthMaskRange, depthBuffer, depthWidth, depthHeight, canvasWidth, canvasHeight)`
  - [ ] For each pixel in the bbox region: sample depth buffer, if value within `[near, far]` → set mask pixel to 1, else 0
  - [ ] Return mask as `ImageData` that can be composited onto overlay canvas
- [ ] Implement `src/components/OverlayCanvas.jsx`:
  - [ ] `<canvas>` positioned absolutely over `<video>`, same dimensions
  - [ ] Clear and redraw on every `detectedObjects` state change
  - [ ] For each object:
    - [ ] If `depthMaskRange` + depth buffer available: render depth-masked highlight (colored overlay on matching depth pixels, transparent elsewhere)
    - [ ] Draw bounding box rectangle with `overlayColor`
    - [ ] Draw label capsule (filled rounded rect + text + distance)
    - [ ] If `isTarget`: draw corner markers + pulse animation via `requestAnimationFrame`
  - [ ] If `safetyAlert`: render Lucide icon at bbox center via positioned React component
- [ ] Implement `src/components/SafetyBanner.jsx` — full-width animated banner for critical alerts (Framer Motion slide-down)
- [ ] Implement `src/components/StatusIndicator.jsx` — top-right badges: connection status, depth FPS, current mode
- [ ] Implement `src/services/agentLoop.js` (initial version):
  - [ ] Timer captures frame every 2.5s
  - [ ] Calls `geminiService.analyzeFrame()`
  - [ ] Updates Zustand: `detectedObjects`, `currentCaption`, `safetyAlert`
  - [ ] Generates depth context string from current depth buffer (sample 7 key positions)
- [ ] Implement `src/components/CaptionBar.jsx` — bottom caption with fade animation, processing spinner
- [ ] Wire everything in `MainView.jsx`: CameraFeed + OverlayCanvas + DepthMiniMap + CaptionBar + StatusIndicator + SafetyBanner
- [ ] Test: point camera at objects → Gemini returns bboxes → overlays render → depth masks isolate objects from background

**Exit Criteria:** Bounding boxes and labels render at correct positions. Depth-masked highlights isolate objects by depth layer. Caption bar shows AI description. Safety icons appear for hazards.

---

## Phase 3: Voice Conversation Loop

**Goal:** Complete bidirectional voice: user speaks → Whisper transcribes → Gemini processes → ElevenLabs speaks response. Barge-in support. Animated avatar.

> Refer to: SDD §6.2 (ElevenLabs), §6.3 (Whisper), §7.3 (Voice Loop), §3.5 (Decision 6: Whisper over Web Speech)

- [ ] Implement `src/utils/audioUtils.js`:
  - [ ] `startRecording()` — create `MediaRecorder` from `getUserMedia` audio stream
  - [ ] `stopRecording()` — return audio `Blob` (webm or wav)
  - [ ] `createAnalyser()` — `AnalyserNode` on audio stream for RMS energy monitoring
  - [ ] `detectSilence(analyser, threshold, duration)` — promise that resolves after `duration`ms of silence
  - [ ] `getRMS(analyser)` — current RMS energy level for barge-in detection
- [ ] Implement `src/services/sttService.js`:
  - [ ] `transcribe(audioBlob)` — POST to Whisper API, return text
  - [ ] `startWebSpeech(onResult)` — fallback using `webkitSpeechRecognition`
  - [ ] Validate: min 0.5s audio, non-empty result with alphanumeric chars
- [ ] Implement `src/services/ttsService.js`:
  - [ ] `speak(text)` — POST to ElevenLabs API → receive MP3 blob → play via `new Audio(URL.createObjectURL())`
  - [ ] Track `isSpeaking` state via `audio.onplay` / `audio.onended`
  - [ ] `stop()` — `audio.pause()`, clear queue
  - [ ] Speech queue: if already speaking, queue next utterance
  - [ ] `speakFallback(text)` — `SpeechSynthesis` API for offline/error fallback
- [ ] Implement barge-in in agentLoop:
  - [ ] During TTS playback, poll `getRMS()` on mic stream
  - [ ] If RMS > threshold for >200ms: call `ttsService.stop()`, begin recording
- [ ] Implement `src/components/AvatarView.jsx`:
  - [ ] Four animated states: idle (Eye icon, blue pulse), listening (Mic icon, green pulse), thinking (Brain icon, spin), speaking (AudioLines icon, purple pulse)
  - [ ] Framer Motion animations for state transitions
  - [ ] Positioned bottom-right, 52×52px, with glow ring
- [ ] Implement `src/components/ControlBar.jsx`:
  - [ ] Four buttons: Scan (toggle auto-capture), Talk (toggle recording), Read (OCR mode), Find (search mode)
  - [ ] Active state styling (filled vs outlined)
  - [ ] Accessible labels
- [ ] Update `src/services/agentLoop.js` — full orchestration:
  - [ ] Voice command routing: "find X" → search mode, "read this" → reading mode, "stop" → stop TTS
  - [ ] Route Gemini `spoken_response` → ttsService.speak()
  - [ ] Route user speech → inject as `userQuery` in next Gemini call
  - [ ] Update `avatarState` through conversation lifecycle (idle → listening → thinking → speaking → idle)
- [ ] Test: tap Talk → speak "what's in front of me" → Whisper transcribes → Gemini responds → ElevenLabs speaks → overlays update. Interrupt mid-speech → AI stops and listens.

**Exit Criteria:** Full voice loop works end-to-end. Barge-in interrupts TTS. Avatar animates through all four states. Control buttons toggle modes.

---

## Phase 4: Proactive Safety, Memory & Local Obstacle Detection

**Goal:** Add proactive hazard detection from depth buffer (local, no API), persistent memory system, routine pattern detection, and the tiered safety alert system.

> Refer to: SDD §7.2 (Local Obstacle Detection), §7.4 (Proactive Safety Tiers), §7.5 (Memory System), §4.2 (Persistence)

- [ ] Implement local obstacle detection in `depthService.js`:
  - [ ] On each depth frame: check center-bottom 20% of depth buffer
  - [ ] If >30% of pixels have depth value >200 (very close): fire warning
  - [ ] Trigger `navigator.vibrate(200)` + update Zustand `safetyAlert` with critical level
  - [ ] Debounce: suppress repeated warnings for same stationary obstacle after 3 alerts
- [ ] Implement `src/services/memoryService.js`:
  - [ ] `saveMemory(content, category, importance, tags)` → store in localStorage `vc_memories`
  - [ ] `getRelevantMemories(query, limit)` → keyword matching against content + tags, sorted by `importance * 0.6 + recency * 0.4`
  - [ ] `saveConversation(turn)` → append to IndexedDB via idb-keyval
  - [ ] `getRecentConversation(limit)` → last N turns from IndexedDB
  - [ ] `savePreference(key, value)` → localStorage `vc_preferences`
  - [ ] `getPreference(key)` → retrieve
  - [ ] `pruneOldMemories()` → on app load, delete memories with importance < 0.2 and age > 30 days
  - [ ] `clearAllData()` → wipe all localStorage keys + IndexedDB stores
- [ ] Implement routine detection in memoryService:
  - [ ] Track interaction patterns (same query type at similar times)
  - [ ] After 3+ occurrences: create routine entry in `vc_routines`
  - [ ] On app load: check if any routine matches current context → proactive assist
- [ ] Update `agentLoop.js` — integrate memory and safety:
  - [ ] Before each Gemini call: retrieve relevant memories, inject into prompt
  - [ ] After Gemini response: store `memory_update` if present, log conversation turns
  - [ ] Parse `safety_alert` → trigger appropriate tier response
  - [ ] Tier 1 (critical): SafetyBanner + spoken warning + vibrate
  - [ ] Tier 2 (warning): spoken once + visual badge, visual-only on repeat
  - [ ] Tier 3 (crosswalk): icon overlay + spoken on state change only
  - [ ] Tier 4 (awareness): silent visual overlay
  - [ ] User dismissal: "that's fine" / "ignore that" → suppress alert for that object
- [ ] Test: walk toward wall → depth buffer detects proximity → warning fires WITHOUT waiting for Gemini. Say "remember I like detailed descriptions" → memory stored → next Gemini call includes this context.

**Exit Criteria:** Local obstacle detection fires from depth buffer at 3–8 FPS. Memories persist across page refresh. Safety alerts display with correct tier behavior. Routine detection works after repeated patterns.

---

## Phase 5: Polish, Onboarding & Submission

**Goal:** Finalize UI, add onboarding, handle all error/edge cases, record demo video, submit to Devpost.

> Refer to: SDD §5.1 (Screens), §8 (Error Handling), §9.3 (Cost), §9.4 (Demo Strategy)

- [ ] Implement `src/components/OnboardingModal.jsx`:
  - [ ] 3-step modal: "See the World Together" → "Real Depth Understanding" → "Permissions"
  - [ ] Each step: Lucide icon, title, description
  - [ ] Final step triggers camera + mic permission requests
  - [ ] Store `vc_onboarding = true` in localStorage on completion
- [ ] Error handling implementation:
  - [ ] Gemini timeout: retry once after 2s, skip after 3 consecutive failures, spoken announcement
  - [ ] ElevenLabs timeout: silent fallback to `SpeechSynthesis` API
  - [ ] Whisper timeout: silent fallback to `webkitSpeechRecognition`
  - [ ] JSON parse failure: regex-extract `spoken_response` as last resort
  - [ ] Depth model load failure: hide depth mini-map, continue without depth masking
  - [ ] Camera/mic denied: show overlay with instructions to enable in browser settings
  - [ ] WebGPU unavailable: WASM fallback for depth (logged, not announced)
- [ ] Visual polish:
  - [ ] Smooth overlay transitions (Framer Motion `animate` on position changes)
  - [ ] Offset overlapping label tags vertically
  - [ ] Remove stale overlays when objects leave frame
  - [ ] Loading state: "Model loading..." with progress indicator during Depth Anything V2 download
  - [ ] Dark theme with glassmorphism overlays (backdrop-filter: blur)
  - [ ] Mobile-responsive: full-screen on phone, centered on desktop
- [ ] Accessibility:
  - [ ] All buttons have `aria-label`
  - [ ] Caption bar content in `aria-live="polite"` region
  - [ ] Meaningful focus order for keyboard navigation
- [ ] Demo preparation:
  - [ ] Verify `npx vite --host` → phone opens URL → camera + depth + overlays all working
  - [ ] Verify QuickTime mirror: iPhone USB → Mac → New Movie Recording → select iPhone
  - [ ] Record 3-minute demo video:
    - [ ] Scene description (point at room → hear description → see overlays)
    - [ ] Object search with depth masking ("find the water bottle" → depth-isolated highlight)
    - [ ] Text reading (point at sign → AI reads it)
    - [ ] Obstacle warning (walk toward wall → depth-based warning fires)
    - [ ] Memory persistence (show routine/preference recall)
  - [ ] Upload to YouTube (unlisted)
- [ ] Devpost submission:
  - [ ] Write project description (inspiration, what it does, how built, challenges, accomplishments)
  - [ ] Link GitHub repo (public, no API keys committed — use `.env` + `.gitignore`)
  - [ ] Link demo video
  - [ ] Select categories: Best Generative AI Hack + Sun Life Healthcare + Google Community Impact
  - [ ] Verify README covers: setup, tech stack, architecture diagram, team
- [ ] Final testing:
  - [ ] Full voice loop: speak → transcribe → AI → TTS → overlays ✓
  - [ ] Depth masking: "find the jar" → jar isolated from shelf ✓
  - [ ] Local obstacle detection: walk toward object → warning ✓
  - [ ] Memory persistence: save → refresh → recall ✓
  - [ ] Depth mini-map: continuous color-coded update ✓
  - [ ] Avatar animation: all 4 states ✓
  - [ ] Barge-in: interrupt AI mid-speech ✓
  - [ ] Offline fallback: kill network → Web Speech + SpeechSynthesis work ✓
  - [ ] No API keys in committed code ✓

**Exit Criteria:** App fully functional, polished, accessible. Demo video recorded and uploaded. Devpost submitted. GitHub repo public and clean.

---

## Progress Summary

| Phase | Status | Tasks |
|-------|--------|-------|
| Phase 1: Setup, Camera & Depth Model | ⬜ Not started | 0/13 |
| Phase 2: Gemini Vision & Overlays | ⬜ Not started | 0/13 |
| Phase 3: Voice Conversation Loop | ⬜ Not started | 0/9 |
| Phase 4: Safety, Memory & Obstacles | ⬜ Not started | 0/7 |
| Phase 5: Polish, Onboarding & Submission | ⬜ Not started | 0/11 |
| **Total** | | **0/53** |
