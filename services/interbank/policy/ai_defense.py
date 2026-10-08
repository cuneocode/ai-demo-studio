"""Cisco AI Defense Inspection API client (chat inspection)."""

from __future__ import annotations

import os
import uuid
from typing import Any

import httpx

from lab.config import ORGANIZATION, env

REGION_HOSTS = {"us": "us", "us-west-2": "us", "eu": "eu", "eu-central-1": "eu",
                "ap": "ap", "ap-northeast-1": "ap"}


class InspectionUnavailable(RuntimeError):
    pass


async def inspect_chat(messages: list[dict[str, str]], *, run_id: str, hop: str) -> dict[str, Any]:
    region = REGION_HOSTS.get(os.getenv("AIDEFENSE_REGION", "us").lower())
    if region is None:
        raise InspectionUnavailable("AIDEFENSE_REGION is not a known region")
    url = f"https://{region}.api.inspect.aidefense.security.cisco.com/api/v1/inspect/chat"
    try:
        async with httpx.AsyncClient(timeout=float(os.getenv("AIDEFENSE_TIMEOUT", "30"))) as client:
            response = await client.post(
                url,
                headers={"X-Cisco-AI-Defense-API-Key": env("AIDEFENSE_API_KEY")},
                json={
                    "messages": messages,
                    "metadata": {
                        "src_app": f"interbank-{ORGANIZATION}-gateway",
                        "client_transaction_id": f"{run_id}:{hop}:{uuid.uuid4()}",
                    },
                },
            )
            response.raise_for_status()
            verdict = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise InspectionUnavailable("Cisco AI Defense inspection failed") from exc
    if not isinstance(verdict.get("is_safe"), bool):
        raise InspectionUnavailable("Cisco AI Defense returned no verdict")
    return {
        "is_safe": verdict["is_safe"],
        "event_id": verdict.get("event_id") or None,
        "classifications": [c for c in verdict.get("classifications", []) if isinstance(c, str)],
        "rules": [
            {"rule": r.get("rule_name"), "classification": r.get("classification")}
            for r in verdict.get("rules", []) if isinstance(r, dict)
        ],
        "action": verdict.get("action"),
    }
