from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any
from urllib.parse import urlsplit

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPABASE_JWT_ALGORITHMS = ("ES256", "RS256")


class AuthSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_jwt_issuer: str
    supabase_jwks_timeout_seconds: float = Field(default=5, gt=0, le=30)

    @field_validator("supabase_jwt_issuer")
    @classmethod
    def validate_issuer(cls, value: str) -> str:
        issuer = value.rstrip("/")
        parsed = urlsplit(issuer)
        is_loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}

        if (
            not parsed.hostname
            or (
                parsed.scheme != "https"
                and not (parsed.scheme == "http" and is_loopback)
            )
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "SUPABASE_JWT_ISSUER must be an HTTPS URL, or an HTTP loopback "
                "URL for local development, without credentials, query parameters, "
                "or fragments."
            )

        return issuer

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_jwt_issuer}/.well-known/jwks.json"


@dataclass(frozen=True)
class AuthenticatedUser:
    subject: str
    claims: dict[str, Any]


class InvalidAccessTokenError(Exception):
    pass


class SupabaseJwtVerifier:
    def __init__(self, issuer: str, jwks_url: str, timeout_seconds: float = 5) -> None:
        self.issuer = issuer
        self.jwks_client = PyJWKClient(
            jwks_url,
            cache_keys=True,
            timeout=timeout_seconds,
        )

    def verify(self, token: str) -> AuthenticatedUser:
        try:
            signing_key = self.jwks_client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key=signing_key,
                algorithms=list(SUPABASE_JWT_ALGORITHMS),
                audience="authenticated",
                issuer=self.issuer,
                options={
                    "require": ["iss", "aud", "exp", "role", "sub"],
                },
            )
            subject = claims.get("sub")

            if (
                not isinstance(subject, str)
                or not subject.strip()
                or claims.get("role") != "authenticated"
            ):
                raise InvalidAccessTokenError

            return AuthenticatedUser(subject=subject, claims=claims)
        except InvalidAccessTokenError:
            raise
        except (PyJWTError, ValueError) as error:
            raise InvalidAccessTokenError from error


@lru_cache
def get_jwt_verifier() -> SupabaseJwtVerifier:
    settings = AuthSettings()
    return SupabaseJwtVerifier(
        settings.supabase_jwt_issuer,
        settings.jwks_url,
        settings.supabase_jwks_timeout_seconds,
    )


bearer_scheme = HTTPBearer(auto_error=False)


def require_authenticated_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid bearer token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return get_jwt_verifier().verify(credentials.credentials)
    except InvalidAccessTokenError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid bearer token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error
