## Inspiration

Over 2.2 billion people worldwide live with some form of visual impairment. Existing assistive tools are often expensive, require dedicated hardware, or depend on sighted volunteers being available at the right time. I wanted to build something that anyone could use instantly — no app download, no special device, no waiting. Just open a link on your phone and have an AI companion that sees the world for you and talks to you naturally about it.

The idea for Eyeris came from a simple question: what if a blind person could point their phone at a room and have a conversation about what's there, the same way you'd ask a friend standing next to you?

## What it does

Eyeris is a real-time AI visual assistant that runs entirely in the browser. You open a link, grant camera and mic access, and Eyeris greets you: "Hey, how can I help?"

From there, you just talk. Ask "What's in front of me?" and it describes the scene. Say "Read that sign" and it reads every word. Ask "Where's the door?" and it highlights the door with a pulsing bounding box and tells you it's to your left, about 3 meters away.

**Three modes work together seamlessly:**
- **SCAN** continuously detects objects and draws labeled bounding boxes on the camera feed
- **READ** gives a full spatial description of the scene plus reads any visible text word-for-word
- **FIND** locates specific objects you ask about and gives directional guidance

All three modes support multi-turn conversation — you can ask follow-ups like "What color is it?" or "Is anyone else nearby?" without repeating context. Eyeris remembers the last few exchanges.

On-device depth estimation runs in parallel, sensing how close objects are and overlaying depth-colored masks on detected objects. If something gets dangerously close, you get an automatic haptic vibration and spoken warning — no question needed.

## How we built it

**Vision & Language:** Gemini 2.5 Flash processes camera frames via REST API, returning structured JSON with object bounding boxes, scene captions, and conversational responses. We disabled Gemini's thinking tokens (`thinkingBudget: 0`) and increased output limits to prevent JSON truncation.

**Depth Sensing:** Depth Anything V2 Small runs on-device through `@huggingface/transformers`, using WebGPU (fp16) with automatic WASM fallback. Cross-origin isolation headers (`COOP` + `COEP: credentialless`) enable SharedArrayBuffer for the ONNX runtime. The depth buffer feeds both a live mini-map heatmap and per-object silhouette overlays computed from median depth sampling.

**Voice Input:** OpenAI Whisper handles speech-to-text. We built custom Voice Activity Detection using the Web Audio API's AnalyserNode — RMS-based energy detection triggers recording on speech onset, and 800ms of silence triggers transcription. A `ttsActive` flag with 600ms cooldown prevents echo (the mic picking up Eyeris's own voice).

**Voice Output:** ElevenLabs Flash v2.5 delivers sub-second time-to-first-audio through sentence-chunked streaming — as Gemini streams text back, we split on sentence boundaries and fire off TTS requests in parallel. Barge-in support lets users interrupt mid-response.

**Frontend:** React 19 with Zustand for state management, Framer Motion for animations, and Tailwind CSS with a custom Bauhaus-inspired design system (high-contrast, bold typography, geometric layouts). Everything is accessibility-first with full ARIA support.

**Zero backend.** No server, no proxy, no infrastructure. Every API call goes directly from the browser. Open the link and it works.

## Challenges we ran into

The biggest challenge was getting depth estimation to run reliably in the browser. Vite's module transform system injects client-side HMR code into dependencies, which caused the ONNX runtime's WebAssembly to crash silently inside Web Workers — no error, no console output, just nothing. We spent hours tracing through minified WASM bundles before discovering that `ort.bundle.min.mjs` creates `SharedArrayBuffer`-backed memory at module load, which requires specific cross-origin isolation headers. Adding `Cross-Origin-Embedder-Policy: credentialless` (instead of `require-corp`) unlocked SharedArrayBuffer while keeping external API calls functional.

Getting Gemini to return valid JSON consistently was another battle. Gemini 2.5 Flash's internal "thinking" tokens were consuming the entire output budget, resulting in truncated JSON that broke parsing. Setting `thinkingBudget: 0` and building a robust JSON parser that handles unquoted keys, trailing commas, and single quotes solved this.

Echo suppression for the always-on mic was tricky — without careful gating, Whisper would transcribe Eyeris's own TTS output as user speech, creating feedback loops.

## Accomplishments that we're proud of

- The entire system runs client-side with zero backend infrastructure — depth estimation, voice recognition, scene analysis, and TTS all happen in the browser
- Sub-second voice response latency through sentence-chunked streaming TTS
- Natural multi-turn conversations where you can ask follow-ups without repeating context
- On-device depth sensing at 5+ FPS via WebGPU, with automatic WASM fallback
- Depth-aware object overlays that mask the actual object silhouette, not just a rectangle
- Fully accessible design with ARIA labels, haptic feedback, and voice-only operation after launch

## What we learned

- Browser APIs are incredibly powerful — WebGPU, AudioContext, MediaRecorder, and OffscreenCanvas together enable ML inference, voice processing, and real-time rendering that previously required native apps
- Cross-origin isolation is a minefield — `SharedArrayBuffer`, `WebAssembly.Memory({shared: true})`, COOP/COEP headers, and `credentialless` vs `require-corp` all interact in ways that aren't well documented
- Streaming architectures matter more than raw speed — sentence-chunked TTS makes responses *feel* instant even when total generation takes seconds
- LLM output reliability requires defense in depth — structured prompts, output budget management, and forgiving parsers are all necessary

## What's next for Eyeris

- **Offline mode** with on-device language models (Gemma/Phi) for areas without connectivity
- **Navigation memory** — remember and describe routes the user has walked before
- **Object tracking** — persistent IDs across frames so Eyeris can say "the person on your left just moved behind you"
- **Spatial audio** — directional sound cues that indicate where objects are relative to the user
- **Mobile PWA** — installable progressive web app with background camera access
- **Multi-language support** — voice interaction in any language Whisper supports

## Built With

- Gemini 2.5 Flash
- Depth Anything V2 (Hugging Face Transformers.js)
- OpenAI Whisper
- ElevenLabs Flash v2.5
- React 19
- Zustand
- Framer Motion
- Tailwind CSS
- Vite 5
- Railtracks
