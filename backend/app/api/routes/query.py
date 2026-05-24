from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Any, Dict
from uuid import uuid4
import logging

from app.pipeline.nl_sql_pipeline import NLtoSQLPipeline
from app.api.routes.auth import redis_client

logger = logging.getLogger(__name__)

router = APIRouter()


class QueryRequest(BaseModel):
    question: str
    session_id: str | None = None
    request_id: str | None = None
    query_context: Dict[str, Any] | None = None


@router.post("/query", response_model=Dict[str, Any])
async def query_endpoint(request: QueryRequest, req: Request):
    try:
        from app.api.routes.auth import get_session_credentials
        user_id, auth_session_id = get_session_credentials(req)
        
        chat_session_id = request.session_id or "demo"
        token_session_id = auth_session_id or chat_session_id
        
        token_key = f"copilot_token:{token_session_id}"
        raw_token = redis_client.get(token_key)

        print("[Query Route] Chat Session ID:", chat_session_id)
        print("[Query Route] Auth Session ID:", auth_session_id)
        print("[Query Route] Token Session ID:", token_session_id)
        print("[Query Route] Token Key Lookup:", token_key)
        print("[Query Route] Redis Token Exists:", bool(raw_token))

        if not raw_token:
            raise HTTPException(
                status_code=401,
                detail="Live Copilot session expired or unavailable. Please reconnect authentication."
            )

        copilot_token = (
            raw_token.decode("utf-8")
            if isinstance(raw_token, bytes)
            else str(raw_token)
        )

        print("QUERY ROUTE TOKEN EXISTS:", bool(copilot_token))

        request_id = request.request_id or str(uuid4())
        logger.info("query_started | requestId=%s | session_id=%s", request_id, chat_session_id)

        pipeline = NLtoSQLPipeline()

        result = await pipeline.process(
            question=request.question,
            session_id=chat_session_id,
            copilot_token=copilot_token,
            query_context=request.query_context,
            request_id=request_id,
        )
        result["requestId"] = request_id

        return result

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("NL-to-SQL pipeline failed: %s", e)
        status_code = 400 if "Choose data sources" in str(e) else 500
        raise HTTPException(status_code=status_code, detail=str(e))
