from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.routes.auth import get_session_credentials
from app.db.database import get_db
from app.models.chat_history import ChatHistory
from app.models.user import User

router = APIRouter()


class ChatHistoryPayload(BaseModel):
    sessions: list[dict[str, Any]] = Field(default_factory=list)
    currentSessionId: Optional[str] = None


def _current_user(request: Request, db: Session) -> User:
    user_id, auth_session_id = get_session_credentials(request)
    print(f"[History Auth] resolved authenticated user id={user_id} auth_session={auth_session_id}")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/chat-history")
def get_chat_history(request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    record = db.query(ChatHistory).filter(ChatHistory.user_id == user.id).first()
    sessions = record.sessions if record else []
    current_session_id = record.current_session_id if record else None
    print(
        f"[History Restore] storage_source=backend user_id={user.id} "
        f"fetched_conversation_count={len(sessions or [])} restore_success=True"
    )
    return {
        "sessions": sessions or [],
        "currentSessionId": current_session_id,
        "storage_source": "backend",
        "user_id": user.id,
        "conversation_count": len(sessions or []),
    }


@router.put("/chat-history")
def save_chat_history(payload: ChatHistoryPayload, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    record = db.query(ChatHistory).filter(ChatHistory.user_id == user.id).first()
    if not record:
        record = ChatHistory(user_id=user.id, sessions=[], current_session_id=None)
        db.add(record)

    record.sessions = payload.sessions
    record.current_session_id = payload.currentSessionId
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    print(
        f"[History Save] storage_source=backend user_id={user.id} "
        f"saved_conversation_count={len(payload.sessions)} active_session={payload.currentSessionId}"
    )
    return {
        "ok": True,
        "storage_source": "backend",
        "user_id": user.id,
        "conversation_count": len(payload.sessions),
    }
