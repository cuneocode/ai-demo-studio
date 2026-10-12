"""Record the scripted Brahe Bank prompts from the running studio into data/recorded/ (after a person reviews it).

    cd services/banking && .venv/bin/python scripts/record_golden.py

Posts each prompt in app/banking-scenarios.json as its own fresh conversation to POST /api/banking/chat
through the studio, so every turn is a real call: AI Defense, Agent Control, and the model chain (a paid
model call when the chain answers from a hosted provider). Refusals (403, 422) are kept with the
security, controls and telemetry summaries the service returned. Writes one recording,
data/recorded/scripted-prompts.json, in the services/common/runs.py format. Brahe Bank and its
customer are fictional.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

SERVICE = Path(__file__).resolve().parents[1]
REPO = SERVICE.parents[1]
sys.path.insert(0, str(SERVICE.parent / "common"))
from runs import RECORDING, SCHEMA_VERSION, redact  # noqa: E402

RECORDED = SERVICE / "data" / "recorded"
SCENARIOS = REPO / "app" / "banking-scenarios.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="http://localhost:3000")
    parser.add_argument("--name", default="scripted-prompts")
    parser.add_argument("--keep-unexpected", action="store_true", help="save even when a turn's status differs from the scenario's")
    args = parser.parse_args()
    if not RECORDING.fullmatch(args.name):
        parser.error("invalid recording name")

    scenarios = json.loads(SCENARIOS.read_text(encoding="utf-8"))
    client = httpx.Client(base_url=args.base, timeout=200, headers={"origin": args.base})
    turns, unexpected = [], []
    for item in scenarios:
        response = client.post("/api/banking/chat", json={"message": item["prompt"]})
        try:
            body = response.json()
        except ValueError:
            body = {"detail": f"Non-JSON response ({response.status_code})."}
        turns.append({"id": item["id"], "label": item["label"], "prompt": item["prompt"], "expected": item["expected"],
                      "status": response.status_code, "at": datetime.now(UTC).isoformat(), "body": body})
        security = (body.get("security") or {}) if isinstance(body, dict) else {}
        controls = (body.get("controls") or {}) if isinstance(body, dict) else {}
        print(f"{item['id']}: HTTP {response.status_code} · AI Defense {security.get('status')} "
              f"({security.get('checks')} checks, {security.get('blocked')} blocked) · Agent Control {controls.get('status')}")
        if item.get("httpStatus") and response.status_code != item["httpStatus"]:
            unexpected.append(f"{item['id']} returned {response.status_code}, expected {item['httpStatus']}")

    if unexpected and not args.keep_unexpected:
        print("Not saved: " + "; ".join(unexpected) + ". Re-run with --keep-unexpected to keep it anyway.")
        return 1

    answered = next((turn["body"] for turn in turns if turn["status"] == 200), {})
    doc = {
        "v": SCHEMA_VERSION, "name": args.name, "title": "Brahe Bank · scripted prompts (answer, AI Defense block, Agent Control block)",
        "scenario": "scripted-prompts", "recorded_at": turns[-1]["at"], "served_by": answered.get("served_by"), "synthetic": True,
        "note": "Recorded from live calls to the banking service through the studio. Fictional bank and customer.",
        "run": None, "events": [], "result": {"turns": turns},
    }
    RECORDED.mkdir(parents=True, exist_ok=True)
    path = RECORDED / f"{args.name}.json"
    path.write_text(json.dumps(redact(doc), indent=1, default=str) + "\n", encoding="utf-8")
    print(f"Recorded {len(turns)} turns to {path.relative_to(SERVICE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
