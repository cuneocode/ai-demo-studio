"""Record a golden run from the running wealth service into data/recorded/ (after a person reviews it).

    cd services/wealth && .venv/bin/python scripts/record_golden.py research HCYN
    cd services/wealth && .venv/bin/python scripts/record_golden.py research KSTL --scenario restricted --name research-kstl-restricted
    cd services/wealth && .venv/bin/python scripts/record_golden.py research HCYN --scenario poisoned-news --name research-hcyn-poisoned
    cd services/wealth && .venv/bin/python scripts/record_golden.py research JPM --scenario bank --name research-jpm-bank
    cd services/wealth && .venv/bin/python scripts/record_golden.py advisory dana-whitfield --with-research research-hcyn

Makes one live call (a paid model call when the chain answers from a hosted provider), then saves the
run's events and the full response in the services/common/runs.py recording format. The studio replays
it when the live path is down. Only synthetic clients and fictional or public market data are recorded.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE.parent / "common"))
from runs import SCHEMA_VERSION, redact

RECORDED = SERVICE / "data" / "recorded"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("kind", choices=["research", "advisory"])
    parser.add_argument("subject", help="ticker (research) or household id (advisory)")
    parser.add_argument("--base", default="http://localhost:3000")
    parser.add_argument("--name", help="recording name (default research-<ticker> / advisory-<household>)")
    parser.add_argument("--scenario", default="earnings", help="research scenario: earnings, restricted, poisoned-news, bank")
    parser.add_argument("--with-research", help="attach this research recording's update to an advisory run")
    parser.add_argument("--keep-unready", action="store_true", help="save even when the AI output is not ready")
    args = parser.parse_args()

    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    run_id = f"wealth-{args.kind}-{stamp}-{uuid.uuid4().hex[:6]}"
    client = httpx.Client(base_url=args.base, timeout=200, headers={"origin": args.base})
    if args.kind == "research":
        ticker = args.subject.upper()
        name = args.name or f"research-{ticker.lower()}"
        response = client.post("/api/wealth/research/analyze", json={"ticker": ticker, "scenario": args.scenario, "run_id": run_id})
        title = f"{ticker} · {args.scenario}"
        ai = "update"
    else:
        record = client.get(f"/api/wealth/households/{args.subject}").raise_for_status().json()
        name = args.name or f"advisory-{record['id']}"
        payload = {"household_id": record["id"], "run_id": run_id}
        if args.with_research:
            attached = json.loads((RECORDED / f"{args.with_research}.json").read_text(encoding="utf-8"))
            payload["research"] = attached["result"]
        response = client.post("/api/wealth/advisory/brief", json=payload)
        title = f"{record['name']} · {record.get('scenario') or 'meeting prep'}"
        ai = "brief"
    body = response.json()
    if response.status_code != 200:
        print(f"Live call failed ({response.status_code}): {body.get('detail')}")
        return 1
    status = (body.get(ai) or {}).get("status")
    if body.get("status") == "blocked":
        status = "ready"  # a restricted issuer is the story: blocked before any data or model call
    print(f"{ai} status: {status} · served_by: {json.dumps(body.get('served_by'))}")
    print(f"security: {json.dumps(body.get('security'))} · usage: {json.dumps(body.get('usage'))}")
    if status != "ready" and not args.keep_unready:
        print(f"Not recorded: the {ai} is {status} ({(body.get(ai) or {}).get('reason')}).")
        return 1
    page = None
    for _ in range(20):
        page = client.get(f"/api/wealth/runs/{run_id}").json()
        if page.get("run", {}).get("status") != "running":
            break
        time.sleep(0.5)
    events = page["events"]
    doc = {
        "v": SCHEMA_VERSION, "name": name, "title": title, "scenario": page["run"].get("scenario"),
        "recorded_at": page["run"].get("finished_at") or datetime.now(UTC).isoformat(),
        "served_by": body.get("served_by"), "synthetic": True,
        "note": "Recorded from a live run of the wealth service. Synthetic client, fictional or public market data.",
        "run": {key: value for key, value in page["run"].items() if key != "result"}, "events": events, "result": body,
    }
    RECORDED.mkdir(parents=True, exist_ok=True)
    path = RECORDED / f"{name}.json"
    path.write_text(json.dumps(redact(doc), indent=1, default=str) + "\n", encoding="utf-8")
    print(f"Recorded {len(events)} events to {path.relative_to(SERVICE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
