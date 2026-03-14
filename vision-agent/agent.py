"""
VisionCompanion Railtracks Agent
=================================
Built with Railtracks — an agentic Python framework that orchestrates
multi-step reasoning, memory retrieval, and scene analysis for VisionCompanion.

The agent receives a camera frame + user query, then decides which tools to call:
  - analyze_scene: sends the image to Gemini Vision for spatial understanding
  - retrieve_memories: fetches relevant past interactions from in-memory store
  - save_memory: stores new preferences/routines for future sessions
  - assess_safety: evaluates depth data for immediate hazard warnings

The Railtracks framework manages tool-call orchestration, retry logic, and
structured output — the agent decides the WHAT, Railtracks handles the HOW.
"""

import base64
import json
import os
from typing import Optional

import google.generativeai as genai
import railtracks as rt
from pydantic import BaseModel

# ── API setup ──────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("VITE_GEMINI_API_KEY", "")
genai.configure(api_key=GEMINI_API_KEY)

SYSTEM_PROMPT = """You are VisionCompanion, a warm AI visual assistant for blind/low-vision users.
RULES:
1. Concise: 1-3 sentences unless asked for detail.
2. SAFETY FIRST: stairs, obstacles, vehicles, curbs, crosswalks → safety_alert.
3. Spatial language: "to your left", "2 meters ahead", "waist height".
4. Read visible text when relevant.
5. People: describe by clothing/actions only.
6. Object search: mark is_target: true, provide depth_mask_range [near,far] 0-255.
7. depth_mask_range: estimate where object sits in depth (255=nearest, 0=farthest).
8. Suggest memory_update for recurring preferences or patterns.
Respond with ONLY valid JSON matching the schema."""

# ── In-memory store (production would use a DB) ────────────────────────────────
_memories: list[dict] = []


# ── Pydantic output schema ─────────────────────────────────────────────────────
class DetectedObject(BaseModel):
    id: str
    label: str
    bbox: list[float]
    depthEstimate: Optional[float] = None
    isTarget: bool = False
    sfSymbol: Optional[str] = None
    overlayColor: str = "#F0C020"
    depthMaskRange: Optional[list[float]] = None


class SafetyAlert(BaseModel):
    level: str  # 'critical' | 'warning' | 'info'
    message: str
    sfSymbol: str


class MemoryUpdate(BaseModel):
    content: str
    category: str
    importance: float
    tags: list[str]


class VisionResponse(BaseModel):
    objects: list[DetectedObject] = []
    caption: str = ""
    spoken_response: str = ""
    safety_alert: Optional[SafetyAlert] = None
    memory_update: Optional[MemoryUpdate] = None


# ── Railtracks tool nodes ──────────────────────────────────────────────────────

@rt.function_node
def analyze_scene(image_b64: str, user_query: str, depth_context: str) -> str:
    """
    Analyzes a camera frame using Gemini Vision API.
    Returns a JSON string with detected objects, caption, spoken response,
    safety alerts, and depth mask ranges for visual overlays.

    Args:
        image_b64: Base64-encoded JPEG image from the camera.
        user_query: What the user asked (e.g. "where is the bottle?").
        depth_context: Depth map readings from Depth Anything V2.
    """
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = f"""
{user_query if user_query else "Describe the scene for a blind user."}

Depth sensor data: {depth_context}

Return ONLY valid JSON with this exact structure:
{{
  "objects": [{{"id": "...", "label": "...", "bbox": [yMin,xMin,yMax,xMax], "depthEstimate": 1.5, "isTarget": false, "sfSymbol": null, "overlayColor": "#F0C020", "depthMaskRange": [100,150]}}],
  "caption": "...",
  "spoken_response": "...",
  "safety_alert": null,
  "memory_update": null
}}
"""
    image_part = {"mime_type": "image/jpeg", "data": image_b64}
    response = model.generate_content(
        [image_part, prompt],
        generation_config={"temperature": 0.4, "max_output_tokens": 1024},
    )
    text = response.text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


@rt.function_node
def retrieve_memories(query: str, limit: int = 5) -> list[str]:
    """
    Retrieves the most relevant past memories for the current query.
    Uses keyword matching weighted by importance and recency.

    Args:
        query: The current user query or scene context to match against.
        limit: Maximum number of memories to return.
    """
    if not _memories:
        return []

    query_words = set(query.lower().split())
    scored = []
    for mem in _memories:
        content_words = set(mem.get("content", "").lower().split())
        tag_words = set(" ".join(mem.get("tags", [])).lower().split())
        overlap = len(query_words & (content_words | tag_words))
        score = overlap * (mem.get("importance", 0.5) * 0.6 + 0.4)
        scored.append((score, mem["content"]))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [content for _, content in scored[:limit] if _ > 0]


@rt.function_node
def save_memory(content: str, category: str, importance: float, tags: list[str]) -> str:
    """
    Persists a new memory entry for future sessions.
    Used for preferences, routines, and important interactions.

    Args:
        content: The memory text to store.
        category: One of: preference, routine, location, interaction, tip.
        importance: 0.0–1.0 priority score.
        tags: Keywords for retrieval matching.
    """
    _memories.append({
        "content": content,
        "category": category,
        "importance": importance,
        "tags": tags,
    })
    return f"Memory saved: {content[:60]}..."


@rt.function_node
def assess_safety(depth_context: str) -> str:
    """
    Analyzes depth sensor readings for immediate safety hazards.
    Runs locally without an API call for low-latency warnings.

    Args:
        depth_context: Depth map readings string from Depth Anything V2.
    """
    # Simple heuristic: if bottom-center depth value > 200, something is very close
    if "bottom-center:very close" in depth_context or "center:very close" in depth_context:
        return json.dumps({
            "level": "critical",
            "message": "Obstacle very close ahead — stop and check",
            "sfSymbol": "alert-triangle",
        })
    if "bottom-center:close" in depth_context:
        return json.dumps({
            "level": "warning",
            "message": "Something close ahead",
            "sfSymbol": "alert-triangle",
        })
    return json.dumps({"level": "info", "message": "Path appears clear", "sfSymbol": "footprints"})


# ── Railtracks Agent ───────────────────────────────────────────────────────────

VisionAgent = rt.agent_node(
    "VisionCompanion Agent",
    tool_nodes=[analyze_scene, retrieve_memories, save_memory, assess_safety],
    llm=rt.llm.GeminiLLM("gemini-2.5-flash"),
    system_message="""You are the VisionCompanion agent orchestrator.

Given a user query and camera frame, coordinate your tools to provide the best response:
1. Call retrieve_memories with the user query to get relevant context.
2. Call analyze_scene with the image, query, and depth context.
3. If depth context suggests hazards, call assess_safety.
4. If the scene analysis includes a memory_update, call save_memory.
5. Return a concise spoken_response for the user.

Always prioritize safety. Always be warm and clear.""",
)


# ── Flow entry point ───────────────────────────────────────────────────────────

VisionFlow = rt.Flow("vision-companion-flow", entry_point=VisionAgent)


async def run_vision_agent(
    image_b64: str,
    user_query: str,
    depth_context: str,
    memories: list[str],
) -> VisionResponse:
    """
    Main entry point called by the FastAPI server.
    Runs the Railtracks VisionCompanion agent and returns a structured response.
    """
    memory_context = "\n".join(f"- {m}" for m in memories) if memories else "No prior memories."

    prompt = f"""
User query: "{user_query}"
Depth sensor: {depth_context}
Prior memories:
{memory_context}

Analyze the camera frame and respond helpfully. Use your tools in order:
1. retrieve_memories("{user_query}")
2. analyze_scene(image_b64, "{user_query}", "{depth_context}")
3. assess_safety("{depth_context}") if depth suggests hazards
Return the final spoken_response and any objects detected.
"""

    try:
        result = await VisionFlow.invoke(prompt)
        # Parse the agent's text response as JSON if possible
        text = result.content if hasattr(result, "content") else str(result)
        try:
            data = json.loads(text)
            return VisionResponse(**data)
        except (json.JSONDecodeError, TypeError):
            return VisionResponse(
                caption=text[:200],
                spoken_response=text[:500],
            )
    except Exception as e:
        # Graceful degradation — return minimal response
        print(f"Agent error: {e}")
        return VisionResponse(
            caption="Scene analysis unavailable.",
            spoken_response="I'm having trouble processing the scene right now.",
        )
