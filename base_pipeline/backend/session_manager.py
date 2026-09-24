"""
Compatibility wrapper re-exporting from core.session_manager.
"""

from core.session_manager import (
    ConversationTurn,
    SessionData,
    SessionManager,
    session_manager,
)

__all__ = ["ConversationTurn", "SessionData", "SessionManager", "session_manager"]
