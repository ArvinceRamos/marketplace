import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.db import create_engine
from app.core.errors import register_error_handlers
from app.core.security import TokenVerifier


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    docs = settings.docs_enabled

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        if app.state.engine is not None:
            await app.state.engine.dispose()

    app = FastAPI(
        title="Marketplace API",
        version="0.1.0",
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = create_engine(settings.database_url) if settings.database_url else None
    app.state.token_verifier = TokenVerifier(
        settings.jwks_url, settings.jwt_issuer, settings.jwt_audience
    )

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        # Always generated here; a client-supplied ID is not trusted for logs.
        request.state.request_id = uuid.uuid4().hex
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )

    register_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
