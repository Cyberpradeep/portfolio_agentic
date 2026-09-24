"""
Session Manager for Real-Time Multimodal AI Digital Twin.
Maintains canonical conversation memory, cross-modality (voice + text) synchronization,
inactivity watchdog timers, and sliding-window context preservation.
"""

from dataclasses import dataclass, field
import asyncio
import time
from typing import Any, Callable, Coroutine, Dict, List, Optional


@dataclass
class ConversationTurn:
    role: str              # "user" | "assistant"
    content: str           # Dialogue content (plain text)
    source: str = "voice"  # "voice" | "text"
    timestamp: float = field(default_factory=time.time)
    tools_called: Optional[List[str]] = None

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "content": self.content
        }


@dataclass
class SessionData:
    session_id: str
    created_at: float = field(default_factory=time.time)
    last_active_at: float = field(default_factory=time.time)
    messages: List[dict] = field(default_factory=list)
    summary: Optional[str] = None
    is_active: bool = False
    watchdog_task: Optional[asyncio.Task] = None


class SessionManager:
    def __init__(self, ttl_seconds: float = 7200.0, default_idle_timeout: float = 60.0):
        self._sessions: Dict[str, SessionData] = {}
        self._ttl_seconds = ttl_seconds
        self._default_idle_timeout = default_idle_timeout

    def get_or_create(self, session_id: str) -> SessionData:
        self.prune_stale()
        if not session_id:
            session_id = "default_session"
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionData(session_id=session_id)
        session = self._sessions[session_id]
        session.last_active_at = time.time()
        return session

    def get(self, session_id: str) -> Optional[SessionData]:
        return self._sessions.get(session_id)

    def add_turn(
        self,
        session_id: str,
        role: str,
        content: str,
        source: str = "voice",
        tools_called: Optional[List[str]] = None
    ):
        """
        Appends a canonical turn to the unified session memory.
        Used by BOTH Gemini Live (voice) and Groq (text) engines.
        """
        clean_text = (content or "").strip()
        if not clean_text:
            return

        session = self.get_or_create(session_id)
        session.last_active_at = time.time()

        # Prevent duplicate consecutive turns with identical text
        if session.messages:
            last = session.messages[-1]
            if last.get("role") == role and last.get("content", "").strip() == clean_text:
                return

        session.messages.append({
            "role": role,
            "content": clean_text
        })

    def get_turns(self, session_id: str, limit: Optional[int] = None) -> List[dict]:
        """
        Retrieves canonical message history for this session.
        """
        session = self.get_or_create(session_id)
        msgs = list(session.messages)
        if limit and len(msgs) > limit:
            return msgs[-limit:]
        return msgs

    def save_context(self, session_id: str, messages: list[dict], summary: Optional[str] = None):
        session = self.get_or_create(session_id)
        session.messages = list(messages)
        if summary:
            session.summary = summary
        session.last_active_at = time.time()

    def reset_activity(self, session_id: str):
        session = self._sessions.get(session_id)
        if session:
            session.last_active_at = time.time()
            self.cancel_watchdog(session_id)

    def cancel_watchdog(self, session_id: str):
        session = self._sessions.get(session_id)
        if session and session.watchdog_task and not session.watchdog_task.done():
            session.watchdog_task.cancel()
            session.watchdog_task = None

    def start_watchdog(
        self,
        session_id: str,
        timeout_seconds: Optional[float] = None,
        on_timeout: Optional[Callable[[str], Coroutine[Any, Any, None]]] = None
    ):
        session = self.get_or_create(session_id)
        self.cancel_watchdog(session_id)

        timeout = timeout_seconds if timeout_seconds is not None else self._default_idle_timeout

        async def _timer_worker():
            try:
                await asyncio.sleep(timeout)
                session.is_active = False
                session.watchdog_task = None
                if on_timeout:
                    try:
                        await on_timeout(session_id)
                    except TypeError:
                        await on_timeout()
            except asyncio.CancelledError:
                pass

        session.watchdog_task = asyncio.create_task(_timer_worker())

    def prune_stale(self):
        now = time.time()
        stale_keys = [
            sid for sid, s in self._sessions.items()
            if (now - s.last_active_at) > self._ttl_seconds and not s.is_active
        ]
        for sid in stale_keys:
            self.cancel_watchdog(sid)
            del self._sessions[sid]


# Global singleton session manager instance
session_manager = SessionManager(ttl_seconds=7200.0, default_idle_timeout=60.0)
