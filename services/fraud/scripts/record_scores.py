#!/usr/bin/env python3
"""Record live sidecar scores for the studio cases into .cache/scores.json.

Same request shape as scorer.py, so the Mac can replay them via FRAUD_BACKEND=cache
(or the auto chain) without Sparky. Stdlib only; run on the host serving :8000.
"""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def call(url: str, payload: dict | None = None, timeout: float = 60.0) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=os.getenv("FRAUD_SCORE_URL", "http://127.0.0.1:8000").rstrip("/"))
    parser.add_argument("--cases", type=Path, default=ROOT / ".cache" / "studio_cases.json")
    parser.add_argument("--out", type=Path, default=ROOT / ".cache" / "scores.json")
    args = parser.parse_args()

    health = call(f"{args.url}/health", timeout=10)
    recorded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    scores = {}
    for case in json.loads(args.cases.read_text()):
        started = time.perf_counter()
        result = call(f"{args.url}/score", {"case": case, "case_id": case["id"]})
        scores[case["id"]] = {
            "probability": result["probability"],
            "shap": result["shap"],
            "explain": result.get("explain"),
            "as_of": result.get("as_of"),
            "temporal_filter": result.get("temporal_filter"),
            "device": result.get("device"),
            "timing_ms": result.get("timing_ms"),
            "http_ms": round((time.perf_counter() - started) * 1e3, 3),
            "model": "gnn-xgb-tabformer",
            "recorded_at": recorded_at,
            "served_by": {"url": args.url, "device": health.get("device"), "backend": health.get("backend")},
        }
        print(f"{case['id']} p={result['probability']:.4f} {result.get('timing_ms', {}).get('total_ms')} ms", flush=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(scores, indent=2))
    print(f"wrote {args.out} cases={len(scores)}")


if __name__ == "__main__":
    main()
