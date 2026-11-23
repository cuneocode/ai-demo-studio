"""Check one investigation's trace in Splunk Agent Observability.

Finds the session for the investigation ID and reports every span by type, with
whether its input and output are readable. Exits non-zero if expected spans are
missing or empty. Prints no credentials.

    python -m tools.verify_splunk <investigation-id>
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import Counter

from galileo_core.constants.request_method import RequestMethod
from splunk_ao.constants.routes import Routes
from splunk_ao.logger import SplunkAOLogger
from splunk_ao.schema.trace import LogRecordsSearchRequest
from splunk_ao.traces import Traces


def flatten(spans: list[dict]) -> list[dict]:
    out = []
    for item in spans:
        out.append(item)
        out.extend(flatten(item.get("spans") or []))
    return out


def readable(value) -> bool:
    return value not in (None, "", [], {})


async def main(run_id: str) -> int:
    logger = SplunkAOLogger(project=os.environ["SPLUNK_AO_PROJECT"],
                            agent_stream=os.environ["SPLUNK_AO_AGENT_STREAM"], mode="batch")
    client = Traces(project_id=logger.project_id, agent_stream_id=logger.agent_stream_id)
    search = LogRecordsSearchRequest(log_stream_id=logger.agent_stream_id, filters=[])
    sessions = (await client.get_sessions(search)).get("records", [])
    session = next((s for s in sessions if s.get("external_id") == run_id), None)
    if session is None:
        print(json.dumps({"run_id": run_id, "passed": False, "error": "session not found"}))
        return 1
    traces = (await client._make_async_request(
        RequestMethod.POST, Routes.traces_search.format(project_id=logger.project_id),
        json=search.model_dump(mode="json"),
    )).get("records", [])
    spans = []
    for record in (t for t in traces if t.get("session_id") == session["id"]):
        detail = await client.get_trace(str(record["trace_id"]))
        spans.extend(flatten(detail.get("spans") or []))

    rows = [{"type": s.get("type"), "name": s.get("name"),
             "input": readable(s.get("input")), "output": readable(s.get("output"))} for s in spans]
    by_type = Counter(r["type"] for r in rows)
    # `http` spans are agentgateway's own upstream-call spans (method and status only), and
    # the gateway's Agent Card GET has no request body and a rewritten response body.
    empty = [r for r in rows if r["type"] != "http" and not (r["name"] or "").startswith("GET ")
             and not (r["input"] and r["output"])]
    names = " ".join(r["name"] or "" for r in rows)
    expected = {
        "console workflow": "Interbank settlement investigation" in names,
        "Bank A gateway span": any(r["type"] == "workflow" and "bank-a-gateway" in (r["name"] or "")
                                   for r in rows) or "bank-a-gateway" in names,
        "Cisco AI Defense spans": "Cisco AI Defense" in names,
    }
    if "blocked" not in sys.argv[2:]:
        expected |= {
            "Bank A agent": "a2a.server.on_message_send bank-a-agent" in names,
            "Bank B agent": "a2a.server.on_message_send bank-b-agent" in names,
            "A2A client spans": "a2a.client.send_message" in names,
            "LLM spans": by_type.get("llm", 0) > 0,
            "tool spans": by_type.get("tool", 0) > 0,
            "Agent Control spans": "Splunk Agent Control" in names,
            "Bank B gateway span": "bank-b-gateway" in names,
        }
    report = {
        "run_id": run_id,
        "session_id": session["id"],
        "spans": len(rows),
        "by_type": dict(by_type),
        "expected": expected,
        "spans_without_input_or_output": [f'{r["type"]}: {r["name"]}' for r in empty][:40],
        "passed": all(expected.values()) and len(empty) <= len(rows) * 0.1,
    }
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1])))
