from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.db import Db

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str


# HEAD too: uptime monitors (UptimeRobot by default) check with HEAD, and a 405 reads as down.
@router.api_route("/health", methods=["GET", "HEAD"], response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness check. Does not touch the database (used by Docker and Render)."""
    return HealthResponse(status="ok")


@router.api_route("/health/ready", methods=["GET", "HEAD"], response_model=HealthResponse)
async def ready(db: Db) -> HealthResponse:
    """Readiness check: can we reach the database as the anon role? Also the keep-alive
    target: the query keeps the hosted Supabase project active (README)."""
    await db.execute(text("select 1"))
    return HealthResponse(status="ok")
