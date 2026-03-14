# VisionCompanion

> **See the world, together.** — A browser-based AI visual assistant for blind and low-vision users.

Built for **GenAI Genesis 2026** — Canada's Largest AI Hackathon.

Built with **Railtracks** — [railtracks.ai](https://railtracks.ai)

## What It Does

VisionCompanion opens in any browser. No app install. No specific device required. The user grants camera and microphone access and immediately has an AI companion that:

- **Sees and describes** the scene in real time via Gemini 2.5 Flash
- **Draws overlays** on the camera feed — bounding boxes, labels, depth-masked highlights
- **Listens always** — no button to hold, just speak naturally
- **Speaks back** via ElevenLabs Flash v2.5 (< 200ms latency)
- **Warns proactively** about obstacles using on-device Depth Anything V2
- **Remembers** preferences and routines across sessions

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + Vite + Tailwind CSS |
| AI Vision | Gemini 2.5 Flash (structured JSON + bboxes) |
| Depth Model | Depth Anything V2 Small (WebGPU, in-browser) |
| Agent Backend | **Railtracks** + FastAPI (Python) |
| TTS | ElevenLabs Flash v2.5 |
| STT | Web Speech API (continuous, always-on) |
| State | Zustand |
| Animation | Framer Motion |

## Railtracks

The AI agent brain runs on Railtracks — a Python framework for agentic systems. The Railtracks agent orchestrates scene analysis, memory retrieval, and safety assessment for every voice query.

See [RAILTRACKS.md](./RAILTRACKS.md) for full integration details.

## Setup

### Frontend

```bash
cd vision-companion
cp ../.env .env     # copy API keys
npm install
npm run dev
```

### Railtracks Agent Backend

```bash
cd vision-agent
pip install -r requirements.txt
python server.py    # starts on http://localhost:8000
```

## Architecture

Two parallel AI tracks run simultaneously:

**Track 1 — On-Device (continuous, 3–8 FPS):**
Camera → Web Worker → Depth Anything V2 → depth buffer → minimap + obstacle detection

**Track 2 — Cloud AI (every 2.5s + voice triggers):**
Camera frame → Railtracks Agent → Gemini Vision → overlays + TTS response

## API Keys Required

- `VITE_GEMINI_API_KEY` — Google AI Studio
- `VITE_ELEVENLABS_API_KEY` + `VITE_ELEVENLABS_VOICE_ID` — ElevenLabs
- `VITE_OPENAI_API_KEY` — OpenAI (Whisper fallback)

## Hackathon Tracks

- Best Generative AI Hack — Human Empowerment
- Sun Life — Best Health Care Hack Using Agentic AI
- Google — Best AI for Community Impact
- **Railtracks Bonus Award**
