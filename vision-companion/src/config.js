export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
export const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
export const ELEVENLABS_VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID;
export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

export const GEMINI_MODEL = 'gemini-2.5-flash';
export const DEPTH_MODEL = 'onnx-community/depth-anything-v2-small';
export const AGENT_INTERVAL_MS = 1500;
export const DEPTH_INTERVAL_MS = 200;
export const ELEVENLABS_MODEL = 'eleven_flash_v2_5';

// Railtracks Python agent backend (run: cd vision-agent && python server.py)
export const RAILTRACKS_API_URL = import.meta.env.VITE_RAILTRACKS_API_URL || 'http://localhost:8000';
