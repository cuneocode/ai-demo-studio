"""Demo timeline events. Each component reports what it actually did to the dashboard."""

from __future__ import annotations

import json
import os
import time
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

import httpx

from lab.config import ORGANIZATION, SERVICE_NAME
from lab.telemetry import current_ids

current_run: ContextVar[str] = ContextVar("current_run", default="")
current_conversation: ContextVar[str] = ContextVar("current_conversation", default="")

_REDACT = {"authorization", "api_key", "token", "secret", "password"}


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items() if str(k).lower() not in _REDACT}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    if isinstance(value, str) and len(value) > 24_000:
        return value[:24_000] + "…"
    return value


async def emit(
    run_id: str,
    kind: str,
    title: str,
    *,
    status: str = "info",
    source: str | None = None,
    target: str | None = None,
    body: str | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    """kind: a2a.send | a2a.receive | a2a.reply | agent.thinking | agent.tool_call |
    tool.result | db.query | guardrail | control | run"""
    event = {
        "id": str(uuid.uuid4()),
        "at": datetime.now(UTC).isoformat(),
        "ns": time.monotonic_ns(),
        "run_id": run_id or current_run.get() or "unassigned",
        "organization": ORGANIZATION,
        "component": SERVICE_NAME,
        "kind": kind,
        "status": status,
        "title": title,
        "source": source or SERVICE_NAME,
        "target": target,
        "body": body,
        "data": _clean(data or {}),
        **current_ids(),
    }
    sink = os.getenv("EVENT_SINK_URL")
    if not sink:
        return
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(sink, content=json.dumps(event, default=str))
    except httpx.HTTPError:
        pass
