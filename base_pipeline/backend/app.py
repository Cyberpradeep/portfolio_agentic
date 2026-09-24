"""
Conversational 3D Agentic Portfolio | FastAPI Gateway
------------------------------------------------------
Acts as the central HTTP/WebSocket gateway orchestrating:
- Modular Voice AI Pipeline (/audio)
- Modular Secondary Text Agent (/text)
- Multi-User Session-Scoped Event Stream (/events)
- 3D Assets & Static File Hosting
"""

import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

import asyncio
import json
import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pipecat.frames.frames import InterruptionFrame

from config import (
    FRONTEND_DIR,
    MODEL_PATH,
    HOST,
    PORT,
    VOICE_MODEL,
)
from core.connection_registry import connection_registry
from core.session_manager import session_manager
from core.services.data_service import preload_all_data
from voice.pipeline import run_voice_session
from text.agent import handle_text_query


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload knowledge base JSONs into memory for zero-latency queries
    preload_all_data()
    yield


app = FastAPI(title="Pradeep Selladurai AI Digital Twin", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# --------------------------------------------------------------------------
# Static Assets & Navigation Endpoints
# --------------------------------------------------------------------------
@app.get("/")
async def root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.get("/favicon.ico")
async def favicon_ico():
    fav = FRONTEND_DIR / "favicon.ico"
    if fav.exists():
        return FileResponse(str(fav), media_type="image/x-icon")
    fav_svg = FRONTEND_DIR / "favicon.svg"
    if fav_svg.exists():
        return FileResponse(str(fav_svg), media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/favicon.svg")
async def favicon_svg():
    fav = FRONTEND_DIR / "favicon.svg"
    if fav.exists():
        return FileResponse(str(fav), media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/favicon.png")
async def favicon_png():
    fav = FRONTEND_DIR / "favicon.png"
    if fav.exists():
        return FileResponse(str(fav), media_type="image/png")
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/model.glb")
async def model_glb():
    if not MODEL_PATH.exists():
        raise HTTPException(status_code=404, detail="GLB model not found")
    return FileResponse(str(MODEL_PATH), media_type="model/gltf-binary")


@app.get("/health")
async def health():
    return {"ok": True, "model": VOICE_MODEL}


# --------------------------------------------------------------------------
# Multi-User Session-Scoped SSE Channel
# --------------------------------------------------------------------------
@app.get("/events")
async def events(session_id: Optional[str] = Query(None)):
    """
    Server-Sent Events channel scoped strictly to session_id,
    preventing event bleed between different users.
    """
    sid = session_id or "default_session"
    queue = asyncio.Queue()
    connection_registry.register_sse_queue(sid, queue)

    async def stream():
        try:
            await queue.put({"type": "status", "state": "ready", "session_id": sid})
            while True:
                event = await queue.get()
                yield f"data: {json.dumps(event)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            connection_registry.unregister_sse_queue(sid, queue)

    return StreamingResponse(stream(), media_type="text/event-stream")


# --------------------------------------------------------------------------
# Secondary Text Agent Endpoint
# --------------------------------------------------------------------------
class TextMessage(BaseModel):
    text: str
    session_id: Optional[str] = None


@app.post("/text")
async def send_text(message: TextMessage):
    text = (message.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    sid = message.session_id or "default_session"
    session_manager.reset_activity(sid)

    # Clean interruption: if the user was actively speaking on voice, interrupt voice output
    voice_task = connection_registry.get_task(sid)
    if voice_task:
        try:
            await voice_task.queue_frames([InterruptionFrame()])
        except Exception:
            pass

    print(f"[TEXT_INPUT] session={sid} query={text!r}")
    res = await handle_text_query(text, session_id=sid)
    return {"ok": True, "mode": "text", **res}


# --------------------------------------------------------------------------
# Voice AI WebSocket Endpoint
# --------------------------------------------------------------------------
@app.websocket("/audio")
async def audio_socket(websocket: WebSocket):
    await websocket.accept()
    query_params = dict(websocket.query_params)
    session_id = query_params.get("session_id")
    if not session_id or not session_id.strip():
        session_id = f"sess_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    await run_voice_session(websocket, session_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
