"""Create the Splunk Agent Control controls and bind them to the demo Agent Stream.

Each bank's agent evaluates these on its outbound A2A step (lab/controls.py) before
anything is sent to the other bank: a confidentiality control that keeps third-party
and cash data inside the bank.
"""

from __future__ import annotations

import asyncio
import json
import os

import httpx
from agent_control_models import ControlDefinition
from splunk_ao.logger import SplunkAOLogger

CONTROLS = {
    "interbank-bank-a-outbound-confidentiality-v1": (
        "bank-a",
        "Bank A must not send cash balances, nostro accounts, or other counterparties' data "
        "to Bank B.",
        r"(?i)(HPB-NOSTRO|available[_ ]balance|CBNKUS44|\bBank C\b|TRD-848)",
    ),
    "interbank-bank-b-outbound-confidentiality-v1": (
        "bank-b",
        "Bank B must not send other counterparties' data or notices to Bank A.",
        r"(?i)(CBNKUS44|\bBank C\b|SSI-CHG-2210)",
    ),
}


def definition(organization: str, description: str, pattern: str) -> dict:
    return {
        "description": description,
        "enabled": True,
        "execution": "server",
        "scope": {
            "step_types": ["tool"],
            "step_names": [f"{organization}.send_a2a_message"],
            "stages": ["pre"],
        },
        "condition": {
            "selector": {"path": "input.message"},
            "evaluator": {"name": "regex", "config": {"pattern": pattern}},
        },
        "action": {"decision": "deny"},
        "tags": ["interbank-a2a-demo", organization],
    }


async def main() -> None:
    logger = SplunkAOLogger(project=os.environ["SPLUNK_AO_PROJECT"],
                            agent_stream=os.environ["SPLUNK_AO_AGENT_STREAM"], mode="batch")
    stream_id = str(logger.agent_stream_id)
    header = os.getenv("AGENT_CONTROL_API_KEY_HEADER", "Splunk-AO-API-Key")
    results = []
    async with httpx.AsyncClient(base_url=os.environ["AGENT_CONTROL_URL"].rstrip("/"),
                                 headers={header: os.environ["SPLUNK_AO_API_KEY"]},
                                 timeout=30) as client:
        for name, (organization, description, pattern) in CONTROLS.items():
            data = definition(organization, description, pattern)
            ControlDefinition.model_validate(data)
            listing = await client.get("/api/v1/controls", params={"name": name})
            listing.raise_for_status()
            existing = [c for c in listing.json().get("controls", []) if c.get("name") == name]
            if existing:
                control_id = existing[0]["id"]
                (await client.put(f"/api/v1/controls/{control_id}/data", json={"data": data})
                 ).raise_for_status()
            else:
                created = await client.put("/api/v1/controls", json={"name": name, "data": data})
                created.raise_for_status()
                control_id = created.json()["control_id"]
            (await client.put("/api/v1/control-bindings/by-key", json={
                "target_type": "log_stream", "target_id": stream_id,
                "control_id": control_id, "enabled": True,
            })).raise_for_status()
            results.append({"control": name, "id": control_id, "agent_stream_id": stream_id})
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
