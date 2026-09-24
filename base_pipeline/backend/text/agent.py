"""
Text AI Agent Service for Groq Qwen.
Executes typed queries with sub-300ms turnaround, resolving function calls,
synchronizing with the canonical session memory, and dispatching GenUI updates.
"""

import json
from typing import Any, Dict, List, Optional
from openai import AsyncOpenAI

from core.connection_registry import connection_registry
from core.session_manager import session_manager
from text.config import (
    GROQ_API_KEY,
    GROQ_MODEL,
    GROQ_BASE_URL,
    TEMPERATURE,
    MAX_TOKENS_TOOL,
    MAX_TOKENS_RESPONSE,
    MAX_SESSION_TURNS,
)
from text.prompts import TEXT_SYSTEM_PROMPT
from text.tools import TEXT_TOOLS, execute_text_tool

# Initialize AsyncOpenAI client targeting Groq
client = AsyncOpenAI(
    base_url=GROQ_BASE_URL,
    api_key=GROQ_API_KEY or "dummy_key_for_init",
)


async def handle_text_query(text: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Executes a typed query through Groq's qwen/qwen3.8-27b model,
    using synchronized conversation context from session_manager.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        return {"response": "Please provide a query.", "tools_called": []}

    sess_key = session_id or "default_session"

    # 1. Retrieve unified context from canonical session manager
    prior_turns = session_manager.get_turns(sess_key, limit=MAX_SESSION_TURNS * 2)

    history: List[Dict[str, Any]] = [
        {"role": "system", "content": TEXT_SYSTEM_PROMPT}
    ]
    for turn in prior_turns:
        history.append({
            "role": turn.get("role", "user"),
            "content": turn.get("content", "")
        })
    history.append({"role": "user", "content": clean_text})

    tools_called: List[str] = []
    final_response = ""

    try:
        # Step 1: Initial call to Groq
        response = await client.chat.completions.create(
            model=GROQ_MODEL,
            messages=history,
            tools=TEXT_TOOLS,
            tool_choice="auto",
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS_TOOL,
        )

        message = response.choices[0].message
        tool_calls = getattr(message, "tool_calls", None)

        if tool_calls:
            clean_tool_calls = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    }
                }
                for tc in tool_calls
            ]
            history.append({
                "role": "assistant",
                "content": message.content or None,
                "tool_calls": clean_tool_calls,
            })

            # Step 2: Execute each tool call
            for t_call in tool_calls:
                func_name = t_call.function.name
                tools_called.append(func_name)
                try:
                    args = json.loads(t_call.function.arguments)
                except Exception:
                    args = {}

                tool_result = await execute_text_tool(func_name, args, sess_key)

                history.append({
                    "role": "tool",
                    "tool_call_id": t_call.id,
                    "content": json.dumps(tool_result)
                })

            # Step 3: Follow-up call for natural language synthesis
            follow_up = await client.chat.completions.create(
                model=GROQ_MODEL,
                messages=history,
                temperature=TEMPERATURE,
                max_tokens=MAX_TOKENS_RESPONSE,
            )
            final_response = follow_up.choices[0].message.content or ""
        else:
            final_response = message.content or ""

        final_response = final_response.strip()

        # Step 4: Synchronize turns back into canonical session memory
        session_manager.add_turn(sess_key, role="user", content=clean_text, source="text")
        session_manager.add_turn(sess_key, role="assistant", content=final_response, source="text", tools_called=tools_called)

        # Step 5: Broadcast assistant text & turn completion strictly to this session
        await connection_registry.broadcast_to_session(sess_key, {
            "type": "assistant",
            "text": final_response
        })
        await connection_registry.broadcast_to_session(sess_key, {
            "type": "turn_complete"
        })

        return {
            "response": final_response,
            "tools_called": tools_called,
            "session_id": sess_key
        }

    except Exception as exc:
        print(f"[TEXT_AGENT_ERROR] {exc}")
        err_msg = "I encountered an issue processing that query. Please try again or engage the voice session."
        await connection_registry.broadcast_to_session(sess_key, {"type": "assistant", "text": err_msg})
        await connection_registry.broadcast_to_session(sess_key, {"type": "turn_complete"})
        return {
            "response": err_msg,
            "tools_called": tools_called,
            "error": str(exc),
            "session_id": sess_key
        }
