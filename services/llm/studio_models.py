"""Which OpenAI-compatible endpoint each studio use case calls.

Studio settings (its Model backends section) writes .studio/models.json (git-ignored): named
providers, a default, and per-use-case overrides. A provider records the *name* of
its key variable, never the key. Without the file, every service keeps its own .env
settings. Standard library only, so any service can import it.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

# The only environment variables a provider may name as its key.
KEY_NAMES = frozenset({"OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY"})


def registry_path() -> Path:
    default = Path(__file__).resolve().parents[2] / ".studio" / "models.json"
    return Path(os.getenv("STUDIO_MODELS_FILE") or default)


@dataclass(frozen=True)
class Backend:
    provider: str
    label: str
    kind: str  # "openai" or "vllm"
    base_url: str
    model: str
    api_key: str
    responses_api: bool

    @property
    def vllm(self) -> bool:
        return self.kind == "vllm"

    @property
    def signature(self) -> tuple:
        """Changes whenever a cached client or agent graph must be rebuilt."""
        return (self.provider, self.kind, self.base_url, self.model, self.responses_api, bool(self.api_key))

    def chat_kwargs(self) -> dict:
        """ChatOpenAI arguments every caller shares."""
        kwargs: dict = {"model": self.model, "base_url": self.base_url, "api_key": self.api_key or "not-needed"}
        if self.vllm:
            kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
        return kwargs

    def public(self) -> dict:
        return {"provider": self.provider, "label": self.label, "kind": self.kind,
                "base_url": self.base_url, "model": self.model, "key": "present" if self.api_key else "missing"}


def resolve(use_case: str) -> Backend | None:
    """The studio's choice for this use case, or None to keep the service's .env settings."""
    try:
        data = json.loads(registry_path().read_text(encoding="utf-8"))
        provider_id = (data.get("useCases") or {}).get(use_case) or data["default"]
        provider = data["providers"][provider_id]
        key_name = provider.get("apiKeyEnv") or ""
        key = os.getenv(key_name, "") if key_name in KEY_NAMES else ""
        return Backend(
            provider=provider_id,
            label=str(provider.get("label") or provider_id),
            kind="vllm" if provider.get("kind") == "vllm" else "openai",
            base_url=str(provider["baseUrl"]).rstrip("/"),
            model=str(provider["model"]),
            api_key=key,
            responses_api=bool(provider.get("responsesApi")),
        )
    except FileNotFoundError:
        return None
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
