import { GEMINI_API_KEY, GEMINI_MODEL } from '../config';
import { useAppStore } from '../store/useAppStore';

// ─── Voice streaming prompt (short, fast) ────────────────────────────────────

const VOICE_SYSTEM_PROMPT = `You are Eyeris, an AI assistant for blind and low-vision users. You have access to a live camera feed.

CORE RULES:
- Answer in 1-3 sentences. Be direct. No filler phrases like "certainly" or "of course".
- NEVER say "you're welcome", "happy to help", "great question", or similar. Just answer.
- Use spatial language: "directly ahead", "to your left", "about 1 meter away", "at waist height".
- Only describe what's visible if the user ASKS you to describe or if there is a safety hazard.
- Do NOT narrate the scene unprompted. You are an assistant, not a narrator.

WHAT TO DO BY REQUEST TYPE:
- "what's in front / around / nearby" → describe the scene spatially and briefly
- "read [sign/text/label]" → read exactly what's visible, word for word
- "find [object]" → locate it precisely: direction, distance, distinguishing features
- "is there [thing]" → yes/no + brief detail
- "help me [task]" → give step-by-step guidance based on what you see
- "how many [things]" → count and answer
- Conversational / unclear → answer directly without describing the scene

SAFETY (always proactive, regardless of question):
- If you see stairs, curbs, vehicles, wet floors, or obstacles → warn immediately, briefly.
- Example: "Watch out — there are steps down directly ahead."

NEVER describe the scene unless asked. Respond to what was actually said.`;


// ─── SSE stream parser — yields text chunks as async generator ────────────────

async function* streamGemini(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') return;
      try {
        const parsed = JSON.parse(json);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch (_) {}
    }
  }
}

// ─── Streaming voice response ─────────────────────────────────────────────────

// ─── Conversation history for multi-turn ─────────────────────────────────────
const conversationHistory = []; // { role: 'user'|'model', text: string }
const MAX_HISTORY = 6; // keep last 3 exchanges (6 messages)

export function addToHistory(role, text) {
  conversationHistory.push({ role, text });
  if (conversationHistory.length > MAX_HISTORY) conversationHistory.splice(0, 2); // drop oldest pair
}

export async function* streamVoiceResponse(imageBase64, userQuery, memories = []) {
  const memoryContext = memories.length > 0
    ? `\nContext: ${memories.join(' | ')}`
    : '';

  // Build multi-turn contents array
  const contents = [];

  // Add conversation history (text-only, no images for past turns)
  for (const msg of conversationHistory) {
    contents.push({ role: msg.role, parts: [{ text: msg.text }] });
  }

  // Current turn with image
  const userText = `${userQuery}${memoryContext}`;
  contents.push({
    role: 'user',
    parts: [
      ...(imageBase64 ? [{ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] : []),
      { text: userText },
    ],
  });

  const requestBody = {
    system_instruction: { parts: [{ text: VOICE_SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      responseMimeType: 'text/plain',
      temperature: 0.7,
      maxOutputTokens: 300,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Gemini streaming error: ${response.status}`);
  }

  yield* streamGemini(response);
}

const SYSTEM_PROMPT = `You are Eyeris, a visual assistant for blind/low-vision users.

You MUST respond with ONLY a valid JSON object exactly matching this structure (no markdown, no fences, no extra text):
{"objects":[{"id":"string","label":"string","bbox":[ymin,xmin,ymax,xmax],"isTarget":false,"sfSymbol":"string","overlayColor":"#F0C020"}],"caption":"short scene description","spoken_response":"","safety_alert":{"level":"critical","message":"string","sfSymbol":"alert-triangle"}}

RULES:
- bbox values are 0-1000 normalized (ymin,xmin,ymax,xmax)
- caption: max 10 words
- spoken_response: always "" (voice is handled separately)
- safety_alert: only include if there is a real hazard (stairs, vehicle, obstacle), otherwise omit the field
- objects: max 5, navigation-relevant only
- overlayColor: "#D02020" danger/hazard, "#F0C020" neutral, "#1040C0" target object
- sfSymbol options: alert-triangle, arrow-left, arrow-right, arrow-up, stop-circle, door-open
- isTarget: true only when user is explicitly searching for that object`;

let consecutiveFailures = 0;

function parseGeminiJSON(text) {
  // Strip markdown fences
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  // Try standard parse first
  try { return JSON.parse(cleaned); } catch (_) {}
  // Fix unquoted property names: word: → "word":
  cleaned = cleaned.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
  // Fix single quotes → double quotes
  cleaned = cleaned.replace(/'/g, '"');
  // Fix trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(cleaned); } catch (_) {}
  return null;
}

export async function analyzeFrame(imageBase64, userQuery = null, memories = [], mode = 'scan') {
  if (consecutiveFailures >= 3) {
    // Auto-reset after 10s so transient failures don't lock forever
    consecutiveFailures = 0;
  }

  const modeInstructions = {
    scan: 'Describe the scene spatially. Focus on navigation-relevant objects.',
    talk: userQuery ? `User asked: "${userQuery}". Answer directly and helpfully.` : 'Describe the scene.',
    read: 'Read all visible text. Transcribe exactly what you see.',
    find: userQuery ? `Help find: "${userQuery}". Look carefully and provide directions.` : 'Scan for any items of interest.',
  };

  const memoryContext = memories.length > 0
    ? `\nRelevant memories:\n${memories.map(m => `- ${m.content}`).join('\n')}`
    : '';

  const userText = `${modeInstructions[mode] || modeInstructions.scan}${memoryContext}
Respond with valid JSON only.`;

  const requestBody = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
        { text: userText },
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  async function doFetch() {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }
    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      console.warn('Gemini no text. finishReason:', candidate?.finishReason, JSON.stringify(data).slice(0, 300));
      throw new Error('No response text from Gemini');
    }
    if (candidate?.finishReason === 'MAX_TOKENS') {
      console.warn('Gemini hit MAX_TOKENS — response truncated, JSON will be invalid');
    }
    console.log('Gemini raw (len=' + text.length + '):', text.slice(0, 200));
    const result = parseGeminiJSON(text);
    if (!result) throw new Error('Failed to parse Gemini JSON');
    return result;
  }

  try {
    const result = await doFetch();
    consecutiveFailures = 0;
    useAppStore.getState().setGeminiConnected(true);
    return result;
  } catch (err) {
    console.warn('Gemini attempt 1 failed:', err.message);
    // Retry once after 2s
    await new Promise(r => setTimeout(r, 500));
    try {
      const result = await doFetch();
      consecutiveFailures = 0;
      useAppStore.getState().setGeminiConnected(true);
      return result;
    } catch (err2) {
      consecutiveFailures++;
      console.error('Gemini failed after retry:', err2.message);
      if (consecutiveFailures >= 3) {
        useAppStore.getState().setGeminiConnected(false);
      }
      return null;
    }
  }
}
