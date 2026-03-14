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

const SYSTEM_PROMPT = `You are VisionCompanion, a warm AI visual assistant for blind/low-vision users.
RULES:
1. Concise: 1-3 sentences unless asked for detail.
2. SAFETY FIRST: stairs, obstacles, vehicles, curbs, crosswalks → safety_alert.
3. Spatial language: "to your left", "2 meters ahead", "waist height".
4. Read visible text when relevant.
5. People: describe by clothing/actions only.
6. Object search: mark is_target: true, provide depth_mask_range [near,far] 0-255.
7. sf_symbol values (Lucide names): stop-circle, footprints, alert-triangle, arrow-left, arrow-right, arrow-up, door-open.
8. depth_mask_range: estimate where the object sits in relative depth (255=nearest, 0=farthest).
9. Suggest memory_update for recurring patterns.
Respond with ONLY valid JSON. No markdown. No fences.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    objects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          bbox: { type: 'array', items: { type: 'number' } },
          depthEstimate: { type: 'number' },
          isTarget: { type: 'boolean' },
          sfSymbol: { type: 'string' },
          overlayColor: { type: 'string' },
          depthMaskRange: { type: 'array', items: { type: 'number' } },
        },
        required: ['id', 'label', 'bbox', 'isTarget', 'overlayColor'],
      }
    },
    caption: { type: 'string' },
    spoken_response: { type: 'string' },
    safety_alert: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['critical', 'warning', 'info'] },
        message: { type: 'string' },
        sfSymbol: { type: 'string' },
      },
      required: ['level', 'message', 'sfSymbol'],
    },
    memory_update: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        category: { type: 'string' },
        importance: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content', 'category', 'importance', 'tags'],
    },
  },
  required: ['objects', 'caption', 'spoken_response'],
};

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
    return null;
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
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 1024,
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
