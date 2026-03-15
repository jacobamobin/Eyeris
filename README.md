# Eyeris — AI Visual Assistant

**Real-time AI-powered visual assistance for blind and low-vision users. Runs entirely in the browser — no install, no backend, just open a link and go.**

Built with [Railtracks](https://github.com/RailtownAI/railtracks) | For [GenAI Genesis 2026](https://genaigenesis.ca) | By Jacob Mobin

---

## What is Eyeris?

Eyeris is a browser-based AI companion that helps blind and low-vision users understand their surroundings in real time. Point your phone's camera at the world, talk naturally, and get instant spoken descriptions of what's around you.

It combines **Gemini 2.5 Flash** for scene understanding, **Depth Anything V2** for on-device spatial awareness, **OpenAI Whisper** for speech recognition, and **ElevenLabs Flash v2.5** for natural text-to-speech — all running client-side with zero server infrastructure.

### Key Features

- **Real-time object detection** — Bounding boxes with labels track objects in the camera feed at ~2.5s intervals
- **On-device depth estimation** — Depth Anything V2 Small runs via WebGPU/WASM to sense how close objects are, with depth-colored overlays on detected objects
- **Natural voice conversation** — Speak naturally and get instant spoken responses; supports multi-turn dialogue with conversation history
- **Three integrated modes** — SCAN (continuous scene analysis), READ (full scene + text description), FIND (locate specific objects)
- **Voice Activity Detection** — RMS-based VAD with Whisper transcription means hands-free, always-listening interaction
- **Barge-in support** — Interrupt Eyeris mid-sentence and it stops to listen
- **Obstacle alerts** — Automatic haptic + audio warnings when objects are dangerously close
- **Accessibility-first design** — ARIA labels, screen reader support, high-contrast Bauhaus design system

---

## Demo

> **Live Demo:** Open `localhost:5173` after running the dev server (see Setup below)

### How It Works

1. **Launch** — Open the app, grant camera + mic permissions
2. **Eyeris greets you** — "Hey, how can I help?"
3. **Talk naturally** — Ask anything: "What's in front of me?", "Read that sign", "Where's the door?"
4. **Get instant answers** — Eyeris responds with natural speech while updating visual overlays in real time

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    BROWSER (Client-Side)             │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Camera   │  │ Gemini 2.5   │  │ Depth Anything│  │
│  │ Feed     │──│ Flash (REST) │  │ V2 (WebGPU)   │  │
│  └──────────┘  └──────┬───────┘  └───────┬───────┘  │
│       │               │                  │           │
│  ┌────▼────┐   ┌──────▼───────┐  ┌──────▼───────┐   │
│  │ Whisper │   │ Bounding Box │  │ Depth Overlay │   │
│  │ (STT)   │   │ + Captions   │  │ + Mini-Map    │   │
│  └────┬────┘   └──────────────┘  └──────────────┘   │
│       │                                              │
│  ┌────▼──────────────────────────────────────────┐   │
│  │         ElevenLabs Flash v2.5 (TTS)           │   │
│  │    Sentence-chunked streaming for low TTFB    │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  ┌───────────────────────────────────────────────┐   │
│  │  React 19 + Zustand + Framer Motion + Tailwind│   │
│  │  Bauhaus Design System · Vite 5 Dev Server    │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Vision AI** | Gemini 2.5 Flash (REST API) | Scene analysis, object detection, voice responses |
| **Depth Sensing** | Depth Anything V2 Small (`@huggingface/transformers`) | On-device depth estimation via WebGPU with WASM fallback |
| **Speech-to-Text** | OpenAI Whisper API (`whisper-1`) | Fast, accurate voice transcription |
| **Text-to-Speech** | ElevenLabs Flash v2.5 | Low-latency sentence-chunked streaming TTS |
| **Frontend** | React 19, Zustand, Framer Motion | UI state management and animations |
| **Styling** | Tailwind CSS 3 | Bauhaus-inspired high-contrast design system |
| **Icons** | Lucide React | Consistent iconography |
| **Build** | Vite 5 | Fast HMR dev server with ES module workers |

---

## Project Structure

```
vision-companion/
├── public/
│   └── demo/                  # Landing page demo assets
├── src/
│   ├── components/
│   │   ├── LandingPage.jsx    # Hero + animated phone mockup
│   │   ├── MainView.jsx       # Camera view orchestrator
│   │   ├── CameraFeed.jsx     # getUserMedia + depth init
│   │   ├── OverlayCanvas.jsx  # Bounding boxes + depth masks
│   │   ├── DepthMiniMap.jsx   # Real-time depth heatmap
│   │   ├── CaptionBar.jsx     # Scene captions + thinking state
│   │   ├── ControlBar.jsx     # Mode switching + mic/speaker
│   │   ├── AvatarView.jsx     # Speaking/thinking avatar
│   │   ├── StatusIndicator.jsx# Connection + FPS badges
│   │   ├── SafetyBanner.jsx   # Obstacle warnings
│   │   └── OnboardingModal.jsx# First-run tutorial
│   ├── services/
│   │   ├── geminiService.js   # Gemini API (scan + voice streaming)
│   │   ├── agentLoop.js       # Always-on scan loop + voice handler
│   │   ├── continuousListener.js # Whisper VAD + transcription
│   │   ├── ttsService.js      # ElevenLabs streaming TTS
│   │   ├── depthService.js    # Depth Anything V2 pipeline
│   │   └── memoryService.js   # IndexedDB conversation memory
│   ├── utils/
│   │   ├── depthMask.js       # Depth-based object masks
│   │   ├── depthColorMap.js   # Depth value → RGB mapping
│   │   ├── bboxMapper.js      # Gemini bbox → screen coords
│   │   └── frameCapture.js    # Video frame → base64
│   ├── store/
│   │   └── useAppStore.js     # Zustand global state
│   ├── config.js              # API keys + tuning constants
│   └── main.jsx               # App entry point
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Setup

### Prerequisites

- Node.js 18+
- A modern browser with WebGPU support (Chrome 113+, Edge 113+) for optimal depth performance; falls back to WASM automatically
- API keys for Gemini, OpenAI (Whisper), and ElevenLabs

### Installation

```bash
cd vision-companion
npm install
```

### Configuration

Create or edit `src/config.js` with your API keys:

```js
export const GEMINI_API_KEY = 'your-gemini-api-key';
export const GEMINI_MODEL = 'gemini-2.5-flash-preview-04-17';
export const OPENAI_API_KEY = 'your-openai-api-key';
export const ELEVENLABS_API_KEY = 'your-elevenlabs-api-key';
export const ELEVENLABS_VOICE_ID = 'your-voice-id';
```

### Run

```bash
npm run dev
```

Open `http://localhost:5173` in Chrome. Grant camera and microphone permissions when prompted.

### Build for Production

```bash
npm run build
npm run preview
```

---

## How the Modes Work

### SCAN Mode (Default)
Continuously analyzes the camera feed every ~2.5 seconds. Detects objects, draws labeled bounding boxes with depth-colored overlays, and updates scene captions. The scan loop runs silently in the background across all modes to keep overlays fresh.

### READ Mode
Triggers a one-shot full scene description: spatial layout, object positions, and any visible text read word-for-word. Useful for getting a comprehensive understanding of an unfamiliar environment.

### FIND Mode
Optimized for locating specific objects. Ask "Where's the coffee cup?" or "Find the exit sign" and Eyeris will identify and highlight the target with a pulsing bounding box while giving spatial directions.

### Voice (Always-On)
All three modes support natural multi-turn conversation. Eyeris maintains a conversation history buffer (last 3 exchanges) so you can ask follow-up questions like "What color is it?" or "How far away?" without repeating context.

---

## Technical Highlights

- **Zero-backend architecture** — Everything runs client-side. API calls go directly from the browser to Gemini, Whisper, and ElevenLabs. No proxy server needed.
- **On-device depth estimation** — Depth Anything V2 Small runs via `@huggingface/transformers` with WebGPU (fp16) primary and WASM fallback. Cross-origin isolation headers (`COOP` + `COEP: credentialless`) enable SharedArrayBuffer for ONNX runtime threading.
- **Sentence-chunked TTS streaming** — Responses are split into sentences and streamed to ElevenLabs in parallel, achieving sub-second time-to-first-audio.
- **Voice Activity Detection** — Custom RMS-based VAD using AudioContext AnalyserNode detects speech onset/offset with configurable thresholds, avoiding false triggers from background noise.
- **Echo suppression** — TTS playback sets a `ttsActive` flag that suppresses recording, with a 600ms cooldown after TTS ends to prevent the mic from picking up its own output.
- **Depth-aware object overlays** — Objects are masked using median depth sampling within the bounding box center, creating silhouette overlays that match the object's actual shape rather than a simple rectangle fill.
- **Thinking state UX** — When the model is processing, an animated edge glow and pulsing dots provide clear visual feedback that Eyeris is working.

---

## Accessibility

Eyeris is built accessibility-first:

- All interactive elements have ARIA labels and roles
- High-contrast Bauhaus design system with bold typography (Outfit font)
- `aria-live` regions for dynamic caption updates
- Haptic feedback (`navigator.vibrate`) for obstacle proximity alerts
- Fully operable via voice — no touch interaction required after launch
- Screen reader compatible throughout

---

## Prize Categories

This project is submitted for:

- **Best Generative AI Hack** — Core submission
- **(Google) Best AI for Community Impact** — AI-powered accessibility tool enabling independence for blind/low-vision users

---

## Development Notes

This project uses [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) (Oxc parser) for Fast Refresh. The alternative [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) (SWC) is available if you prefer faster transforms.

The [React Compiler](https://react.dev/learn/react-compiler/installation) is not enabled by default due to its impact on dev/build performance — opt in via the Vite config if needed.

For production use, consider adding TypeScript with type-aware lint rules via the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) and [`typescript-eslint`](https://typescript-eslint.io).

---

## Acknowledgments

- [Gemini 2.5 Flash](https://deepmind.google/technologies/gemini/) by Google DeepMind
- [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) by TikTok/ByteDance
- [ElevenLabs](https://elevenlabs.io/) for real-time TTS
- [OpenAI Whisper](https://openai.com/research/whisper) for speech recognition
- [Hugging Face Transformers.js](https://huggingface.co/docs/transformers.js) for in-browser ML inference
- Built with [Railtracks](https://github.com/RailtownAI/railtracks)

---

## License

MIT

---

*Built for GenAI Genesis 2026 by Jacob Mobin*
