"""
VisionCompanion Railtracks Agent Server
Built with Railtracks — railtracks.ai

Start with:
    pip install -r requirements.txt
    python server.py
"""

import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import run_vision_agent, VisionResponse

app = FastAPI(title="VisionCompanion Railtracks Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    image_b64: str
    user_query: str = ""
    depth_context: str = ""
    memories: list[str] = []


@app.get("/health")
def health():
    return {"status": "ok", "framework": "railtracks"}


@app.post("/analyze", response_model=VisionResponse)
async def analyze(req: AnalyzeRequest):
    result = await run_vision_agent(
        image_b64=req.image_b64,
        user_query=req.user_query,
        depth_context=req.depth_context,
        memories=req.memories,
    )
    return result


if __name__ == "__main__":
    import uvicorn
    print("🚂 VisionCompanion Railtracks Agent starting on http://localhost:8000")
    print("   Built with Railtracks — railtracks.ai")
    uvicorn.run(app, host="0.0.0.0", port=8000)
