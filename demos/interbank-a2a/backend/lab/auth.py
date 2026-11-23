from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import jwt


class AuthenticationError(Exception):
    pass


def verify_gateway_token(
    authorization: str | None, *, jwks_file: str, issuer: str, audience: str
) -> dict[str, Any]:
    """Verify the ES256 token this bank's gateway signs on every forwarded request."""
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationError("missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        kid = jwt.get_unverified_header(token).get("kid")
        keys = json.loads(Path(jwks_file).read_text(encoding="utf-8"))["keys"]
        match = [k for k in keys if k.get("kid") == kid]
        if len(match) != 1:
            raise AuthenticationError("unknown signing key")
        return jwt.decode(
            token,
            key=jwt.PyJWK.from_dict(match[0]).key,
            algorithms=["ES256"],
            issuer=issuer,
            audience=audience,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=2,
        )
    except AuthenticationError:
        raise
    except Exception as exc:
        raise AuthenticationError("invalid bearer token") from exc
