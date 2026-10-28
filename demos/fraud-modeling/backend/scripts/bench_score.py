#!/usr/bin/env python3
"""Per-payment scoring latency, GPU vs CPU on the same box (inside the training image).

Each request is the full live path: point-in-time neighbourhood sampling (CPU,
Python), GraphSAGE forward, XGBoost predict, and TreeSHAP explanation.
"""
from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))


def stats(values: list[float]) -> dict:
    arr = np.asarray(values)
    return {"p50": round(float(np.percentile(arr, 50)), 3), "p95": round(float(np.percentile(arr, 95)), 3),
            "mean": round(float(arr.mean()), 3)}


def main() -> None:
    import torch
    from infer_server import Engine

    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", type=Path, default=Path("/data"))
    parser.add_argument("--output", type=Path, default=Path("/workspace/output"))
    parser.add_argument("--out", type=Path, default=Path("/workspace/cache/bench.json"))
    parser.add_argument("--n", type=int, default=300)
    parser.add_argument("--warmup", type=int, default=20)
    parser.add_argument("--devices", default="cuda,cpu")
    args = parser.parse_args()

    test = pd.read_csv(args.graph / "test_gnn" / "cases.csv")
    attr = pd.read_csv(args.graph / "test_gnn" / "edges" / "account_transacts_merchant_attr.csv").to_numpy(np.float32)
    rows = test.sample(n=min(args.n + args.warmup, len(test)), random_state=3)
    rows = list(zip(rows["src"], rows["dst"], attr[rows.index.to_numpy()], rows["ts"]))

    results = {}
    for device in [d for d in args.devices.split(",") if d]:
        if device == "cuda" and not torch.cuda.is_available():
            results[device] = {"skipped": "CUDA not available"}
            continue
        engine = Engine(device=device, data=args.graph, output=args.output)
        for src, dst, a, ts in rows[:args.warmup]:
            engine.score(src, dst, a, ts)
        per_stage: dict[str, list[float]] = {}
        started = time.perf_counter()
        for src, dst, a, ts in rows[args.warmup:]:
            timing = engine.score(src, dst, a, ts)["timing_ms"]
            for key, value in timing.items():
                if isinstance(value, float):
                    per_stage.setdefault(key, []).append(value)
        elapsed = time.perf_counter() - started
        results[device] = {
            "requests": len(rows) - args.warmup,
            "latency_ms": {key: stats(values) for key, values in per_stage.items()},
            "sequential_scores_per_second": round((len(rows) - args.warmup) / elapsed, 1),
            "torch_threads": torch.get_num_threads(),
        }
        del engine
        if device == "cuda":
            torch.cuda.empty_cache()

    out = {
        "what": "single-payment live scoring path: temporal sampling + GraphSAGE + XGBoost + TreeSHAP",
        "machine": platform.machine(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "torch": torch.__version__,
        "devices": results,
        "note": "Neighbourhood sampling is Python on CPU in both modes; the device only moves the GNN and XGBoost.",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2))
    print(json.dumps({d: r.get("latency_ms", {}).get("total_ms", r) for d, r in results.items()}), flush=True)
    print(f"wrote {args.out}", flush=True)


if __name__ == "__main__":
    main()
