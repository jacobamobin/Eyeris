# Railtracks Integration — VisionCompanion

> **Built with Railtracks** — [railtracks.ai](https://railtracks.ai)

## What is Railtracks?

Railtracks is a Python framework for building agentic AI systems. Agent behavior, tools, and multi-step flows are defined entirely in standard Python — no YAML, no DSLs, no magic strings.

## How VisionCompanion Uses Railtracks

VisionCompanion's AI brain runs on a Railtracks agent server (`vision-agent/`). When the user speaks a query, the React frontend sends the camera frame + voice transcript to the Python backend, which uses Railtracks to orchestrate the response.

### Architecture

```
React Frontend
      │
      │  POST /analyze { image_b64, user_query, depth_context }
      ▼
FastAPI Server (server.py)
      │
      ▼
Railtracks VisionAgent
  ├── Tool: retrieve_memories(query)      ← fetch relevant past interactions
  ├── Tool: analyze_scene(image, query)   ← Gemini Vision API call
  ├── Tool: assess_safety(depth_context)  ← local depth hazard check
  └── Tool: save_memory(content, ...)     ← persist new preferences
      │
      ▼
Structured VisionResponse → React frontend renders overlays + speaks response
```

### The Railtracks Agent

```python
import railtracks as rt

VisionAgent = rt.agent_node(
    "VisionCompanion Agent",
    tool_nodes=[analyze_scene, retrieve_memories, save_memory, assess_safety],
    llm=rt.llm.GeminiLLM("gemini-2.5-flash"),
    system_message="You are the VisionCompanion agent orchestrator...",
)

VisionFlow = rt.Flow("vision-companion-flow", entry_point=VisionAgent)
result = await VisionFlow.invoke(user_prompt)
```

### Tool Nodes

| Tool | Purpose |
|------|---------|
| `analyze_scene` | Sends camera frame to Gemini Vision, returns detected objects with bounding boxes and depth mask ranges |
| `retrieve_memories` | Keyword-scores past memories to inject relevant context into each query |
| `save_memory` | Persists user preferences and interaction patterns for future sessions |
| `assess_safety` | Evaluates Depth Anything V2 readings for immediate hazard warnings without an API call |

### Why Railtracks?

- **Pure Python tool definitions** — each tool is just a `@rt.function_node`-decorated function with a docstring that becomes the tool schema
- **Agent decides call order** — the orchestrator LLM decides whether to call memories first, or safety assessment in parallel with scene analysis
- **Graceful fallback** — if the Railtracks backend isn't running, the React frontend falls back to calling Gemini directly, keeping the app functional in all environments
- **Structured output** — `VisionResponse` is a Pydantic model; Railtracks ensures the agent returns valid, typed data

## Running the Backend

```bash
cd vision-agent
pip install -r requirements.txt
python server.py
# → http://localhost:8000
```

The React app automatically routes voice queries through `http://localhost:8000/analyze` when the server is running.

## Files

```
vision-agent/
├── server.py        # FastAPI server with CORS
├── agent.py         # Railtracks agent, tools, and VisionFlow
└── requirements.txt # railtracks + fastapi + google-generativeai
```
