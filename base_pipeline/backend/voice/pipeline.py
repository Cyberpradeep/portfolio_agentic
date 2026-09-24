"""
Voice AI Audio Pipeline & WebSocket Session Runner.
Constructs the Pipecat real-time audio pipeline, attaches serializers,
aggregators, and context summarizers, and manages the session lifecycle.
"""

import asyncio
import json
import time
from typing import Optional
from fastapi import WebSocket

from pipecat.frames.frames import (
    AudioRawFrame,
    Frame,
    InputAudioRawFrame,
    InterruptionFrame,
    LLMContextFrame,
    LLMFullResponseStartFrame,
    LLMRunFrame,
    LLMTextFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_response_universal import (
    AssistantTurnStoppedMessage,
    LLMAssistantAggregatorParams,
    LLMContext,
    LLMContextAggregatorPair,
)
from pipecat.processors.aggregators.llm_context_summarizer import SummaryAppliedEvent
from pipecat.utils.context.llm_context_summarization import (
    LLMAutoContextSummarizationConfig,
    LLMContextSummaryConfig,
)
from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.services.google.gemini_live.llm import (
    GeminiLiveLLMService,
    GeminiModalities,
    GeminiVADParams,
)
from pipecat.services.google.llm import GoogleLLMService, GoogleThinkingConfig
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport

from config import GEMINI_API_KEY, VOICE_MODEL, VOICE_ID, SUMMARIZER_MODEL
from core.connection_registry import connection_registry
from core.session_manager import session_manager
from voice.config import (
    SAMPLE_RATE_IN,
    SAMPLE_RATE_OUT,
    VAD_SILENCE_DURATION_MS,
    INACTIVITY_TIMEOUT_SECONDS,
    RNNOISE_AVAILABLE,
    RNNoiseFilter,
)
from voice.prompts import VOICE_SYSTEM_INSTRUCTION
from voice.tools import GEMINI_VOICE_TOOLS, register_voice_tools


class RawPCMSerializer(FrameSerializer):
    def __init__(self, sample_rate: int = SAMPLE_RATE_IN):
        super().__init__()
        self._sample_rate = sample_rate

    async def serialize(self, frame):
        if isinstance(frame, AudioRawFrame):
            return frame.audio
        return None

    async def deserialize(self, data):
        if not isinstance(data, bytes) or len(data) == 0:
            return None
        return InputAudioRawFrame(audio=data, sample_rate=self._sample_rate, num_channels=1)


class LiveTranscriptStreamer(FrameProcessor):
    def __init__(self, session_id: str):
        super().__init__()
        self.session_id = session_id
        self._bot_text_accum = ""

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMTextFrame):
            token = frame.text or ""
            if token and "<ctrl" not in token and "<noise>" not in token:
                self._bot_text_accum += token
                user_text = self._bot_text_accum.strip()
                try:
                    await connection_registry.broadcast_to_session(
                        self.session_id,
                        {
                            "type": "assistant_stream",
                            "text": user_text,
                            "meta": {"finalized": False}
                        }
                    )
                except Exception as exc:
                    print(f"[STREAM_ERR] {exc}")

        elif isinstance(frame, (InterruptionFrame, LLMFullResponseStartFrame)):
            self._bot_text_accum = ""

        await self.push_frame(frame, direction)


def _extract_message_text(message) -> str:
    if message is None:
        return ""

    if isinstance(message, dict):
        content = message.get("content", "")
    else:
        content = getattr(message, "content", "")

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text" and item.get("text"):
                    parts.append(str(item.get("text")))
                elif item.get("text"):
                    parts.append(str(item.get("text")))
            elif isinstance(item, str):
                parts.append(item)
        return " ".join(part.strip() for part in parts if part and part.strip())

    return str(content or "").strip()


async def run_voice_session(websocket: WebSocket, session_id: str):
    """
    Executes a real-time Gemini Live voice session for the specified WebSocket and session_id.
    """
    connection_registry.register_websocket(session_id, websocket)

    if not GEMINI_API_KEY:
        await websocket.close(code=1011, reason="Missing GEMINI_API_KEY")
        return

    session_data = session_manager.get_or_create(session_id)
    session_data.is_active = True
    print(f"[VOICE_SESSION] Started for session_id={session_id}, prior turns={len(session_data.messages)}")

    await connection_registry.broadcast_to_session(
        session_id,
        {"type": "status", "state": "connected", "session_id": session_id}
    )

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_in_filter=RNNoiseFilter() if RNNOISE_AVAILABLE else None,
            audio_out_enabled=True,
            add_wav_header=False,
            audio_in_sample_rate=SAMPLE_RATE_IN,
            audio_out_sample_rate=SAMPLE_RATE_OUT,
            serializer=RawPCMSerializer(sample_rate=SAMPLE_RATE_IN),
        ),
    )

    is_initial = len(session_data.messages) == 0

    llm = GeminiLiveLLMService(
        api_key=GEMINI_API_KEY,
        settings=GeminiLiveLLMService.Settings(
            model=VOICE_MODEL,
            voice=VOICE_ID,
            modalities=GeminiModalities.AUDIO,
            vad=GeminiVADParams(silence_duration_ms=VAD_SILENCE_DURATION_MS),
            thinking=GoogleThinkingConfig(thinking_budget=0),
        ),
        system_instruction=VOICE_SYSTEM_INSTRUCTION,
        tools=GEMINI_VOICE_TOOLS,
        inference_on_context_initialization=is_initial,
        http_options={"api_version": "v1beta"},
    )

    # Register session-scoped tools
    register_voice_tools(llm, session_id)

    # Pre-seed initial messages from unified session history
    if is_initial:
        initial_messages = [
            {
                "role": "user",
                "content": "Hey! Give the visitor your funny, upbeat opening greeting: playfully compare yourself to ChatGPT running on extra coffee with zero subscription, introduce yourself as Pradeep's AI digital twin, and ask what they'd like to explore!",
            }
        ]
    else:
        initial_messages = list(session_data.messages)
    context = LLMContext(messages=initial_messages)

    summarizer_llm = GoogleLLMService(
        api_key=GEMINI_API_KEY,
        settings=GoogleLLMService.Settings(model=SUMMARIZER_MODEL),
    )

    auto_summary_config = LLMAutoContextSummarizationConfig(
        max_context_tokens=5000,
        max_unsummarized_messages=12,
        summary_config=LLMContextSummaryConfig(
            target_context_tokens=2000,
            min_messages_after_summary=4,
            summary_message_template="Conversation context summary: {summary}",
            llm=summarizer_llm,
        ),
    )

    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        assistant_params=LLMAssistantAggregatorParams(
            enable_auto_context_summarization=True,
            auto_context_summarization_config=auto_summary_config,
        ),
    )
    state = {"last_user_text": ""}

    @user_aggregator.event_handler("on_user_turn_started")
    async def on_user_started(processor, strategy, message):
        session_manager.reset_activity(session_id)
        await connection_registry.broadcast_to_session(session_id, {"type": "status", "state": "listening"})

    @user_aggregator.event_handler("on_user_turn_stopped")
    async def on_user_stopped(processor, strategy, message):
        session_manager.reset_activity(session_id)
        text = _extract_message_text(message)
        if not text:
            return
        state["last_user_text"] = text.strip()

        # Commit user turn to canonical session memory
        session_manager.add_turn(session_id, role="user", content=text.strip(), source="voice")
        await connection_registry.broadcast_to_session(session_id, {"type": "user", "text": text.strip()})
        await connection_registry.broadcast_to_session(session_id, {"type": "status", "state": "thinking"})

    @assistant_aggregator.event_handler("on_assistant_turn_started")
    async def on_assistant_started(processor):
        await connection_registry.broadcast_to_session(session_id, {"type": "status", "state": "speaking"})

    async def on_inactivity_timeout(_sid: str = None):
        print(f"[WATCHDOG] Inactivity reached for session={session_id}. Pausing session.")
        session_data.is_active = False
        try:
            await connection_registry.broadcast_to_session(
                session_id,
                {"type": "session_paused", "session_id": session_id, "reason": "inactivity"}
            )
            await asyncio.sleep(0.08)
            await task.cancel()
            await websocket.close(code=1000, reason="Inactivity standby")
        except Exception as exc:
            print(f"[WATCHDOG_ERR] {exc}")

    @assistant_aggregator.event_handler("on_assistant_turn_stopped")
    async def on_assistant_stopped(processor, message: AssistantTurnStoppedMessage):
        text = _extract_message_text(message)
        user_text = state.get("last_user_text", "").strip()
        effective_text = text.strip() if text else ""

        # Suppress echo if assistant echoed user text
        if effective_text and user_text and effective_text.casefold() == user_text.casefold():
            effective_text = ""

        if effective_text:
            # Commit assistant turn to canonical session memory
            session_manager.add_turn(session_id, role="assistant", content=effective_text, source="voice")
            await connection_registry.broadcast_to_session(
                session_id,
                {
                    "type": "assistant",
                    "text": effective_text,
                    "meta": {"finalized": True, "source": "turn_stopped"},
                }
            )

        await connection_registry.broadcast_to_session(session_id, {"type": "turn_complete"})
        await connection_registry.broadcast_to_session(session_id, {"type": "status", "state": "idle"})
        session_manager.start_watchdog(session_id, timeout_seconds=INACTIVITY_TIMEOUT_SECONDS, on_timeout=on_inactivity_timeout)

    @assistant_aggregator.event_handler("on_summary_applied")
    async def on_summary_applied(aggregator, summarizer, event: SummaryAppliedEvent):
        await connection_registry.broadcast_to_session(
            session_id,
            {
                "type": "context_summarized",
                "original_count": event.original_message_count,
                "new_count": event.new_message_count,
                "summarized_count": event.summarized_message_count,
                "preserved_count": event.preserved_message_count,
            }
        )

    live_streamer = LiveTranscriptStreamer(session_id)

    pipeline = Pipeline([
        transport.input(),
        user_aggregator,
        llm,
        live_streamer,
        transport.output(),
        assistant_aggregator,
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=False,
            enable_usage_metrics=False,
        ),
    )
    connection_registry.set_task(session_id, task)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_, __):
        await connection_registry.broadcast_to_session(session_id, {"type": "status", "state": "idle", "session_id": session_id})
        session_manager.start_watchdog(session_id, timeout_seconds=INACTIVITY_TIMEOUT_SECONDS, on_timeout=on_inactivity_timeout)
        await task.queue_frames([LLMContextFrame(context)])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_, __):
        session_manager.cancel_watchdog(session_id)
        session_data.is_active = False
        await connection_registry.broadcast_to_session(session_id, {"type": "status", "state": "disconnected", "session_id": session_id})
        try:
            await task.cancel()
        except Exception:
            pass

    runner = PipelineRunner(handle_sigint=False)
    try:
        await runner.run(task)
    except Exception as exc:
        print(f"[SESSION_ERROR] session={session_id} error={exc}")
        await connection_registry.broadcast_to_session(session_id, {"type": "error", "message": str(exc)})
    finally:
        session_manager.cancel_watchdog(session_id)
        session_data.is_active = False
        connection_registry.remove_task(session_id)
        connection_registry.unregister_websocket(session_id, websocket)
        print(f"[VOICE_SESSION] Finished for session={session_id}")
