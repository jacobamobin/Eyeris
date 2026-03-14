# VisionCompanion — System Design Document v2.0

**Version:** 2.0 (Web Architecture)  
**Date:** March 14, 2026  
**Author:** Jacob Mobin  
**Status:** Active — GenAI Genesis 2026 Hackathon Build  
**Replaces:** v1.0 (iOS/Swift Architecture)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Requirements](#2-product-requirements)
3. [System Architecture](#3-system-architecture)
4. [Data Models and Storage](#4-data-models-and-storage)
5. [UX Design](#5-ux-design)
6. [Routes, APIs, Services](#6-routes-apis-services)
7. [Detailed Feature Specs](#7-detailed-feature-specs)
8. [Error Handling and Validation](#8-error-handling-and-validation)
9. [Appendices](#9-appendices)

---

## 1. Executive Summary

### 1.1 Project Name

**VisionCompanion** — *See the world, together.*

### 1.2 Purpose

VisionCompanion is a browser-based AI visual assistant for people who are blind or have low vision. It runs entirely client-side — no app install, no backend server, works on any device with a camera and a modern browser. The user opens a URL, grants camera and microphone access, and immediately has an intelligent companion that sees what they see, describes it aloud, dynamically draws overlays on the camera feed (bounding boxes, labels, icons, depth-based highlight masks), warns about hazards, reads text, and remembers preferences across sessions.

The system runs **Depth Anything V2 Small** (a real monocular depth estimation neural network) directly in the browser via WebGPU, producing a per-pixel depth map from every camera frame. This depth map powers depth-based object masking (isolating a jar on a shelf by its depth layer), the depth mini-map visualization, and proximity-based obstacle detection — all computed on-device with zero API calls.

### 1.3 Problem Statement

Over 2.2 billion people globally have vision impairment (WHO, 2023). Existing assistive apps are reactive (describe only when asked), platform-locked (iOS-only), lack spatial feedback (no visual overlays), forget the user between sessions, and never proactively warn about hazards. No solution combines real-time generative AI scene understanding, on-device per-pixel depth estimation, LLM-driven dynamic overlays with depth masking, proactive safety alerts, persistent memory, and natural voice conversation in a zero-install cross-platform web experience.

### 1.4 Target Audience

- **Primary:** People who are blind or have low vision with any modern smartphone or computer with a camera.
- **Secondary:** Sighted caregivers and family members observing the overlay-enhanced camera view.
- **Tertiary:** Hackathon judges evaluating the demo.

### 1.5 Key Value Propositions

- **Zero install, any device:** Opens in a browser. No App Store, no specific phone required.
- **LLM draws on screen:** Gemini returns structured bounding boxes, labels, icons, colors, and depth mask instructions. The app renders these as dynamic overlays — the AI visually annotates what it's describing.
- **Real depth map, no LiDAR:** Depth Anything V2 Small runs in-browser via WebGPU (~18MB quantized model, 24.8M params), producing a full per-pixel depth map at 3–8 FPS. Enables depth-based object isolation: highlight only the jar at 1.2m, not the shelf behind it.
- **Proactive safety:** AI warns about obstacles, stairs, crosswalk signals, and approaching people without being asked. Depth buffer enables local obstacle detection independent of Gemini response time.
- **Persistent local memory:** localStorage/IndexedDB stores preferences, interaction patterns, and routines on-device only. No server, no cloud, no data leaves the browser.
- **Natural voice loop:** Whisper API (STT) + ElevenLabs Flash v2.5 (TTS) with barge-in support.

### 1.6 Hackathon Track Alignment

- **Main Track:** Best Generative AI Hack — Human Empowerment
- **Sponsored Track 1:** Sun Life — Best Health Care Hack Using Agentic AI
- **Sponsored Track 2:** Google — Best AI for Community Impact

---

## 2. Product Requirements

### 2.1 High-Level Requirements

| ID | Requirement | Priority | Success Criteria |
|----|------------|----------|-----------------|
| R1 | Real-time scene understanding via camera + Gemini | P0 | AI describes scene within 3s of frame capture |
| R2 | Dynamic overlay rendering (bboxes, labels, icons, depth masks) | P0 | Overlays render at correct positions; depth masks isolate objects by depth layer |
| R3 | Voice input via Whisper API / Web Speech API | P0 | Speech transcribed >90% accuracy |
| R4 | Voice output via ElevenLabs Flash v2.5 | P0 | Responses spoken within 2s |
| R5 | Real per-pixel depth via Depth Anything V2 in-browser | P0 | Depth mini-map renders continuously; depth buffer available for masking |
| R6 | Proactive hazard detection | P1 | Obstacles, stairs, crosswalks detected and announced unprompted |
| R7 | Persistent on-device memory | P1 | Preferences and routines survive browser refresh |
| R8 | Object search with depth-aware highlighting | P0 | "Find the jar" → jar isolated from shelf via depth mask |
| R9 | Text reading via Gemini | P1 | Visible text read aloud on command |
| R10 | Depth mini-map visualization | P0 | Top-left corner shows color-coded depth in real-time |
| R11 | Barge-in support | P1 | User can interrupt AI mid-speech |
| R12 | Cross-device support | P2 | Works on iPhone Safari, Android Chrome, desktop Chrome |

### 2.2 User Stories

**US-1: Scene Description** — User opens app → AI describes scene within 3s → overlays mark key objects with labels and distances.

**US-2: Object Search with Depth Masking** — User says "find the jar" → AI identifies jar → depth buffer isolates jar's depth layer → jar highlighted with glow, background stays transparent → AI says "The jar is on the middle shelf, about 1.2 meters away."

**US-3: Street Crossing** — AI detects crosswalk → displays ⛔ or 🚶 icon → speaks "You can cross now" or "Wait" on state change.

**US-4: Text Reading** — User says "read this" → AI reads all visible text aloud.

**US-5: Memory and Routine** — After 3+ similar interactions, app recognizes pattern and proactively assists.

**US-6: Obstacle Warning** — Depth buffer detects high-proximity pixels center-frame → vibration + spoken warning. Independent of Gemini — runs locally from depth model output.

**US-7: People Awareness** — AI detects approaching person → announces direction and distance.

**US-8: Demo** — Open URL on phone, QuickTime mirror to Mac. Or open same URL on Mac webcam directly.

---

## 3. System Architecture

### 3.1 Architecture Overview

Single-page React app. No backend. Two independent processing tracks run simultaneously.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (Client-Side Only)                      │
│                                                                          │
│  ┌──────────────────────── React View Layer ──────────────────────────┐  │
│  │  <video>  │  <canvas overlay>  │  CaptionBar │ Avatar │ DepthMap  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─────────────────── Zustand Store (State) ──────────────────────────┐  │
│  │ objects[] │ caption │ depthBuffer │ mode │ memories │ avatarState   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─── Track 1: ON-DEVICE (continuous) ──┐  ┌── Track 2: CLOUD (2.5s) ─┐│
│  │                                       │  │                           ││
│  │  Camera Frame                         │  │  Camera Frame (JPEG)      ││
│  │       │                               │  │       │                   ││
│  │       ▼                               │  │       ▼                   ││
│  │  ┌──────────────┐                     │  │  ┌──────────────┐        ││
│  │  │ Web Worker   │                     │  │  │ Gemini 2.5   │        ││
│  │  │ Depth Any.   │                     │  │  │ Flash API    │        ││
│  │  │ V2 Small     │                     │  │  │              │        ││
│  │  │ (WebGPU)     │                     │  │  │ Returns:     │        ││
│  │  └──────┬───────┘                     │  │  │ • objects[]  │        ││
│  │         │                             │  │  │ • bboxes     │        ││
│  │         ▼                             │  │  │ • labels     │        ││
│  │  ┌──────────────┐                     │  │  │ • sf_symbols │        ││
│  │  │ Depth Buffer │──┐                  │  │  │ • depth_mask │        ││
│  │  │ Uint8Array   │  │                  │  │  │ • safety     │        ││
│  │  │ (per-pixel)  │  │                  │  │  │ • spoken_resp│        ││
│  │  └──────────────┘  │                  │  │  └──────┬───────┘        ││
│  │         │          │                  │  │         │                 ││
│  │         ▼          ▼                  │  │         ▼                 ││
│  │  ┌─────────┐ ┌──────────┐            │  │  ┌──────────────┐        ││
│  │  │ Depth   │ │ Local    │            │  │  │ Overlay      │        ││
│  │  │ MiniMap │ │ Obstacle │            │  │  │ Renderer     │◄──┐    ││
│  │  │ Canvas  │ │ Detect   │            │  │  │ (canvas +    │   │    ││
│  │  └─────────┘ └──────────┘            │  │  │  React)      │   │    ││
│  │                                       │  │  └──────────────┘   │    ││
│  └───────────────────────────────────────┘  └─────────────────────┘    │
│                                                        │               │
│                              ┌──────────────────┐      │               │
│                              │   Depth Buffer   │──────┘               │
│                              │   (shared)        │  used for           │
│                              │                   │  depth masking      │
│                              └──────────────────┘                      │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐  │
│  │ Eleven   │  │ Whisper  │  │ Web      │  │ Memory Store            │  │
│  │ Labs TTS │  │ STT API  │  │ Speech   │  │ (localStorage/IndexedDB)│  │
│  │ (cloud)  │  │ (cloud)  │  │ (local)  │  │ (local)                 │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Dual-Track Processing

**Track 1 — On-Device Depth (continuous, 3–8 FPS):**
Camera frame → Web Worker → Depth Anything V2 Small (WebGPU/WASM) → per-pixel depth buffer (Uint8Array, 0=far, 255=near) → depth mini-map canvas + obstacle detection + depth buffer stored for overlay masking.

**Track 2 — Cloud AI (throttled, every ~2.5s):**
Camera frame → JPEG base64 → Gemini 2.5 Flash API → structured JSON → overlay rendering + TTS.

When Track 2 response arrives, the overlay renderer combines Gemini's bounding boxes with Track 1's depth buffer to create depth-masked highlights.

### 3.3 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 18 + Vite | Fast HMR, proven winning stack |
| Styling | Tailwind CSS | Rapid polished UI |
| Animation | Framer Motion | Smooth overlay and avatar animation |
| State | Zustand | Works outside React tree (workers, async callbacks) |
| Overlay | HTML5 Canvas 2D API + React components | Full control over drawing |
| Depth Model | Depth Anything V2 Small via `@huggingface/transformers` | Real per-pixel depth, ~18MB, runs in-browser |
| ML Runtime | ONNX Runtime Web (WebGPU, WASM fallback) | GPU-accelerated on-device inference |
| AI Vision | Gemini 2.5 Flash REST API | Fast, cheap, structured JSON + bboxes |
| TTS | ElevenLabs Flash v2.5 REST API | ~75ms latency, natural voice |
| STT Primary | OpenAI Whisper REST API | High accuracy |
| STT Fallback | Web Speech API (`webkitSpeechRecognition`) | Zero-latency offline fallback |
| Icons | Lucide React | SF Symbol equivalents |
| Persistence | localStorage + IndexedDB (idb-keyval) | On-device, no cloud |

### 3.4 npm Dependencies

```json
{
  "@huggingface/transformers": "^3.x",
  "react": "^18.x",
  "react-dom": "^18.x",
  "zustand": "^4.x",
  "framer-motion": "^11.x",
  "lucide-react": "^0.383.0",
  "idb-keyval": "^6.x"
}
```

### 3.5 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Web over native iOS | Hot reload, Tailwind, cross-device, proven winning stack |
| Depth Anything V2 real model over Gemini estimates | Per-pixel depth enables masking/isolation — impossible with coarse estimates. ~18MB model, 3–8 FPS on phone WebGPU |
| No backend | API calls direct from browser. Keys in client code — fine for hackathon |
| Zustand over Context | Services outside React tree need state access (Web Worker, async callbacks) |
| Web Worker for depth | Depth inference blocks main thread without Worker. Keeps UI at 60fps |
| Whisper API over Web Speech primary | Higher accuracy in noisy environments where blind users walk |
| Canvas overlay over DOM elements for bboxes | Canvas redraws entire overlay frame atomically — no layout thrashing with many objects |

---

## 4. Data Models and Storage

### 4.1 Core Types

```typescript
interface DetectedObject {
  id: string;
  label: string;
  bbox: [number, number, number, number]; // [y_min, x_min, y_max, x_max] 0-1000
  depthEstimate: number | null;
  isTarget: boolean;
  sfSymbol: string | null;      // lucide icon name
  overlayColor: string;
  depthMaskRange: [number, number] | null; // [near_val, far_val] 0-255
}

interface SafetyAlert {
  level: 'critical' | 'warning' | 'info';
  message: string;
  sfSymbol: string;
}

interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  wasProactive: boolean;
}

interface MemoryEntry {
  id: string;
  content: string;
  category: 'preference' | 'routine' | 'location' | 'interaction' | 'tip';
  timestamp: number;
  importance: number;
  accessCount: number;
  tags: string[];
}
```

### 4.2 Persistence

| Store | Engine | Contents |
|-------|--------|----------|
| `vc_memories` | localStorage | JSON array of MemoryEntry |
| `vc_preferences` | localStorage | User settings JSON |
| `vc_onboarding` | localStorage | Boolean flag |
| `vc_conversations` | IndexedDB (idb-keyval) | Last 100 ConversationTurns |
| `vc_hazards` | IndexedDB (idb-keyval) | Hazard log for pattern learning |

All data browser-sandboxed. No transmission. User can wipe via "Clear All Data."

---

## 5. UX Design

### 5.1 Layout

```
┌─────────────────────────────────────────────────┐
│ ┌─────────┐                    ┌──────────────┐ │
│ │ DEPTH   │                    │ ● Connected  │ │
│ │ MINIMAP │                    │ ◆ Depth 5fps │ │
│ │ (120x90)│                    │ ▣ Scanning   │ │
│ └─────────┘                    └──────────────┘ │
│                                                  │
│              [Safety Icon Overlay]               │
│              [Bounding Boxes + Labels]           │
│              [Depth-Masked Highlights]           │
│                                                  │
│                                    ┌──────────┐  │
│                                    │ Avatar   │  │
│  ┌───────────────────────────────┐ └──────────┘  │
│  │ Caption text from AI          │               │
│  └───────────────────────────────┘               │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│  │ Scan │  │ Talk │  │ Read │  │ Find │        │
│  └──────┘  └──────┘  └──────┘  └──────┘        │
└─────────────────────────────────────────────────┘
```

### 5.2 Overlay Types the LLM Controls

| Type | Visual | How It Uses Depth |
|------|--------|-------------------|
| Bounding box | Colored rounded rect | Positioned from Gemini bbox |
| Label tag | Capsule with name + distance | Distance from Gemini depth estimate |
| Depth-masked highlight | Colored glow on object pixels only | Depth buffer pixels in `depthMaskRange` get highlight; others stay transparent |
| Safety icon | Lucide icon (StopCircle, Footprints, AlertTriangle, ArrowUp, DoorOpen) | Positioned at object bbox center |
| Warning banner | Full-width red/orange bar | N/A — safety alert overlay |
| Highlight pulse | Animated glow with varying opacity | Applied to depth-masked region for targets |
| Corner markers | L-shaped brackets at bbox corners | Emphasize target objects |

---

## 6. Routes, APIs, Services

### 6.1 Gemini 2.5 Flash

`POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={KEY}`

Response schema includes `objects[].depth_mask_range: [near, far]` — Gemini estimates where in the 0–255 depth range the target object sits, enabling the depth masking pipeline.

### 6.2 ElevenLabs Flash v2.5

`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` — returns MP3 audio.

### 6.3 OpenAI Whisper

`POST https://api.openai.com/v1/audio/transcriptions` — returns `{ text }`.

### 6.4 Depth Anything V2 Small (On-Device)

```javascript
import { pipeline } from '@huggingface/transformers';
const estimator = await pipeline('depth-estimation',
  'onnx-community/depth-anything-v2-small', { device: 'webgpu' });
const { depth } = await estimator(imageData);
// depth.data = Uint8Array per-pixel, depth.width, depth.height
```

Runs in Web Worker. Posts `{ depthData, width, height }` back to main thread.

---

## 7. Detailed Feature Specs

### 7.1 Depth-Based Object Masking (Key Differentiator)

**How it works:**

1. Gemini identifies object: `{ label: "jar", bbox: [200,300,500,600], depth_mask_range: [130,160] }`
2. Overlay renderer scales bbox to canvas coordinates
3. For each pixel in the bbox region:
   - Look up corresponding depth value from Depth Anything V2's depth buffer
   - If depth value is between 130 and 160 (the jar's depth layer): apply green highlight with 30% opacity
   - If depth value is outside that range (shelf, wall): keep transparent
4. Result: a precisely-shaped highlight that follows the jar's silhouette, separated from the shelf behind it by depth

This is the "wow factor" — the AI doesn't just draw a rectangle around the jar, it highlights the actual jar shape by using depth as a mask.

### 7.2 Local Obstacle Detection (Depth-Powered, No API)

The depth buffer from Depth Anything V2 enables obstacle detection without waiting for Gemini:

1. Every depth frame, check center-bottom region (where the user is walking toward)
2. If >30% of pixels in that region have depth value >200 (very close object): trigger warning
3. `navigator.vibrate(200)` + spoken "Careful, something close ahead"

This runs at depth model FPS (3–8 Hz) — much faster than Gemini's 2.5s cycle.

### 7.3 Voice Loop

Recording: `MediaRecorder` + `AnalyserNode` for silence detection (2s threshold).
Playback: `new Audio(URL.createObjectURL(blob))`.
Barge-in: `AnalyserNode` monitors mic RMS during playback; threshold crossing → `audio.pause()` + start recording.

### 7.4 Proactive Safety

| Tier | Visual | Audio | Source |
|------|--------|-------|--------|
| Critical (<0.5m) | Red banner + AlertTriangle | Spoken + vibrate | Depth buffer (local) OR Gemini |
| Warning (0.5–2m) | Orange badge + icon | Spoken once, then visual-only | Gemini |
| Crosswalk | StopCircle/Footprints icon | Spoken on state change | Gemini |
| Awareness | Cyan bbox + label | Silent | Gemini |

### 7.5 Memory System

localStorage-backed. Keyword matching for retrieval. Top 3–5 memories injected into Gemini prompt. Routine detection after 3+ similar interactions. Pruning on app load.

---

## 8. Error Handling

All errors communicated via voice. Fallback chain: Gemini timeout → skip frame. ElevenLabs timeout → browser `SpeechSynthesis`. Whisper timeout → `webkitSpeechRecognition`. Depth model fail → continue without depth (overlays still work from Gemini bboxes). WebGPU unavailable → WASM fallback.

---

## 9. Appendices

### 9.1 File Structure

```
vision-companion/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── package.json
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── config.js
│   ├── store/useAppStore.js
│   ├── services/
│   │   ├── geminiService.js
│   │   ├── ttsService.js
│   │   ├── sttService.js
│   │   ├── depthService.js
│   │   ├── memoryService.js
│   │   └── agentLoop.js
│   ├── workers/depthWorker.js
│   ├── components/
│   │   ├── MainView.jsx
│   │   ├── CameraFeed.jsx
│   │   ├── OverlayCanvas.jsx
│   │   ├── CaptionBar.jsx
│   │   ├── AvatarView.jsx
│   │   ├── DepthMiniMap.jsx
│   │   ├── ControlBar.jsx
│   │   ├── SafetyBanner.jsx
│   │   ├── StatusIndicator.jsx
│   │   └── OnboardingModal.jsx
│   └── utils/
│       ├── frameCapture.js
│       ├── bboxMapper.js
│       ├── depthColorMap.js
│       ├── depthMask.js
│       └── audioUtils.js
```

### 9.2 System Prompt

```
You are VisionCompanion, a warm AI visual assistant for blind/low-vision users.

RULES:
1. Concise: 1-3 sentences unless asked for detail.
2. SAFETY FIRST: stairs, obstacles, vehicles, curbs, crosswalks → safety_alert.
3. Spatial language: "to your left", "2 meters ahead", "waist height".
4. Read visible text when relevant.
5. People: describe by clothing/actions only.
6. Object search: mark is_target: true, provide depth_mask_range [near,far] 0-255.
7. sf_symbol values (Lucide names): stop-circle, footprints, alert-triangle,
   arrow-left, arrow-right, arrow-up, door-open.
8. depth_mask_range: estimate where the object sits in relative depth
   (255=nearest, 0=farthest). This creates a depth highlight mask.
9. Suggest memory_update for recurring patterns.

Respond with ONLY valid JSON. No markdown. No fences.
```

### 9.3 Cost: ~$5.52 total for 24h hackathon.

### 9.4 Demo: `npx vite --host` → open on phone → QuickTime mirror to Mac.

---

*End of System Design Document v2.0*
