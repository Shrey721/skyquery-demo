"""Discover enterprise intelligence endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.discover_enterprise_service import discover_enterprise_candidates, enrich_discover_airports

router = APIRouter()


class DiscoverEnterpriseRequest(BaseModel):
    question: str = Field(..., min_length=1)
    location: str | None = None
    airports: list[dict[str, Any]] = Field(default_factory=list)


class DiscoverEnterpriseCandidatesRequest(BaseModel):
    question: str = Field(..., min_length=1)


@router.post("/discover/enterprise")
async def discover_enterprise(request: DiscoverEnterpriseRequest) -> dict[str, Any]:
    return await enrich_discover_airports(request.question, request.location, request.airports)


@router.post("/discover/enterprise-candidates")
async def enterprise_candidates(request: DiscoverEnterpriseCandidatesRequest) -> dict[str, Any]:
    return await discover_enterprise_candidates(request.question)
