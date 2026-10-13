from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.db import Db

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness check. Does not touch the database (used by Docker and Render)."""
    return HealthResponse(status="ok")


@router.get("/health/ready", response_model=HealthResponse)
async def ready(db: Db) -> HealthResponse:
    """Readiness check: can we reach the database as the anon role?"""
    await db.execute(text("select 1"))
    return HealthResponse(status="ok")
