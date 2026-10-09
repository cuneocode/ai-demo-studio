"""Record a golden SAR investigation from the running service into data/recorded/ (after a person reviews it).

    cd services/sar && .venv/bin/python scripts/record_golden.py mule-reyes
    cd services/sar && .venv/bin/python scripts/record_golden.py explained-novak --decision no_file

Runs one live investigation (paid model calls when the chain answers from a hosted provider), plays the
investigator and a separate second-line QA reviewer, and saves the run's events and result in the
services/common/runs.py recording format. The studio replays it when the live path is down. Every case
is synthetic; nothing is filed anywhere (the e-filing step is simulated).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE.parent / "common"))
from runs import SCHEMA_VERSION, redact  # noqa: E402

RECORDED = SERVICE / "data" / "recorded"
INVESTIGATOR, QA_REVIEWER = "Theo Marsh", "Lena Ortiz"


def wait(client: httpx.Client, run_id: str, match, timeout: float = 420) -> tuple[dict | None, dict]:
    deadline = time.time() + timeout
    while True:
        page = client.get(f"/api/sar/runs/{run_id}").raise_for_status().json()
        hits = [e for e in page["events"] if match(e)]
        if hits or page["run"]["status"] != "running" or time.time() > deadline:
            return (hits[-1] if hits else None), page
        time.sleep(1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("scenario")
    parser.add_argument("--decision", choices=["file", "no_file"], help="investigator decision (default: the agent's recommendation)")
    parser.add_argument("--base", default="http://localhost:3000")
    parser.add_argument("--name", help="recording name (default: the scenario id)")
    parser.add_argument("--keep-unready", action="store_true", help="save even when the draft did not fully verify")
    args = parser.parse_args()

    name = args.name or args.scenario
    run_id = f"sar-golden-{args.scenario}-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"
    client = httpx.Client(base_url=args.base, timeout=60, headers={"origin": args.base})
    scenarios = {s["id"]: s for s in client.get("/api/sar/scenarios").raise_for_status().json()["scenarios"]}
    if args.scenario not in scenarios:
        print(f"Unknown scenario {args.scenario!r}; one of {', '.join(scenarios)}")
        return 1
    client.post("/api/sar/runs", json={"scenario": args.scenario, "run_id": run_id, "label": f"SAR investigation · {args.scenario}",
                                       "input": {"mode": "live"}}).raise_for_status()
    request, page = wait(client, run_id, lambda e: e["kind"] == "hitl.request")
    if not request:
        print(f"Not recorded: the run ended before review ({page['run']['status']}).")
        return 1
    pkg = request["data"]["package"]
    draft = pkg["draft"]
    check = draft["verification"]
    print(f"served_by: {(pkg.get('served_by') or {}).get('label')} · usage: {json.dumps(pkg.get('usage'))}")
    print(f"security: {json.dumps({k: pkg['security'].get(k) for k in ('mode', 'status', 'checks', 'blocked', 'withheld_segments')})}")
    print(f"draft: {check['kept']}/{check['total']} sentences verified · missing {check['missing_sections']} · recommendation {draft['recommendation']}")
    for section in draft["sections"]:
        for sentence in section["sentences"]:
            print(f"  [{section['section']}] {sentence['text']}  {sentence['cites']}")
    for dropped in draft["dropped"]:
        print(f"  DROPPED {dropped['text']}  ({'; '.join(dropped['problems'])})")
    ready = (check["kept"] > 0 and not check["failing"] and not check["missing_sections"]
             and draft["agrees"] and not draft["rationale"].get("problems"))
    if not ready and not args.keep_unready:
        print("Not recorded: the draft is not ready (re-run, or pass --keep-unready). The open case times out on its own.")
        return 1

    decision = args.decision or draft["recommendation"]
    client.post(f"/api/sar/runs/{run_id}/review", json={"request_id": request["data"]["request_id"], "decision": decision,
                                                        "by": INVESTIGATOR, "rationale": draft["rationale"]["text"]}).raise_for_status()
    qa, page = wait(client, run_id, lambda e: e["kind"] == "hitl.request" and e["data"].get("stage") == "qa")
    if not qa:
        print(f"Not recorded: no QA step ({page['run']['status']}).")
        return 1
    client.post(f"/api/sar/runs/{run_id}/qa", json={"request_id": qa["data"]["request_id"], "decision": "approve",
                                                    "by": QA_REVIEWER}).raise_for_status()
    _, page = wait(client, run_id, lambda e: e["kind"] == "result")
    run = page["run"]
    result = run.get("result") or {}
    if run["status"] == "running" or result.get("outcome") not in {"filed_simulated", "closed_no_sar"}:
        print(f"Not recorded: the case did not close ({run['status']}, {result.get('outcome')}).")
        return 1

    scenario = scenarios[args.scenario]
    doc = {
        "v": SCHEMA_VERSION, "name": name, "title": scenario.get("title") or args.scenario, "scenario": args.scenario,
        "recorded_at": run.get("finished_at") or datetime.now(UTC).isoformat(),
        "served_by": pkg.get("served_by"), "synthetic": True, "card": scenario,
        "note": "Recorded from a live run of the SAR service. Synthetic case and fake PII; e-filing is simulated.",
        "run": {key: value for key, value in run.items() if key != "result"}, "events": page["events"], "result": result,
    }
    RECORDED.mkdir(parents=True, exist_ok=True)
    path = RECORDED / f"{name}.json"
    path.write_text(json.dumps(redact(doc), indent=1, default=str) + "\n", encoding="utf-8")
    print(f"Recorded {len(page['events'])} events ({result['outcome']}) to {path.relative_to(SERVICE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
