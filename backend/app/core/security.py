"""Verify Supabase access tokens (JWTs) with the project's public keys.

The user ID used anywhere in the API comes only from a token verified here.
"""

import uuid
from typing import Annotated, Any

import jwt
from fastapi import Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import AppError

Claims = dict[str, Any]

# Asymmetric only. HS256 (shared secret) tokens are rejected.
ALLOWED_ALGORITHMS = ("ES256", "RS256")

_INVALID = AppError(401, "not_authenticated", "Your session is invalid or expired. Sign in again.")


class TokenVerifier:
    def __init__(self, jwks_url: str, issuer: str, audience: str) -> None:
        self.issuer = issuer
        self.audience = audience
        # Keys are cached for 10 minutes, matching Supabase's JWKS edge cache.
        self._jwks = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=600, timeout=5)

    def _signing_key(self, token: str) -> Any:
        return self._jwks.get_signing_key_from_jwt(token).key

    def verify(self, token: str) -> Claims:
        try:
            alg = jwt.get_unverified_header(token).get("alg")
            if alg not in ALLOWED_ALGORITHMS:
                raise _INVALID
            claims = jwt.decode(
                token,
                self._signing_key(token),
                algorithms=[alg],
                audience=self.audience,
                issuer=self.issuer,
                options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            )
        except jwt.PyJWKClientConnectionError as exc:
            raise AppError(
                503, "auth_unavailable", "Sign-in check is unavailable. Try again."
            ) from exc
        except jwt.PyJWTError as exc:
            raise _INVALID from exc

        if claims.get("role") != "authenticated":
            raise _INVALID
        try:
            uuid.UUID(str(claims["sub"]))
        except ValueError as exc:
            raise _INVALID from exc
        return claims


_bearer = HTTPBearer(auto_error=False)


async def optional_claims(
    request: Request,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Claims | None:
    """Claims for a signed-in caller, or None for a guest. Bad tokens are rejected, not ignored."""
    if creds is None:
        if request.headers.get("authorization"):
            raise _INVALID  # present but not "Bearer <token>"
        return None
    verifier: TokenVerifier = request.app.state.token_verifier
    return await run_in_threadpool(verifier.verify, creds.credentials)


async def require_claims(claims: Annotated[Claims | None, Depends(optional_claims)]) -> Claims:
    if claims is None:
        raise AppError(401, "not_authenticated", "Sign in to continue.")
    return claims


def user_id(claims: Claims) -> uuid.UUID:
    return uuid.UUID(str(claims["sub"]))
