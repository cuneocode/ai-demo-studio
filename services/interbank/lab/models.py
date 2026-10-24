"""The model chain Studio settings selects for this lab.

Same rules as services/llm/studio_models.py: the studio's .studio/models.json (mounted
read-only at STUDIO_MODELS_FILE) or, when nothing is saved, the committed defaults at
STUDIO_MODELS_DEFAULT_FILE with .env overrides that labctl passes in model.env. The first
backend in the chain that answers GET /models wins. Each provider names its key
variable; labctl passes only those variables to the agents. Without either file, the lab
uses MODEL_NAME, MODEL_BASE_URL, and MODEL_API_KEY from labctl.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

USE_CASE = "interbank-a2a"
KEY_NAMES = frozenset({"OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY"})
LOOPBACK = {"127.0.0.1", "localhost", "0.0.0.0"}
PROBE_TIMEOUT, HEALTHY_TTL, CIRCUIT_OPEN = 1.5, 15.0, 30.0


@dataclass(frozen=True)
class Backend:
    provider: str
    label: str
    kind: str
    base_url: str | None
    model: str
    api_key: str
    responses_api: bool
    private: bool = False

    @property
    def signature(self) -> tuple:
        return (self.provider, self.kind, self.base_url, self.model, self.responses_api, bool(self.api_key))

    def public(self) -> dict:
        return {"provider": self.provider, "label": self.label, "kind": self.kind, "base_url": self.base_url,
                "model": self.model, "private": self.private,
                "api": "Responses API" if self.responses_api else "Chat Completions"}


def container_url(url: str) -> str:
    """The studio's loopback addresses mean the host machine, not this container."""
    parts = urlsplit(url)
    if parts.hostname not in LOOPBACK:
        return url
    netloc = "host.docker.internal" + (f":{parts.port}" if parts.port else "")
    return urlunsplit(parts._replace(netloc=netloc))


def _from_env() -> Backend:
    return Backend(provider="lab", label="Lab settings", kind="openai",
                   base_url=os.getenv("MODEL_BASE_URL") or None, model=os.getenv("MODEL_NAME", ""),
                   api_key=os.getenv("MODEL_API_KEY", ""), responses_api=True)


def _read(path: str | None) -> dict | None:
    if not path:
        return None
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and isinstance(data.get("providers"), dict) else None


def _first_env(names) -> str:
    for name in names if isinstance(names, list) else []:
        value = os.getenv(str(name), "").strip()
        if value:
            return value
    return ""


def _chain_ids(data: dict) -> list[str]:
    route = (data.get("useCases") or {}).get(USE_CASE)
    if isinstance(route, str):
        return [route]
    if isinstance(route, list) and route:
        return [str(item) for item in route]
    if isinstance(route, dict) and isinstance(route.get("chain"), list) and route["chain"]:
        return [str(item) for item in route["chain"]]
    if isinstance(data.get("chain"), list) and data["chain"]:
        return [str(item) for item in data["chain"]]
    return [str(data["default"])] if data.get("default") else []


def chain() -> list[Backend]:
    """The configured backends for this lab, in order."""
    data = _read(os.getenv("STUDIO_MODELS_FILE"))
    unconfigured: set[str] = set()
    if data is None:
        data = _read(os.getenv("STUDIO_MODELS_DEFAULT_FILE"))
        if data is None:
            return [_from_env()]
        data = json.loads(json.dumps(data))
        for provider_id, spec in (data.get("env") or {}).items():
            provider = data["providers"].get(provider_id)
            if not isinstance(provider, dict) or not isinstance(spec, dict):
                continue
            base, model = _first_env(spec.get("baseUrl")), _first_env(spec.get("model"))
            if base:
                provider["baseUrl"] = base
            if model:
                provider["model"] = model
            required = spec.get("requires")
            if required and not _first_env(spec.get(required)):
                unconfigured.add(provider_id)
    backends = []
    for provider_id in _chain_ids(data):
        provider = data["providers"].get(provider_id)
        if provider_id in unconfigured or not isinstance(provider, dict):
            continue
        try:
            key_name = provider.get("apiKeyEnv") or ""
            kind = "vllm" if provider.get("kind") == "vllm" else "openai"
            backends.append(Backend(
                provider=provider_id,
                label=str(provider.get("label") or provider_id),
                kind=kind,
                base_url=container_url(str(provider["baseUrl"]).rstrip("/")),
                model=str(provider["model"]),
                api_key=os.getenv(key_name, "") if key_name in KEY_NAMES else "",
                responses_api=bool(provider.get("responsesApi")),
                private=bool(provider.get("private", kind == "vllm")),
            ))
        except (KeyError, TypeError, ValueError):
            continue
    return backends or [_from_env()]


_lock = threading.Lock()
_health: dict[tuple, tuple[float, bool]] = {}


def _healthy(backend: Backend) -> bool:
    if not backend.base_url:
        return True
    key = backend.signature
    now = time.monotonic()
    with _lock:
        cached = _health.get(key)
    if cached and now - cached[0] < (HEALTHY_TTL if cached[1] else CIRCUIT_OPEN):
        return cached[1]
    request = urllib.request.Request(f"{backend.base_url}/models")
    if backend.api_key:
        request.add_header("Authorization", f"Bearer {backend.api_key}")
    try:
        with urllib.request.urlopen(request, timeout=PROBE_TIMEOUT) as response:  # noqa: S310 - studio-configured URL
            ok = 200 <= response.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        ok = False
    with _lock:
        _health[key] = (time.monotonic(), ok)
    return ok


def select(keyless: bool = False) -> tuple[Backend, dict]:
    """The first backend that answers, and the served-by record for the timeline.

    keyless: for the operations console, which holds no model keys; hosted providers
    count as available and only private endpoints are probed.
    """
    backends = chain()
    data = _read(os.getenv("STUDIO_MODELS_FILE")) or _read(os.getenv("STUDIO_MODELS_DEFAULT_FILE")) or {}
    route = (data.get("useCases") or {}).get(USE_CASE) or {}
    policy = route.get("externalPolicy", "allow") if isinstance(route, dict) else "allow"
    if policy in {"deny", "require_ai_defense"}:
        # Gateway inspection covers A2A traffic. This lab has no model-hop inspector.
        backends = [backend for backend in backends if backend.private]
        if not backends:
            raise ValueError("The Studio egress policy requires a private model for Interbank.")
    skipped = []
    for backend in backends:
        if keyless and not backend.private:
            return backend, {**backend.public(), "fallback": bool(skipped), "reason": "; ".join(skipped)}
        if backend.kind == "openai" and backend.provider != "lab" and not backend.api_key:
            skipped.append(f"{backend.label} has no key")
            continue
        if _healthy(backend):
            return backend, {**backend.public(), "fallback": bool(skipped), "reason": "; ".join(skipped)}
        skipped.append(f"{backend.label} is unreachable")
    first = backends[0]
    return first, {**first.public(), "fallback": False, "reason": "no backend answered: " + "; ".join(skipped)}


def backend() -> Backend:
    return select()[0]
