"""Export one finished lab run from the running interbank lab into recorded/ (after a person reviews it).

    python3 services/interbank/tools/export_recording.py inv-20261012-141346-e0011e trd-847-allowed --scenario allowed
    python3 services/interbank/tools/export_recording.py inv-20261012-140313-301efe trd-847-blocked --scenario blocked

The lab keeps run history only while its containers run. This copies a real run's events and
report through the studio proxy (GET /api/interbank/runs/{id}?after=n) into the services/common/runs.py
recording format, so the studio can replay it with the lab down. Nothing is re-run. Standard library only.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "common"))
from runs import RECORDING, SCHEMA_VERSION, redact  # noqa: E402

RECORDED = ROOT / "recorded"
TITLES = {
    "allowed": "TRD-847 · allowed investigation · both banks over A2A",
    "blocked": "TRD-847 · prompt-injection kickoff · blocked at Bank A's gateway",
}


def page(base: str, run_id: str, after: int) -> dict:
    request = urllib.request.Request(f"{base}/api/interbank/runs/{run_id}?after={after}", headers={"origin": base})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("run_id")
    parser.add_argument("name")
    parser.add_argument("--scenario", choices=sorted(TITLES), required=True)
    parser.add_argument("--base", default="http://localhost:3000")
    args = parser.parse_args()
    if not RECORDING.fullmatch(args.name):
        parser.error("invalid recording name")

    events: list[dict] = []
    while True:
        body = page(args.base, args.run_id, len(events))
        events.extend(body["events"])
        if not body["events"] or len(events) >= body["total"]:
            break
    run = body["run"]
    if run["status"] == "running" or not run.get("report"):
        print(f"Not saved: {args.run_id} is {run['status']} and has {'a' if run.get('report') else 'no'} report.")
        return 1
    served = next((e["data"]["served_by"] for e in reversed(events) if isinstance((e.get("data") or {}).get("served_by"), dict)), None)
    doc = {
        "v": SCHEMA_VERSION, "name": args.name, "title": TITLES[args.scenario], "scenario": args.scenario,
        "recorded_at": run["started_at"], "served_by": served, "synthetic": True,
        "note": "Exported from a real run of the interbank Docker lab. Fictional banks, synthetic settlement records.",
        "run": run, "events": events, "result": {"status": run["status"], "report": run["report"]},
    }
    RECORDED.mkdir(parents=True, exist_ok=True)
    path = RECORDED / f"{args.name}.json"
    path.write_text(json.dumps(redact(doc), indent=1, default=str) + "\n", encoding="utf-8")
    print(f"Exported {len(events)} events ({run['status']}) to {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
