"""Request body size limits, enforced before and while the body streams in.

Without this, the multipart parser would accept any upload size and spool it to
disk before our per-file checks run.
- A Content-Length over the limit gets a 413 right away; the body is never read.
- The bytes actually received are counted too (a client can lie about, or omit,
  the header). Going over stops the read; that case surfaces as a 400.
"""

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_body
from app.services.images import MAX_UPLOAD_BYTES

JSON_LIMIT = 64 * 1024
# Up to 8 photos in one request, plus room for multipart headers.
MULTIPART_LIMIT = 8 * MAX_UPLOAD_BYTES + 256 * 1024


_MESSAGE = "The upload is too large."


def _too_large() -> HTTPException:
    return HTTPException(413, _MESSAGE)


class BodySizeLimit:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])
        content_type = headers.get(b"content-type", b"").decode("latin-1").lower()
        limit = MULTIPART_LIMIT if content_type.startswith("multipart/") else JSON_LIMIT
        declared = headers.get(b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > limit):
            response = JSONResponse(error_body("payload_too_large", _MESSAGE), status_code=413)
            await response(scope, receive, send)
            return
        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _too_large()
            return message

        await self.app(scope, limited_receive, send)
