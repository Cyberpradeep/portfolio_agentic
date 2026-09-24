"""
Session Connection Registry for Real-Time Multimodal Digital Twin.
Manages per-session WebSocket transports, SSE queues, background tasks, and concurrency locks,
guaranteeing complete multi-user isolation with zero cross-session event bleed.
"""

import asyncio
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set
from fastapi import WebSocket


class ConnectionRegistry:
    def __init__(self):
        # session_id -> Set of active WebSockets (usually 1 per browser tab)
        self._websockets: Dict[str, Set[WebSocket]] = defaultdict(set)
        # session_id -> List of SSE queues for /events
        self._sse_queues: Dict[str, List[asyncio.Queue]] = defaultdict(list)
        # session_id -> Running Pipecat PipelineTask
        self._tasks: Dict[str, Any] = {}
        # session_id -> asyncio.Lock for thread-safe state operations
        self._locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def register_websocket(self, session_id: str, ws: WebSocket):
        if not session_id:
            return
        self._websockets[session_id].add(ws)
        print(f"[REGISTRY] Registered WebSocket for session={session_id} (count={len(self._websockets[session_id])})")

    def unregister_websocket(self, session_id: str, ws: WebSocket):
        if not session_id or session_id not in self._websockets:
            return
        self._websockets[session_id].discard(ws)
        if not self._websockets[session_id]:
            del self._websockets[session_id]
        print(f"[REGISTRY] Unregistered WebSocket for session={session_id}")

    def register_sse_queue(self, session_id: str, queue: asyncio.Queue):
        if not session_id:
            return
        self._sse_queues[session_id].append(queue)
        print(f"[REGISTRY] Registered SSE queue for session={session_id} (count={len(self._sse_queues[session_id])})")

    def unregister_sse_queue(self, session_id: str, queue: asyncio.Queue):
        if not session_id or session_id not in self._sse_queues:
            return
        if queue in self._sse_queues[session_id]:
            self._sse_queues[session_id].remove(queue)
        if not self._sse_queues[session_id]:
            del self._sse_queues[session_id]
        print(f"[REGISTRY] Unregistered SSE queue for session={session_id}")

    def set_task(self, session_id: str, task: Any):
        if session_id:
            self._tasks[session_id] = task

    def get_task(self, session_id: str) -> Optional[Any]:
        return self._tasks.get(session_id)

    def remove_task(self, session_id: str) -> Optional[Any]:
        return self._tasks.pop(session_id, None)

    def get_lock(self, session_id: str) -> asyncio.Lock:
        return self._locks[session_id]

    async def broadcast_to_session(self, session_id: str, payload: dict):
        """
        Dispatches payload strictly to transports associated with the given session_id.
        Prevents event bleed across different users.
        """
        if not session_id:
            print(f"[REGISTRY_WARN] broadcast_to_session called with empty session_id for event: {payload.get('type')}")
            return

        if isinstance(payload, dict) and "id" not in payload:
            payload["id"] = str(uuid.uuid4())

        # 1. Dispatch over active session WebSockets
        ws_list = list(self._websockets.get(session_id, []))
        for ws in ws_list:
            try:
                await ws.send_json(payload)
            except Exception as exc:
                print(f"[WS_DISPATCH_ERR] session={session_id} error={exc}")
                self._websockets[session_id].discard(ws)

        # 2. Dispatch to session SSE queues
        q_list = list(self._sse_queues.get(session_id, []))
        dead_queues = []
        for q in q_list:
            try:
                await q.put(payload)
            except Exception:
                dead_queues.append(q)
        for q in dead_queues:
            if session_id in self._sse_queues and q in self._sse_queues[session_id]:
                self._sse_queues[session_id].remove(q)


# Global singleton registry instance
connection_registry = ConnectionRegistry()
