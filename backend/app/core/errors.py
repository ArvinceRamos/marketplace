"""One error shape for every response: {"error": {"code", "message", "fields"}}."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")

_STATUS_CODES = {
    400: "bad_request",
    401: "not_authenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    429: "rate_limited",
}


class AppError(Exception):
    """Raise from services to return a specific status and error code."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def error_body(code: str, message: str, fields: dict[str, str] | None = None) -> dict:
    return {"error": {"code": code, "message": message, "fields": fields}}


async def _app_error(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status_code)


async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _STATUS_CODES.get(exc.status_code, "error")
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return JSONResponse(error_body(code, message), status_code=exc.status_code, headers=exc.headers)


async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields: dict[str, str] = {}
    for err in exc.errors():
        # Drop the "body"/"query" prefix so the frontend sees plain field names.
        loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
        fields[".".join(loc) or "_"] = err.get("msg", "Invalid value.")
    return JSONResponse(
        error_body("validation_error", "Some fields are invalid.", fields), status_code=422
    )


async def _unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    # Details go to the log only, never to the client.
    logger.exception("Unhandled error (request_id=%s)", getattr(request.state, "request_id", "-"))
    return JSONResponse(
        error_body("internal_error", "Something went wrong. Please try again."), status_code=500
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled_error)
