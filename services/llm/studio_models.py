"""Which OpenAI-compatible endpoint each studio use case calls, with ordered failover.

Studio settings (its Model backends section) writes .studio/models.json (git-ignored):
named providers, a default chain, and per-use-case chains. A provider records the
*name* of its key variable, never the key. Without the file, the committed
config/studio-models.default.json applies, so the settings page and the services
agree: Sparky vLLM when .env names its URL, then OpenAI with the .env key.

pick(use_case) returns the first healthy backend of the chain. Health is
GET {baseUrl}/models with that provider's key: 1.5 s timeout, cached 15 s, and
skipped for 30 s after a failure. Every response a service returns carries
Selection.served_by() so the studio can show which model answered.

Standard library only, so any service can import it.
"""
from __future__ import annotations

import asyncio
import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, Awaitable, Callable, TypeVar

# The only environment variables a provider may name as its key.
KEY_NAMES = frozenset({"OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY"})
POLICIES = ("allow", "require_ai_defense", "deny")
# Use cases that send client data to the model. A hosted model needs AI Defense enforce.
CLIENT_DATA_POLICY = {"client-advisory": "require_ai_defense"}

PROBE_TIMEOUT = 1.5
HEALTHY_TTL = 15.0
CIRCUIT_OPEN = 30.0

ROOT = Path(__file__).resolve().parents[2]


def registry_path() -> Path:
    return Path(os.getenv("STUDIO_MODELS_FILE") or ROOT / ".studio" / "models.json")


def defaults_path() -> Path:
    return Path(os.getenv("STUDIO_MODELS_DEFAULT_FILE") or ROOT / "config" / "studio-models.default.json")


@dataclass(frozen=True)
class Backend:
    provider: str
    label: str
    kind: str  # "openai" or "vllm"
    base_url: str
    model: str
    api_key: str
    responses_api: bool
    private: bool = False
    key_name: str = ""

    @property
    def vllm(self) -> bool:
        return self.kind == "vllm"

    @property
    def external(self) -> bool:
        """Data sent here leaves infrastructure the bank controls."""
        return not self.private

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
        return {"provider": self.provider, "label": self.label, "kind": self.kind, "private": self.private,
                "base_url": self.base_url, "model": self.model, "key": "present" if self.api_key else "missing"}


@dataclass(frozen=True)
class Selection:
    """The backend that will answer, and why it was chosen."""
    backend: Backend
    use_case: str
    fallback: bool = False
    reason: str = ""
    source: str = "saved"  # "saved" (Studio settings) or "default" (config/studio-models.default.json)
    skipped: tuple = field(default_factory=tuple)  # ({"provider", "label", "reason"}, ...)

    def served_by(self) -> dict:
        backend = self.backend
        return {
            "provider": backend.provider, "label": backend.label, "model": backend.model, "kind": backend.kind,
            "private": backend.private, "external": backend.external, "fallback": self.fallback,
            "reason": self.reason, "source": self.source,
        }


class ChainUnavailable(Exception):
    """No backend in the use case's chain is configured and reachable."""

    def __init__(self, use_case: str, skipped: list[dict]):
        self.use_case = use_case
        self.skipped = skipped
        reasons = "; ".join(f"{item['label']}: {item['reason']}" for item in skipped) or "no providers"
        super().__init__(f"No model backend is reachable for {use_case} ({reasons}).")

    def served_by(self) -> dict:
        return {"provider": None, "label": "No model reachable", "model": None, "fallback": False,
                "reason": str(self), "skipped": self.skipped}


# ------------------------------------------------------------------ registry ----

def _read(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _first_env(names: Any) -> str:
    for name in names if isinstance(names, list) else [names] if isinstance(names, str) else []:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _apply_env(data: dict) -> tuple[dict, dict[str, str]]:
    """Defaults only: provider fields from .env, and providers .env does not configure."""
    providers = {pid: dict(value) for pid, value in (data.get("providers") or {}).items() if isinstance(value, dict)}
    unconfigured: dict[str, str] = {}
    for pid, spec in (data.get("env") or {}).items():
        if pid not in providers or not isinstance(spec, dict):
            continue
        for field_name in ("baseUrl", "model"):
            value = _first_env(spec.get(field_name))
            if value:
                providers[pid][field_name] = value
        required = spec.get("requires")
        if required and not _first_env(spec.get(required)):
            names = spec.get(required)
            first = names[0] if isinstance(names, list) and names else str(names)
            unconfigured[pid] = f"not configured in .env ({first})"
    return {**data, "providers": providers}, unconfigured


def normalize(data: dict) -> dict:
    """v1 or v2 into {"chain", "useCases": {id: {"chain", "externalPolicy"}}, "providers"}."""
    providers = {pid: value for pid, value in (data.get("providers") or {}).items() if isinstance(value, dict)}
    chain = data.get("chain")
    if not isinstance(chain, list):
        chain = [data["default"]] if isinstance(data.get("default"), str) else []
    chain = [pid for pid in chain if isinstance(pid, str) and pid in providers]
    use_cases: dict[str, dict] = {}
    for use_case, route in (data.get("useCases") or {}).items():
        if isinstance(route, str):
            route = {"chain": [route]}
        elif isinstance(route, list):
            route = {"chain": route}
        if not isinstance(route, dict):
            continue
        entry: dict = {}
        if isinstance(route.get("chain"), list):
            entry["chain"] = [pid for pid in route["chain"] if isinstance(pid, str) and pid in providers]
        if route.get("externalPolicy") in POLICIES:
            entry["externalPolicy"] = route["externalPolicy"]
        use_cases[use_case] = entry
    return {"chain": chain, "useCases": use_cases, "providers": providers}


def load() -> tuple[dict, str, dict[str, str]]:
    """The effective registry, where it came from, and providers .env leaves unconfigured."""
    saved = _read(registry_path())
    if saved is not None:
        normalized = normalize(saved)
        if normalized["chain"] and normalized["providers"]:
            return normalized, "saved", {}
    defaults = _read(defaults_path()) or {}
    with_env, unconfigured = _apply_env(defaults)
    return normalize(with_env), "default", unconfigured


def _backend(provider_id: str, provider: dict) -> Backend:
    key_name = str(provider.get("apiKeyEnv") or "")
    kind = "vllm" if provider.get("kind") == "vllm" else "openai"
    private = provider.get("private")
    return Backend(
        provider=provider_id,
        label=str(provider.get("label") or provider_id),
        kind=kind,
        base_url=str(provider["baseUrl"]).rstrip("/"),
        model=str(provider["model"]),
        api_key=os.getenv(key_name, "") if key_name in KEY_NAMES else "",
        responses_api=bool(provider.get("responsesApi")),
        private=bool(private) if isinstance(private, bool) else kind == "vllm",
        key_name=key_name if key_name in KEY_NAMES else "",
    )


def chain_ids(registry: dict, use_case: str) -> list[str]:
    route = registry["useCases"].get(use_case) or {}
    return route.get("chain") or registry["chain"]


def external_policy(use_case: str, registry: dict | None = None) -> str:
    registry = registry or load()[0]
    route = registry["useCases"].get(use_case) or {}
    policy = route.get("externalPolicy") or CLIENT_DATA_POLICY.get(use_case, "allow")
    # Client data never goes to a hosted model uninspected, whatever the saved file says.
    if use_case in CLIENT_DATA_POLICY and policy == "allow":
        return CLIENT_DATA_POLICY[use_case]
    return policy


def resolve_chain(use_case: str) -> list[Backend]:
    registry, _, unconfigured = load()
    backends = []
    for pid in chain_ids(registry, use_case):
        if pid in unconfigured:
            continue
        try:
            backends.append(_backend(pid, registry["providers"][pid]))
        except (KeyError, TypeError, ValueError):
            continue
    return backends


# -------------------------------------------------------------------- health ----

_health: dict[tuple, tuple[float, bool, str]] = {}
_lock = threading.Lock()


def _tls_context() -> ssl.SSLContext:
    """The OS trust store when truststore is installed (a TLS-inspecting proxy's root lives there)."""
    try:
        import truststore
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        return ssl.create_default_context()


def _probe(backend: Backend) -> tuple[bool, str]:
    headers = {"Authorization": f"Bearer {backend.api_key}"} if backend.api_key else {}
    request = urllib.request.Request(f"{backend.base_url}/models", headers=headers, method="GET")
    context = _tls_context() if backend.base_url.startswith("https:") else None
    try:
        with urllib.request.urlopen(request, timeout=PROBE_TIMEOUT, context=context) as response:  # noqa: S310 - studio-configured URL
            return (200 <= response.status < 300), f"answered {response.status}"
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return False, "rejected the key"
        return False, f"answered {exc.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        text = str(reason).lower()
        if "refused" in text:
            return False, "unreachable (connection refused)"
        if "timed out" in text or isinstance(reason, TimeoutError):
            return False, "unreachable (timed out)"
        return False, "unreachable"


def healthy(backend: Backend) -> tuple[bool, str]:
    """Cached probe: healthy answers live 15 s; a failure is not re-probed for 30 s."""
    key = (backend.provider, backend.base_url, bool(backend.api_key))
    now = time.monotonic()
    with _lock:
        cached = _health.get(key)
    if cached:
        at, ok, reason = cached
        if (ok and now - at < HEALTHY_TTL) or (not ok and now - at < CIRCUIT_OPEN):
            return ok, reason
    ok, reason = _probe(backend)
    with _lock:
        _health[key] = (time.monotonic(), ok, reason)
    return ok, reason


def mark_down(backend: Backend, reason: str = "failed during the call") -> None:
    with _lock:
        _health[(backend.provider, backend.base_url, bool(backend.api_key))] = (time.monotonic(), False, reason)


def reset_health() -> None:
    with _lock:
        _health.clear()


# --------------------------------------------------------------------- pick ----

def resolve(use_case: str) -> Backend | None:
    """The first configured backend, without a health probe (descriptions and signatures)."""
    for backend in resolve_chain(use_case):
        if backend.kind != "openai" or backend.api_key:
            return backend
    return None


def pick(use_case: str, *, exclude: tuple[str, ...] = ()) -> Selection:
    """The first healthy backend in the chain. Raises ChainUnavailable when none is."""
    registry, source, unconfigured = load()
    skipped: list[dict] = []
    for pid in chain_ids(registry, use_case):
        provider = registry["providers"].get(pid) or {}
        label = str(provider.get("label") or pid)
        if pid in unconfigured:
            skipped.append({"provider": pid, "label": label, "reason": unconfigured[pid]})
            continue
        if pid in exclude:
            skipped.append({"provider": pid, "label": label, "reason": "failed during the call"})
            continue
        try:
            backend = _backend(pid, provider)
        except (KeyError, TypeError, ValueError):
            skipped.append({"provider": pid, "label": label, "reason": "incomplete provider settings"})
            continue
        if backend.kind == "openai" and not backend.api_key:
            skipped.append({"provider": pid, "label": label, "reason": f"{backend.key_name or 'its key'} is not set"})
            continue
        ok, reason = healthy(backend)
        if not ok:
            skipped.append({"provider": pid, "label": label, "reason": reason})
            continue
        # Providers .env never configured are not "down"; the next one is the primary.
        passed_over = [item for item in skipped if item["provider"] not in unconfigured]
        because = "; ".join(f"{item['label']} {item['reason']}" for item in passed_over)
        return Selection(backend=backend, use_case=use_case, fallback=bool(passed_over), reason=because,
                         source=source, skipped=tuple(skipped))
    raise ChainUnavailable(use_case, skipped)


async def apick(use_case: str, *, exclude: tuple[str, ...] = ()) -> Selection:
    return await asyncio.to_thread(pick, use_case, exclude=exclude)


# ------------------------------------------------------------------ failover ----

_RETRYABLE = {"ConnectError", "ConnectTimeout", "ReadTimeout", "WriteTimeout", "PoolTimeout", "TimeoutException",
              "RemoteProtocolError", "APIConnectionError", "APITimeoutError", "InternalServerError",
              "ServiceUnavailableError", "TimeoutError", "ConnectionRefusedError"}


def retryable(exc: BaseException) -> bool:
    """Connect errors, timeouts, and 5xx. Never 4xx, never an AI Defense verdict."""
    seen = 0
    current: BaseException | None = exc
    while current is not None and seen < 6:
        name = type(current).__name__
        if "Defense" in name:
            return False
        status = getattr(current, "status_code", None) or getattr(getattr(current, "response", None), "status_code", None)
        if isinstance(status, int):
            return status >= 500
        if name in _RETRYABLE:
            return True
        current = current.__cause__ or current.__context__
        seen += 1
    return False


T = TypeVar("T")


async def call_with_failover(use_case: str, call: Callable[[Backend], Awaitable[T]],
                             *, on_failover: Callable[[Selection, Selection, BaseException], Awaitable[None]] | None = None,
                             first: Selection | None = None) -> tuple[T, Selection]:
    """Runs call on the picked backend; on a retryable failure, once more on the next one."""
    selection = first or await apick(use_case)
    try:
        return await call(selection.backend), selection
    except Exception as exc:
        if not retryable(exc):
            raise
        mark_down(selection.backend)
        try:
            following = await apick(use_case, exclude=(selection.backend.provider,))
        except ChainUnavailable:
            raise exc from None
        following = replace(following, fallback=True,
                            reason=f"{selection.backend.label} failed during the call ({type(exc).__name__})")
        if on_failover:
            await on_failover(selection, following, exc)
        return await call(following.backend), following


# ------------------------------------------------------------- egress policy ----

def egress_decision(use_case: str, selection: Selection, ai_defense_configured: bool) -> dict:
    """Whether this use case may send its data to the selected backend.

    allowed: send it. force_enforce: AI Defense must run in enforce mode on this request,
    before the data leaves. reason: one sentence for the audience when refused.
    """
    if selection.backend.private:
        return {"allowed": True, "force_enforce": False, "policy": "private", "reason": ""}
    policy = external_policy(use_case)
    if policy == "deny":
        return {"allowed": False, "force_enforce": False, "policy": policy,
                "reason": f"Studio settings keep this use case on private models; {selection.backend.label} is hosted."}
    if policy == "require_ai_defense":
        if not ai_defense_configured:
            return {"allowed": False, "force_enforce": False, "policy": policy,
                    "reason": f"Client data would go to a hosted model ({selection.backend.label}) and Cisco AI Defense "
                              "is not configured to inspect it first, so the request was not sent."}
        return {"allowed": True, "force_enforce": True, "policy": policy, "reason": ""}
    return {"allowed": True, "force_enforce": False, "policy": policy, "reason": ""}
