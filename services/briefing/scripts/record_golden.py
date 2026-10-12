"""Record one company-briefing extract from the running studio into data/recorded/ (after a person reviews it).

    cd services/briefing && .venv/bin/python scripts/record_golden.py

Uploads the fictional Halcyon Interconnect annual report (fixtures/halcyon/annual-report-fy2025.html)
to POST /api/briefing/analyze through the studio with refresh=true, so the Deep Agent really runs:
model calls on the Studio chain (paid when a hosted provider answers) and AI Defense inspection.
Saves the analyze payload in the services/common/runs.py recording format. Halcyon is fictional.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

SERVICE = Path(__file__).resolve().parents[1]
REPO = SERVICE.parents[1]
sys.path.insert(0, str(SERVICE.parent / "common"))
from runs import RECORDING, SCHEMA_VERSION, redact  # noqa: E402

RECORDED = SERVICE / "data" / "recorded"
REPORT = REPO / "fixtures" / "halcyon" / "annual-report-fy2025.html"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="http://localhost:3000")
    parser.add_argument("--name", default="halcyon-annual-report")
    parser.add_argument("--query", default="Halcyon Interconnect")
    args = parser.parse_args()
    if not RECORDING.fullmatch(args.name):
        parser.error("invalid recording name")

    client = httpx.Client(base_url=args.base, timeout=260, headers={"origin": args.base})
    response = client.post("/api/briefing/analyze", data={"query": args.query, "refresh": "true"},
                           files={"file": (REPORT.name, REPORT.read_bytes(), "text/html")})
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    security = payload.get("security") or {}
    print(f"HTTP {response.status_code} · cached {payload.get('cached')} · served_by {json.dumps(payload.get('served_by'))}")
    print(f"security: {json.dumps(security)} · usage: {json.dumps(payload.get('usage'))}")
    if response.status_code != 200 or payload.get("cached"):
        print("Not saved: the extract did not complete as a fresh live run.")
        return 1

    doc = {
        "v": SCHEMA_VERSION, "name": args.name, "title": "Halcyon Interconnect · uploaded annual report (synthetic)",
        "scenario": "upload", "recorded_at": payload["recorded_at"], "served_by": payload.get("served_by"), "synthetic": True,
        "note": "Recorded from a live extract by the briefing service. Fictional company, synthetic annual report.",
        "run": None, "events": [], "result": payload,
    }
    RECORDED.mkdir(parents=True, exist_ok=True)
    path = RECORDED / f"{args.name}.json"
    path.write_text(json.dumps(redact(doc), indent=1, default=str) + "\n", encoding="utf-8")
    print(f"Recorded the extract to {path.relative_to(SERVICE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
