"""The model endpoint the studio's Model backends page selects for this lab.

Same file format as services/llm/studio_models.py, read from the studio's
.studio/models.json mounted read-only at STUDIO_MODELS_FILE. The file names each
provider's key variable; labctl passes only those variables to the agents. Without
the file, the lab uses MODEL_NAME, MODEL_BASE_URL, and MODEL_API_KEY from labctl.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

USE_CASE = "interbank-a2a"
KEY_NAMES = frozenset({"OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY"})
LOOPBACK = {"127.0.0.1", "localhost", "0.0.0.0"}


@dataclass(frozen=True)
class Backend:
    provider: str
    label: str
    kind: str
    base_url: str | None
    model: str
    api_key: str
    responses_api: bool

    @property
    def signature(self) -> tuple:
        return (self.provider, self.kind, self.base_url, self.model, self.responses_api, bool(self.api_key))

    def public(self) -> dict:
        return {"provider": self.provider, "label": self.label, "kind": self.kind, "base_url": self.base_url,
                "model": self.model, "api": "Responses API" if self.responses_api else "Chat Completions"}


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


def backend() -> Backend:
    path = os.getenv("STUDIO_MODELS_FILE")
    if not path:
        return _from_env()
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        provider_id = (data.get("useCases") or {}).get(USE_CASE) or data["default"]
        provider = data["providers"][provider_id]
        key_name = provider.get("apiKeyEnv") or ""
        return Backend(
            provider=provider_id,
            label=str(provider.get("label") or provider_id),
            kind="vllm" if provider.get("kind") == "vllm" else "openai",
            base_url=container_url(str(provider["baseUrl"]).rstrip("/")),
            model=str(provider["model"]),
            api_key=os.getenv(key_name, "") if key_name in KEY_NAMES else "",
            responses_api=bool(provider.get("responsesApi")),
        )
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return _from_env()
