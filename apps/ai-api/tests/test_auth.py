import json
import threading
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.auth import SupabaseJwtVerifier
from app.main import app

SUBJECT = "00000000-0000-4000-8000-000000000001"
KEY_ID = "test-signing-key"


@pytest.fixture(scope="module")
def signing_keys() -> tuple[Any, Any, dict[str, Any]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    invalid_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = json.loads(
        jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key())
    )
    public_jwk.update({"alg": "RS256", "kid": KEY_ID, "use": "sig"})

    return private_key, invalid_private_key, public_jwk


@pytest.fixture(scope="module")
def jwks_server(signing_keys: tuple[Any, Any, dict[str, Any]]) -> Iterator[str]:
    _, _, public_jwk = signing_keys
    response_body = json.dumps({"keys": [public_jwk]}).encode()

    class JwksHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path != "/auth/v1/.well-known/jwks.json":
                self.send_error(404)
                return

            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)

        def log_message(self, _format: str, *args: object) -> None:
            del args

    server = ThreadingHTTPServer(("127.0.0.1", 0), JwksHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address

    try:
        yield f"http://{host}:{port}/auth/v1"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.fixture
def client(jwks_server: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    verifier = SupabaseJwtVerifier(jwks_server, f"{jwks_server}/.well-known/jwks.json")
    monkeypatch.setattr(auth, "get_jwt_verifier", lambda: verifier)

    with TestClient(app) as test_client:
        yield test_client


def create_token(
    signing_keys: tuple[Any, Any, dict[str, Any]],
    jwks_server: str,
    *,
    audience: str | None = "authenticated",
    expires_at: datetime | None = None,
    issuer: str | None = None,
    role: str | None = "authenticated",
    signing_key: Any | None = None,
    subject: str | None = SUBJECT,
) -> str:
    private_key, _, _ = signing_keys
    claims: dict[str, Any] = {
        "iss": issuer or jwks_server,
        "exp": expires_at or datetime.now(UTC) + timedelta(minutes=5),
    }

    if audience is not None:
        claims["aud"] = audience
    if role is not None:
        claims["role"] = role
    if subject is not None:
        claims["sub"] = subject

    return jwt.encode(
        claims,
        signing_key or private_key,
        algorithm="RS256",
        headers={"kid": KEY_ID},
    )


def test_accepts_a_valid_signed_token(
    client: TestClient,
    signing_keys: tuple[Any, Any, dict[str, Any]],
    jwks_server: str,
) -> None:
    token = create_token(signing_keys, jwks_server)

    response = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json() == {"user": {"id": SUBJECT}}


@pytest.mark.parametrize(
    "authorization",
    [None, "Basic credentials", "Bearer", "Bearer first second", "Bearer not-a-jwt"],
)
def test_rejects_missing_or_malformed_authorization(
    client: TestClient, authorization: str | None
) -> None:
    headers = {} if authorization is None else {"Authorization": authorization}

    response = client.get("/api/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "token_kind",
    [
        "expired",
        "wrong-issuer",
        "wrong-audience",
        "missing-audience",
        "wrong-role",
        "missing-role",
        "missing-subject",
        "invalid-signature",
    ],
)
def test_rejects_invalid_tokens(
    client: TestClient,
    signing_keys: tuple[Any, Any, dict[str, Any]],
    jwks_server: str,
    token_kind: str,
) -> None:
    _, invalid_private_key, _ = signing_keys
    token_options: dict[str, Any] = {}

    if token_kind == "expired":
        token_options["expires_at"] = datetime.now(UTC) - timedelta(minutes=1)
    elif token_kind == "wrong-issuer":
        token_options["issuer"] = "https://attacker.example/auth/v1"
    elif token_kind == "wrong-audience":
        token_options["audience"] = "anon"
    elif token_kind == "missing-audience":
        token_options["audience"] = None
    elif token_kind == "wrong-role":
        token_options["role"] = "service_role"
    elif token_kind == "missing-role":
        token_options["role"] = None
    elif token_kind == "missing-subject":
        token_options["subject"] = None
    else:
        token_options["signing_key"] = invalid_private_key

    token = create_token(signing_keys, jwks_server, **token_options)
    response = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
