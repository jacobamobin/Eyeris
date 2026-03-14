import { GEMINI_API_KEY, GEMINI_MODEL } from '../config';
import { useAppStore } from '../store/useAppStore';

// ─── Voice streaming prompt (short, fast) ────────────────────────────────────

const VOICE_SYSTEM_PROMPT = `You are VisionCompanion, an AI assistant for blind and low-vision users. You have access to a live camera feed.

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

export async function* streamVoiceResponse(imageBase64, userQuery, memories = [], depthContext = '') {
  const memoryContext = memories.length > 0
    ? `\nContext: ${memories.join(' | ')}`
    : '';

  const userText = `User asked: "${userQuery}"
${depthContext}${memoryContext}`;

  const requestBody = {
    system_instruction: { parts: [{ text: VOICE_SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [
        ...(imageBase64 ? [{ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] : []),
        { text: userText },
      ],
    }],
    generationConfig: {
      responseMimeType: 'text/plain',
      temperature: 0.7,
      maxOutputTokens: 200,
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

const SYSTEM_PROMPT = `You are VisionCompanion, a visual assistant for blind/low-vision users.

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

function buildDepthContext(depthBuffer, depthWidth, depthHeight) {
  if (!depthBuffer) return '';
  const positions = [
    { name: 'top-left', x: 0.1, y: 0.1 },
    { name: 'top-center', x: 0.5, y: 0.1 },
    { name: 'top-right', x: 0.9, y: 0.1 },
    { name: 'center-left', x: 0.1, y: 0.5 },
    { name: 'center', x: 0.5, y: 0.5 },
    { name: 'center-right', x: 0.9, y: 0.5 },
    { name: 'bottom-center', x: 0.5, y: 0.9 },
  ];
  const readings = positions.map(p => {
    const x = Math.round(p.x * depthWidth);
    const y = Math.round(p.y * depthHeight);
    const val = depthBuffer[y * depthWidth + x] || 0;
    const dist = val > 200 ? 'very close' : val > 150 ? 'close' : val > 100 ? 'mid' : val > 50 ? 'far' : 'very far';
    return `${p.name}:${dist}(${val})`;
  });
  return `Depth map readings (255=nearest,0=farthest): ${readings.join(', ')}`;
}

function stripMarkdown(text) {
  return text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

export async function analyzeFrame(imageBase64, userQuery = null, memories = [], mode = 'scan') {
  if (consecutiveFailures >= 3) {
    // Auto-reset after 10s so transient failures don't lock forever
    consecutiveFailures = 0;
  }

  const { depthBuffer, depthWidth, depthHeight } = useAppStore.getState();
  const depthContext = buildDepthContext(depthBuffer, depthWidth, depthHeight);

  const modeInstructions = {
    scan: 'Describe the scene spatially. Focus on navigation-relevant objects.',
    talk: userQuery ? `User asked: "${userQuery}". Answer directly and helpfully.` : 'Describe the scene.',
    read: 'Read all visible text. Transcribe exactly what you see.',
    find: userQuery ? `Help find: "${userQuery}". Look carefully and provide directions.` : 'Scan for any items of interest.',
  };

  const memoryContext = memories.length > 0
    ? `\nRelevant memories:\n${memories.map(m => `- ${m.content}`).join('\n')}`
    : '';

  const userText = `${modeInstructions[mode] || modeInstructions.scan}
${depthContext}${memoryContext}
Respond with valid JSON only matching the schema.`;

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
      maxOutputTokens: 800,
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response text from Gemini');
    const cleaned = stripMarkdown(text);
    return JSON.parse(cleaned);
  }

  try {
    const result = await doFetch();
    consecutiveFailures = 0;
    useAppStore.getState().setGeminiConnected(true);
    return result;
  } catch (err) {
    console.warn('Gemini attempt 1 failed:', err.message);
    // Retry once after 2s
    await new Promise(r => setTimeout(r, 2000));
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
