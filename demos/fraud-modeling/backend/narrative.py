"""Optional LLM explanation. Never required for a score to be released."""
import asyncio
import os
import time

import httpx

from model_backend import USE_CASE, call_with_failover, pick_narrative, resolve_narrative
from runlog import emit_current, emit_model_call
from security import DefenseBlocked, DefenseUnavailable, defense, security_run, SecurityRun


def _timeout():
    try:
        return max(5.0, float(os.getenv("FRAUD_NARRATIVE_TIMEOUT", "90")))
    except ValueError:
        return 90.0


def _local_base(base: str) -> bool:
    host = base.lower()
    return "127.0.0.1" in host or "localhost" in host


def narrative_config():
    enabled = os.getenv("FRAUD_ENABLE_NARRATIVE", "false").lower() == "true"
    backend = resolve_narrative()
    if backend is not None:
        key, base, model = backend.api_key, backend.base_url, backend.model
    else:
        key = os.getenv("FRAUD_NARRATIVE_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("NVIDIA_API_KEY") or ""
        base = os.getenv("FRAUD_NARRATIVE_BASE_URL") or os.getenv("OPENAI_BASE_URL") or ""
        model = os.getenv("FRAUD_NARRATIVE_MODEL") or os.getenv("MODEL_NAME") or ""
        if not base and os.getenv("NVIDIA_API_KEY") and not os.getenv("OPENAI_API_KEY"):
            base = "https://integrate.api.nvidia.com/v1"
            model = model or "meta/llama-3.1-8b-instruct"
    base = base.rstrip("/") or "https://api.openai.com/v1"
    model = model or "gpt-4o-mini"
    openai = backend.kind == "openai" if backend is not None else "api.openai.com" in base
    if enabled and not key and (_local_base(base) or (backend is not None and backend.vllm)):
        key = "not-needed"
    status = "disabled"
    if enabled and key:
        status = "configured"
    elif enabled:
        status = "missing_configuration"
    return {"enabled": enabled, "status": status, "model": model if enabled else "", "base": base, "key": key,
            "openai": openai, "provider": backend.provider if backend is not None else "env"}


def health():
    config = narrative_config()
    return {
        "status": config["status"],
        "model": config["model"] or None,
        "provider": config["provider"],
        "ready": config["status"] == "configured",
    }


async def explain(case: dict, score: dict) -> dict:
    config = narrative_config()
    run = security_run.get() or SecurityRun()
    usage = {"llm_calls": 0, "input_tokens": None, "output_tokens": None}
    empty = {"status": "disabled", "text": None, "security": run.summary(), "usage": usage}
    if not config["enabled"]:
        return empty
    if config["status"] != "configured":
        return {"status": "unavailable", "text": None, "security": run.summary(), "usage": usage}

    shap_lines = ", ".join(
        f"{item.get('label') or item['feature']} {item['direction']} {item['value']:+.2f}" for item in score["shap"][:6]
    )
    prompt = (
        "Write two short sentences for a fraud analyst. Use only these facts. "
        "Do not call the payment fraudulent, cleared, or legitimate. "
        "The probability is evidence, not a disposition.\n"
        f"Case: {case['label']}. Merchant: {case['merchant']}. Amount: {case['amount']}. "
        f"Channel: {case['channel']}. Neighborhood: {case['neighborhood']}. "
        f"Probability: {score['probability']:.2f}. TreeSHAP groups: {shap_lines}."
    )
    messages = [{"role": "user", "content": prompt}]
    served_by = None
    started = None
    try:
        await defense.inspect(messages, "narrative_input")
        started = time.monotonic()
        chosen = await asyncio.to_thread(pick_narrative) if resolve_narrative() is not None else None
        if chosen is None:
            text = await _complete(config, messages, usage)
            served_by = {"provider": config["provider"], "label": "Lab .env" if config["provider"] == "env" else config["provider"],
                         "model": config["model"], "fallback": False, "reason": ""}
        else:
            text, selection = await call_with_failover(
                USE_CASE, lambda backend: _complete(_backend_config(backend), messages, usage), first=chosen)
            served_by = selection.served_by()
        _emit_call(served_by, started, usage, "ok")
        started = None
        await defense.inspect([{"role": "assistant", "content": text}], "narrative_output")
    except DefenseBlocked:
        return {"status": "blocked", "text": None, "security": run.summary(), "usage": usage, "served_by": served_by}
    except DefenseUnavailable:
        return {"status": "unavailable", "text": None, "security": run.summary(), "usage": usage, "served_by": served_by}
    except Exception:
        if started is not None:
            _emit_call(served_by, started, usage, "error")
        return {"status": "unavailable", "text": None, "security": run.summary(), "usage": usage, "served_by": served_by}
    return {"status": "generated", "text": text, "security": run.summary(), "usage": usage, "served_by": served_by}


def _emit_call(served_by: dict | None, started: float, usage: dict, status: str) -> None:
    latency = round((time.monotonic() - started) * 1000)
    if served_by:
        emit_model_call(served_by, title="AI analyst summary", latency_ms=latency, input_tokens=usage["input_tokens"],
                        output_tokens=usage["output_tokens"], status=status)
    else:
        emit_current("llm.call", "AI analyst summary · no model answered", status="error", data={"latency_ms": latency})


def _backend_config(backend) -> dict:
    return {"model": backend.model, "base": backend.base_url, "key": backend.api_key or "not-needed", "openai": backend.kind == "openai"}


async def _complete(config: dict, messages: list[dict], usage: dict) -> str:
    """usage gets the call and, when the provider reports them, its token counts."""
    body = {"model": config["model"], "messages": messages, "temperature": 0.2}
    if config["openai"]:
        # OpenAI rejects vLLM's chat_template_kwargs; GPT-5 models take max_completion_tokens.
        body["max_completion_tokens"] = 180
        if config["model"].startswith("gpt-5"):
            body["reasoning_effort"] = "none"
    else:
        body["max_tokens"] = 180
        body["chat_template_kwargs"] = {"enable_thinking": False}
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        response = await client.post(
            f"{config['base']}/chat/completions",
            headers={"Authorization": f"Bearer {config['key']}"},
            json=body,
        )
        response.raise_for_status()
        body = response.json()
        usage["llm_calls"] += 1
        reported = body.get("usage") if isinstance(body.get("usage"), dict) else {}
        for source, target in (("prompt_tokens", "input_tokens"), ("completion_tokens", "output_tokens")):
            if isinstance(reported.get(source), int):
                usage[target] = (usage[target] or 0) + reported[source]
        message = body["choices"][0]["message"]
        text = message.get("content")
        if not (isinstance(text, str) and text.strip()):
            text = message.get("reasoning_content") or ""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Empty narrative")
    return text.strip()
