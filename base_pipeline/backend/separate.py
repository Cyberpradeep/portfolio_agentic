import asyncio
import base64
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google import genai
from google.genai import types


load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"
MODEL_PATH = ROOT.parent / "examples" / "3d_model_testing" / "biped_robot.glb"

GEMINI_API_KEY = "AIzaSyBKNfvwh6im3gMwRioK8R7o1NJnmApWrxA"
MODEL = os.getenv("MODEL", "gemini-3.1-flash-live-preview")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
VOICE_ID = os.getenv("VOICE_ID", "Puck")

SYSTEM_INSTRUCTION = (
    "You are Pradeep's portfolio assistant. Be concise, friendly, and accurate. "
    "Focus on normal conversation only."
)


class TextMessage(BaseModel):
    text: str


@dataclass
class ActiveSession:
    text_queue: asyncio.Queue[str]
    audio_queue: asyncio.Queue[bytes]
    video_queue: asyncio.Queue[bytes]
    send_lock: asyncio.Lock
    websocket: WebSocket


active_session: ActiveSession | None = None


async def send_json(websocket: WebSocket, payload: dict, send_lock: asyncio.Lock):
    async with send_lock:
        await websocket.send_json(payload)


async def send_bytes(websocket: WebSocket, payload: bytes, send_lock: asyncio.Lock):
    async with send_lock:
        await websocket.send_bytes(payload)


class GeminiLive:
    def __init__(self, api_key: str, model: str, input_sample_rate: int = 16000):
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.input_sample_rate = input_sample_rate

    async def start_session(self, session: ActiveSession):
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=VOICE_ID)
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=SYSTEM_INSTRUCTION)]
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                turn_coverage="TURN_INCLUDES_ONLY_ACTIVITY",
            ),
        )

        logger.info("Connecting to Gemini Live model=%s", self.model)
        async with self.client.aio.live.connect(model=self.model, config=config) as live_session:
            logger.info("Gemini Live session opened")

            async def send_audio():
                while True:
                    chunk = await session.audio_queue.get()
                    await live_session.send_realtime_input(
                        audio=types.Blob(
                            data=chunk,
                            mime_type=f"audio/pcm;rate={self.input_sample_rate}",
                        )
                    )

            async def send_video():
                while True:
                    chunk = await session.video_queue.get()
                    await live_session.send_realtime_input(
                        video=types.Blob(data=chunk, mime_type="image/jpeg")
                    )

            async def send_text():
                while True:
                    text = await session.text_queue.get()
                    logger.info("Sending text to Gemini: %s", text)
                    await live_session.send_realtime_input(text=text)

            async def receive_loop():
                async for response in live_session.receive():
                    server_content = response.server_content

                    if not server_content:
                        continue

                    if server_content.model_turn:
                        for part in server_content.model_turn.parts:
                            if part.inline_data and part.inline_data.data:
                                await send_bytes(
                                    session.websocket,
                                    part.inline_data.data,
                                    session.send_lock,
                                )

                    if server_content.input_transcription and server_content.input_transcription.text:
                        await send_json(
                            session.websocket,
                            {"type": "user",
                                "text": server_content.input_transcription.text},
                            session.send_lock,
                        )

                    if server_content.output_transcription and server_content.output_transcription.text:
                        await send_json(
                            session.websocket,
                            {
                                "type": "assistant",
                                "text": server_content.output_transcription.text,
                                "meta": {"finalized": True, "source": "gemini_live"},
                            },
                            session.send_lock,
                        )

                    if server_content.turn_complete:
                        await send_json(session.websocket, {"type": "turn_complete"}, session.send_lock)

            tasks = [
                asyncio.create_task(send_audio()),
                asyncio.create_task(send_video()),
                asyncio.create_task(send_text()),
                asyncio.create_task(receive_loop()),
            ]

            try:
                await asyncio.gather(*tasks)
            finally:
                for task in tasks:
                    task.cancel()


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
async def root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


@app.get("/model.glb")
async def model_glb():
    if not MODEL_PATH.exists():
        raise HTTPException(status_code=404, detail="GLB model not found")
    return FileResponse(str(MODEL_PATH), media_type="model/gltf-binary")


@app.get("/health")
async def health():
    return {"ok": True, "model": MODEL}


@app.post("/text")
async def send_text(message: TextMessage):
    global active_session
    text = (message.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if active_session is None:
        raise HTTPException(status_code=409, detail="No active audio session")

    await active_session.text_queue.put(text)
    return {"ok": True}


@app.websocket("/audio")
async def audio_socket(websocket: WebSocket):
    global active_session

    await websocket.accept()
    if not GEMINI_API_KEY:
        await websocket.close(code=1011, reason="Missing GEMINI_API_KEY")
        return

    session = ActiveSession(
        text_queue=asyncio.Queue(),
        audio_queue=asyncio.Queue(),
        video_queue=asyncio.Queue(),
        send_lock=asyncio.Lock(),
        websocket=websocket,
    )
    active_session = session

    gemini = GeminiLive(api_key=GEMINI_API_KEY,
                        model=MODEL, input_sample_rate=16000)

    async def receive_from_client():
        try:
            while True:
                message = await websocket.receive()

                if message.get("bytes"):
                    await session.audio_queue.put(message["bytes"])
                    continue

                if message.get("text"):
                    text = message["text"]
                    try:
                        payload = json.loads(text)
                        if isinstance(payload, dict) and payload.get("type") == "image" and payload.get("data"):
                            image_data = base64.b64decode(payload["data"])
                            await session.video_queue.put(image_data)
                            continue
                    except Exception:
                        pass

                    await session.text_queue.put(text)
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected")
        except Exception as exc:
            logger.exception("Error receiving from client: %s", exc)

    receive_task = asyncio.create_task(receive_from_client())
    gemini_task = asyncio.create_task(gemini.start_session(session))

    try:
        await asyncio.gather(receive_task, gemini_task)
    finally:
        receive_task.cancel()
        gemini_task.cancel()
        if active_session is session:
            active_session = None
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
