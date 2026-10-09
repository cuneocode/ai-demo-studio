import asyncio
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import studio_models as sm  # noqa: E402


class _Models(BaseHTTPRequestHandler):
    seen: list = []

    def do_GET(self):  # noqa: N802
        type(self).seen.append(self.headers.get("Authorization"))
        body = json.dumps({"data": [{"id": "m"}]}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture()
def live_server():
    _Models.seen = []
    server = HTTPServer(("127.0.0.1", 0), _Models)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}/v1"
    server.shutdown()


def closed_port() -> str:
    server = HTTPServer(("127.0.0.1", 0), _Models)
    port = server.server_port
    server.server_close()
    return f"http://127.0.0.1:{port}/v1"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    for name in ("OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY", "SPARKY_VLLM_BASE_URL",
                 "NIM_BASE_URL", "SPARKY_VLLM_MODEL", "NIM_MODEL", "MODEL_NAME"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(tmp_path / "models.json"))
    sm.reset_health()
    yield tmp_path
    sm.reset_health()


def write(tmp_path, data):
    (tmp_path / "models.json").write_text(json.dumps(data))


def provider(url, kind="vllm", key="", private=None, label=None):
    value = {"label": label or kind, "kind": kind, "baseUrl": url, "model": "m", "apiKeyEnv": key, "responsesApi": False}
    if private is not None:
        value["private"] = private
    return value


def test_v1_file_resolves_as_before(isolated, live_server):
    write(isolated, {"version": 1, "default": "a", "useCases": {"market-research": "b"},
                     "providers": {"a": provider(live_server, label="A"), "b": provider(live_server, label="B")}})
    assert sm.pick("company-briefing").backend.provider == "a"
    assert sm.pick("market-research").backend.provider == "b"
    assert sm.resolve("market-research").label == "B"


def test_v2_chain_fails_over_to_the_second_backend(isolated, live_server):
    write(isolated, {"version": 2, "chain": ["down", "up"],
                     "providers": {"down": provider(closed_port(), label="Sparky"), "up": provider(live_server, label="Up")}})
    selection = sm.pick("market-research")
    assert selection.backend.provider == "up"
    assert selection.fallback is True
    assert "Sparky unreachable" in selection.reason
    assert selection.served_by()["fallback"] is True


def test_circuit_stays_open_after_a_failure(isolated, live_server, monkeypatch):
    write(isolated, {"version": 2, "chain": ["down", "up"],
                     "providers": {"down": provider(closed_port()), "up": provider(live_server)}})
    calls = []
    real = sm._probe
    monkeypatch.setattr(sm, "_probe", lambda backend: calls.append(backend.provider) or real(backend))
    sm.pick("market-research")
    sm.pick("market-research")
    sm.pick("market-research")
    assert calls.count("down") == 1
    assert calls.count("up") == 1


def test_a_key_goes_only_to_the_provider_that_names_it(isolated, live_server, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-openai")
    monkeypatch.setenv("VLLM_API_KEY", "vllm-test")
    write(isolated, {"version": 2, "chain": ["local"], "providers": {"local": provider(live_server, key="VLLM_API_KEY")}})
    sm.pick("market-research")
    assert _Models.seen == ["Bearer vllm-test"]
    write(isolated, {"version": 2, "chain": ["anon"], "providers": {"anon": provider(live_server, key="")}})
    sm.reset_health()
    sm.pick("market-research")
    assert _Models.seen[-1] is None


def test_missing_file_uses_the_committed_defaults(isolated, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("MODEL_NAME", "gpt-test")
    registry, source, unconfigured = sm.load()
    assert source == "default"
    assert registry["chain"] == ["sparky-vllm", "openai"]
    assert "sparky-vllm" in unconfigured  # no SPARKY_VLLM_BASE_URL in .env
    chain = sm.resolve_chain("market-research")
    assert [b.provider for b in chain] == ["openai"]
    assert chain[0].model == "gpt-test"
    assert sm.external_policy("client-advisory") == "require_ai_defense"


def test_defaults_put_sparky_first_when_env_names_it(isolated, live_server, monkeypatch):
    monkeypatch.setenv("SPARKY_VLLM_BASE_URL", live_server)
    chain = sm.resolve_chain("client-advisory")
    assert [b.provider for b in chain] == ["sparky-vllm", "openai"]
    assert chain[0].private and chain[0].base_url == live_server
    selection = sm.pick("client-advisory")
    assert selection.backend.provider == "sparky-vllm" and not selection.fallback


def test_unconfigured_sparky_is_not_reported_as_a_fallback(isolated, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(sm, "_probe", lambda backend: (True, "answered 200"))
    selection = sm.pick("market-research")
    assert selection.backend.provider == "openai"
    assert selection.fallback is False
    assert selection.source == "default"


def test_openai_without_a_key_is_skipped_and_chain_can_be_unavailable(isolated):
    write(isolated, {"version": 2, "chain": ["openai"],
                     "providers": {"openai": provider("https://api.openai.com/v1", kind="openai", key="OPENAI_API_KEY")}})
    with pytest.raises(sm.ChainUnavailable) as raised:
        sm.pick("company-briefing")
    assert "OPENAI_API_KEY is not set" in str(raised.value)


def test_client_data_policy_cannot_be_loosened(isolated, live_server):
    write(isolated, {"version": 2, "chain": ["up"], "useCases": {"client-advisory": {"externalPolicy": "allow"}},
                     "providers": {"up": provider(live_server, kind="openai", private=False)}})
    assert sm.external_policy("client-advisory") == "require_ai_defense"
    assert sm.external_policy("sar-support") == "require_ai_defense"
    assert sm.external_policy("market-research") == "allow"


def test_egress_decision_refuses_hosted_client_data_without_ai_defense(isolated, live_server):
    write(isolated, {"version": 2, "chain": ["hosted"], "providers": {"hosted": provider(live_server, private=False, label="Hosted")}})
    selection = sm.pick("client-advisory")
    refused = sm.egress_decision("client-advisory", selection, ai_defense_configured=False)
    assert refused["allowed"] is False and "AI Defense" in refused["reason"]
    forced = sm.egress_decision("client-advisory", selection, ai_defense_configured=True)
    assert forced == {"allowed": True, "force_enforce": True, "policy": "require_ai_defense", "reason": ""}
    assert sm.egress_decision("market-research", selection, ai_defense_configured=False)["allowed"] is True


def test_private_backend_needs_no_inspection(isolated, live_server):
    write(isolated, {"version": 2, "chain": ["sparky"], "providers": {"sparky": provider(live_server)}})
    selection = sm.pick("client-advisory")
    assert sm.egress_decision("client-advisory", selection, ai_defense_configured=False)["allowed"] is True


def test_call_with_failover_retries_once_on_connect_errors(isolated, live_server):
    write(isolated, {"version": 2, "chain": ["a", "b"],
                     "providers": {"a": provider(live_server, label="A"), "b": provider(live_server, label="B")}})
    attempts = []

    class ConnectError(Exception):
        pass

    async def call(backend):
        attempts.append(backend.provider)
        if backend.provider == "a":
            raise ConnectError("refused")
        return "ok"

    result, selection = asyncio.run(sm.call_with_failover("market-research", call))
    assert result == "ok" and attempts == ["a", "b"]
    assert selection.fallback and "A failed during the call" in selection.reason


def test_call_with_failover_never_retries_4xx_or_defense(isolated, live_server):
    write(isolated, {"version": 2, "chain": ["a", "b"], "providers": {"a": provider(live_server), "b": provider(live_server)}})

    class BadRequest(Exception):
        status_code = 400

    class DefenseBlocked(Exception):
        pass

    for error in (BadRequest(), DefenseBlocked()):
        async def call(backend, error=error):
            raise error

        with pytest.raises(type(error)):
            asyncio.run(sm.call_with_failover("market-research", call))
