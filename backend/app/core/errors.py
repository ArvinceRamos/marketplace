"""One error shape for every response: {"error": {"code", "message", "fields"}}."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError
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

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        fields: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields
        self.headers = headers


def error_body(code: str, message: str, fields: dict[str, str] | None = None) -> dict:
    return {"error": {"code": code, "message": message, "fields": fields}}


async def _app_error(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        error_body(exc.code, exc.message, exc.fields),
        status_code=exc.status_code,
        headers=exc.headers,
    )


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


def sqlstate(exc: DBAPIError) -> str | None:
    """Postgres error code (e.g. "23505") from a SQLAlchemy-wrapped driver error."""
    orig = exc.orig
    for source in (orig, getattr(orig, "__cause__", None)):
        code = getattr(source, "sqlstate", None) or getattr(source, "pgcode", None)
        if code:
            return str(code)
    return None


# Our own guard triggers raise check_violation (23514) with plain-language messages.
def _trigger_message(exc: DBAPIError) -> str | None:
    text = str(getattr(exc.orig, "__cause__", None) or exc.orig)
    if "violates" in text or "constraint" in text:
        return None  # a raw constraint name; do not expose
    first_line = (text.splitlines() or [""])[0]
    return first_line.split(": ", 1)[-1].strip() or None


def db_app_error(exc: DBAPIError) -> AppError | None:
    """Errors our database functions raise for users: SQLSTATE 'MKnnn' (nnn = HTTP
    status), MESSAGE = error code, HINT = plain-language text (TRANSACTIONS_DESIGN)."""
    code = sqlstate(exc)
    if not code or not code.startswith("MK") or not code[2:].isdigit():
        return None
    source = getattr(exc.orig, "__cause__", None) or exc.orig
    message = getattr(source, "message", None) or "error"
    hint = getattr(source, "hint", None) or "That can't be done right now."
    return AppError(int(code[2:]), message, hint)


async def _db_error(request: Request, exc: DBAPIError) -> JSONResponse:
    if (app_error := db_app_error(exc)) is not None:
        return await _app_error(request, app_error)
    code = sqlstate(exc)
    if code == "23505":
        return JSONResponse(error_body("already_exists", "That already exists."), status_code=409)
    if code == "23514":
        message = _trigger_message(exc) or "Some values are not allowed."
        return JSONResponse(error_body("not_allowed", message), status_code=409)
    if code == "23503":
        return JSONResponse(
            error_body("invalid_reference", "A referenced item does not exist."), status_code=422
        )
    if code == "42501":
        return JSONResponse(error_body("forbidden", "You can't do that."), status_code=403)
    if code in ("22P02", "22001", "22003"):
        return JSONResponse(error_body("invalid_value", "A value is invalid."), status_code=422)
    return await _unhandled_error(request, exc)


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
    app.add_exception_handler(DBAPIError, _db_error)
    app.add_exception_handler(Exception, _unhandled_error)
