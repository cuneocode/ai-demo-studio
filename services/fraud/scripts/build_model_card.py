#!/usr/bin/env python3
"""Assemble .cache/model_card.json from the files a Sparky run produced.

Stdlib only. Missing inputs are listed under "missing" and their fields stay null;
nothing is filled in by hand.
"""
from __future__ import annotations

import argparse
import json
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 1


def load(path: Path, missing: list[str]):
    if path.is_file():
        return json.loads(path.read_text())
    missing.append(str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path))
    return None


def git(*args: str) -> str | None:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return None


def pick(data, *keys):
    for key in keys:
        if not isinstance(data, dict):
            return None
        data = data.get(key)
    return data


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache")
    parser.add_argument("--config", type=Path, default=ROOT / "scripts" / "config.spark.yaml")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    cache, missing = args.cache, []

    prep = load(cache / "preprocess_stats.json", missing)
    train_run = load(cache / "train" / "train_run.json", missing)
    container_metrics = load(cache / "train" / "metrics.json", missing)
    backtest = load(cache / "backtest.json", missing)
    bench = load(cache / "bench.json", missing)
    hardware = load(cache / "hardware.json", missing) or {"machine": platform.machine()}
    config_text = args.config.read_text() if args.config.is_file() else None
    models = pick(backtest, "models") or {}

    def share(name):
        return pick(models, name, "at_alert_rate", "fraud_amount_caught_share")

    card = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": "measured" if not missing else "partial",
        "tag": "Measured · TabFormer test window · synthetic data",
        "headline": {
            "alert_rate": pick(backtest, "alert_rate"),
            "fraud_amount_caught_share": {name: share(name) for name in ("rules", "xgboost_only", "gnn_xgboost")},
            "recall_at_alert_rate": {name: pick(models, name, "at_alert_rate", "recall") for name in models},
            "fp_per_tp_at_rules_recall": {
                name: pick(models, name, "false_positives_per_true_positive_at_rules_recall") for name in models
            },
            "auc_roc": {name: pick(models, name, "auc_roc") for name in models},
            "auc_pr": {name: pick(models, name, "auc_pr") for name in models},
            "train_minutes": round(train_run["seconds"] / 60, 1) if pick(train_run, "seconds") else None,
            "preprocess_seconds": pick(prep, "seconds"),
            "score_p50_ms": {d: pick(bench, "devices", d, "latency_ms", "total_ms", "p50") for d in ("cuda", "cpu")},
            "score_p95_ms": {d: pick(bench, "devices", d, "latency_ms", "total_ms", "p95") for d in ("cuda", "cpu")},
        },
        "model": {
            "id": "gnn-xgb-tabformer",
            "name": "GraphSAGE + XGBoost (NVIDIA financial-fraud-training)",
            "image": pick(train_run, "image"),
            "image_digest": pick(train_run, "image_digest"),
            "gnn_trained": pick(train_run, "gnn_trained"),
            "explain": "xgboost_treeshap (log-odds, summed per feature group)",
            "neighbourhood": "point in time: payments strictly before the scored one",
            "config_yaml": config_text,
        },
        "dataset": {
            "name": "IBM TabFormer card_transaction.v1.csv",
            "synthetic": True,
            "train": pick(prep, "train"),
            "test": pick(prep, "test"),
            "accounts": pick(prep, "accounts"),
            "merchants": pick(prep, "merchants"),
            "edge_features": pick(prep, "edge_features"),
            "node_features": pick(prep, "node_features"),
        },
        "metrics": {
            "backtest": backtest,
            "container_reported": container_metrics,
            "container_reported_note": "Written by the NVIDIA image on its own test pass; its neighbourhood sampling "
                                       "is not point in time. Prefer the backtest numbers.",
        },
        "timings": {
            "preprocess_seconds": pick(prep, "seconds"),
            "train": train_run,
            "inference": bench,
        },
        "hardware": hardware,
        "provenance": {
            "git_sha": git("rev-parse", "HEAD"),
            "git_dirty": bool(git("status", "--porcelain", "--", "services/fraud/scripts")),
            "host_label": "Sparky · NVIDIA DGX Spark (GB10) · dev box, not Cisco hardware",
        },
        "missing": missing,
    }
    out = args.out or cache / "model_card.json"
    out.write_text(json.dumps(card, indent=2))
    print(f"wrote {out} status={card['status']} missing={missing}")


if __name__ == "__main__":
    main()
