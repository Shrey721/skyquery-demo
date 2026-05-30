"""Discover enterprise intelligence endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.discover_enterprise_service import enrich_discover_airports

router = APIRouter()


class DiscoverEnterpriseRequest(BaseModel):
    question: str = Field(..., min_length=1)
    location: str | None = None
    airports: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/discover/enterprise")
async def discover_enterprise(request: DiscoverEnterpriseRequest) -> dict[str, Any]:
    return await enrich_discover_airports(request.question, request.location, request.airports)
