#!/usr/bin/env python3
"""Offline backtest on the TabFormer test window: rules vs XGBoost-only vs GNN+XGBoost.

Runs inside the training image (needs the trained artifacts and gnn_arch). Every
test payment is scored point in time: GNN neighbourhoods and rules history only
use earlier payments. The evaluation set is every fraud-labelled test payment plus
a uniform sample of legit ones, re-weighted to the full window.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))


def _ranked(y, s, w, tiebreak=None):
    keys = (s,) if tiebreak is None else (tiebreak, s)
    order = np.lexsort(tuple(-k for k in keys))
    return np.asarray(y)[order], np.asarray(w)[order], order


def roc_auc(y, s, w) -> float:
    y, s, w = np.asarray(y, float), np.asarray(s, float), np.asarray(w, float)
    order = np.argsort(s, kind="mergesort")
    s, y, w = s[order], y[order], w[order]
    _, starts = np.unique(s, return_index=True)
    pos = np.add.reduceat(w * y, starts)
    neg = np.add.reduceat(w * (1 - y), starts)
    below = np.cumsum(neg) - neg
    return float((pos * (below + 0.5 * neg)).sum() / (pos.sum() * neg.sum()))


def average_precision(y, s, w) -> float:
    y, s, w = np.asarray(y, float), np.asarray(s, float), np.asarray(w, float)
    order = np.argsort(-s, kind="mergesort")
    s, y, w = s[order], y[order], w[order]
    _, starts = np.unique(-s, return_index=True)
    tp = np.cumsum(np.add.reduceat(w * y, starts))
    allw = np.cumsum(np.add.reduceat(w, starts))
    recall_step = np.diff(np.concatenate([[0.0], tp])) / tp[-1]
    return float((tp / allw * recall_step).sum())


def at_alert_rate(y, s, w, amount, rate, tiebreak=None) -> dict:
    """Alert on the top ``rate`` share of payments (by weight); ties broken by amount."""
    y_r, w_r, order = _ranked(y, s, w, tiebreak)
    amt = np.asarray(amount, float)[order]
    alerted = np.cumsum(w_r) <= rate * w_r.sum()
    tp = float((w_r * y_r)[alerted].sum())
    fp = float((w_r * (1 - y_r))[alerted].sum())
    fraud_amt = float((w_r * y_r * amt).sum())
    caught_amt = float((w_r * y_r * amt)[alerted].sum())
    return {
        "alert_rate": rate,
        "alerts": round(tp + fp, 1),
        "recall": tp / float((w_r * y_r).sum()),
        "precision": tp / (tp + fp) if tp + fp else 0.0,
        "false_positives_per_true_positive": fp / tp if tp else None,
        "fraud_amount_caught": round(caught_amt, 2),
        "fraud_amount_caught_share": caught_amt / fraud_amt if fraud_amt else 0.0,
    }


def fp_per_tp_at_recall(y, s, w, target, tiebreak=None) -> float | None:
    y_r, w_r, _ = _ranked(y, s, w, tiebreak)
    tp = np.cumsum(w_r * y_r)
    fp = np.cumsum(w_r * (1 - y_r))
    hit = np.nonzero(tp >= target * tp[-1] - 1e-9)[0]
    return float(fp[hit[0]] / tp[hit[0]]) if len(hit) and tp[hit[0]] else None


def at_threshold(y, p, w, cut) -> dict:
    y, p, w = np.asarray(y, float), np.asarray(p, float), np.asarray(w, float)
    flag = p >= cut
    tp = float((w * y)[flag].sum())
    fp = float((w * (1 - y))[flag].sum())
    return {
        "threshold": cut,
        "precision": tp / (tp + fp) if tp + fp else 0.0,
        "recall": tp / float((w * y).sum()),
        "alert_rate": float(w[flag].sum() / w.sum()),
    }


def rules_score(frame: pd.DataFrame) -> np.ndarray:
    """Hand-set points, not fitted to labels: a transparent single-payment baseline."""
    amount = frame["amount"].to_numpy(float)
    points = np.select([amount >= 500, amount >= 200, amount >= 100], [3, 2, 1], 0)
    points += 2 * (frame["channel"] == "Online Transaction").to_numpy()
    hour = pd.to_numeric(frame.get("hour", pd.Series(12, index=frame.index)), errors="coerce").fillna(12).to_numpy()
    points += (hour < 6).astype(int)
    if "errors" in frame:
        points += 3 * frame["errors"].fillna("").astype(str).str.strip().ne("").to_numpy()
    points += 2 * (frame["card_prior_visits_here"] == 0).to_numpy()
    points += 2 * (frame["card_small_payments_24h"] >= 3).to_numpy()
    return points.astype(float)


def summarize(label, y, s, w, amount, rate, probability=True, tiebreak=None) -> dict:
    return {
        "label": label,
        "auc_roc": roc_auc(y, s, w),
        "auc_pr": average_precision(y, s, w),
        "at_alert_rate": at_alert_rate(y, s, w, amount, rate, tiebreak),
        "at_threshold": at_threshold(y, s, w, 0.5) if probability else None,
    }


def xgb_only(graph: Path, test: pd.DataFrame, node_x: dict, params: dict, device: str):
    """Same XGBoost features as the GNN pipeline minus the GNN embeddings."""
    import xgboost as xgb

    def features(split: Path, src, dst, rows=None):
        attr = pd.read_csv(split / "edges" / "account_transacts_merchant_attr.csv").to_numpy(np.float32)
        return np.hstack([node_x["account"][src], node_x["merchant"][dst], attr if rows is None else attr[rows]])

    train = pd.read_csv(graph / "cases.csv")
    x_train = features(graph, train["src"].to_numpy(), train["dst"].to_numpy())
    y_train = train["is_fraud"].to_numpy()
    split = int(len(train) * 0.9)
    booster = xgb.train(
        {"objective": "binary:logistic", "eval_metric": ["auc", "aucpr", "logloss"], "tree_method": "hist",
         "device": device, "max_depth": params["max_depth"], "learning_rate": params["learning_rate"]},
        xgb.DMatrix(x_train[:split], label=y_train[:split]),
        num_boost_round=params["num_boost_round"],
        evals=[(xgb.DMatrix(x_train[split:], label=y_train[split:]), "val")],
        early_stopping_rounds=params["early_stopping_rounds"],
        verbose_eval=False,
    )
    x_test = features(graph / "test_gnn", test["src"].to_numpy(), test["dst"].to_numpy(), test["test_row"].to_numpy())
    return booster.predict(xgb.DMatrix(x_test), iteration_range=(0, booster.best_iteration + 1)), booster.best_iteration + 1


def main() -> None:
    from select_studio_cases import history_features

    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", type=Path, default=Path("/data"))
    parser.add_argument("--output", type=Path, default=Path("/workspace/output"))
    parser.add_argument("--out", type=Path, default=Path("/workspace/cache/backtest.json"))
    parser.add_argument("--legit-sample", type=int, default=20000)
    parser.add_argument("--alert-rate", type=float, default=0.005)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    started = time.perf_counter()

    test = pd.read_csv(args.graph / "test_gnn" / "cases.csv")
    test["test_row"] = np.arange(len(test))
    test = history_features(pd.read_csv(args.graph / "cases.csv"), test)
    test_attr = pd.read_csv(args.graph / "test_gnn" / "edges" / "account_transacts_merchant_attr.csv").to_numpy(np.float32)
    fraud = test[test["is_fraud"] == 1]
    legit_all = test[test["is_fraud"] == 0]
    legit = legit_all.sample(n=min(args.legit_sample, len(legit_all)), random_state=args.seed)
    sample = pd.concat([fraud, legit]).sample(frac=1, random_state=args.seed).reset_index(drop=True)
    legit_weight = len(legit_all) / max(len(legit), 1)
    y = sample["is_fraud"].to_numpy()
    w = np.where(y == 1, 1.0, legit_weight)
    amount = sample["amount"].to_numpy(float)
    seconds = {"history_features": round(time.perf_counter() - started, 1)}

    from infer_server import Engine

    t0 = time.perf_counter()
    engine = Engine(device=args.device, data=args.graph, output=args.output)
    seconds["engine_load"] = round(time.perf_counter() - t0, 1)
    t0 = time.perf_counter()
    gnn = np.array([
        engine.score(r.src, r.dst, test_attr[r.test_row], r.ts, explain=False)["probability"]
        for r in sample.itertuples()
    ])
    seconds["gnn_xgb_scoring"] = round(time.perf_counter() - t0, 1)

    params = {"num_boost_round": 200, "max_depth": 6, "learning_rate": 0.1, "early_stopping_rounds": 30}
    t0 = time.perf_counter()
    xgb_scores, xgb_rounds = xgb_only(args.graph, sample, engine.node_x, params, args.device)
    seconds["xgb_only_train_and_score"] = round(time.perf_counter() - t0, 1)
    rules = rules_score(sample)

    models = {
        "rules": summarize("Rules baseline (hand-set points)", y, rules, w, amount, args.alert_rate,
                           probability=False, tiebreak=amount),
        "xgboost_only": summarize("XGBoost only (no graph embeddings)", y, xgb_scores, w, amount, args.alert_rate),
        "gnn_xgboost": summarize("GraphSAGE + XGBoost", y, gnn, w, amount, args.alert_rate),
    }
    target = models["rules"]["at_alert_rate"]["recall"]
    for name, scores, tb in (("rules", rules, amount), ("xgboost_only", xgb_scores, None), ("gnn_xgboost", gnn, None)):
        models[name]["false_positives_per_true_positive_at_rules_recall"] = fp_per_tp_at_recall(y, scores, w, target, tb)

    result = {
        "dataset": "IBM TabFormer card_transaction.v1.csv (synthetic)",
        "window": {"from": str(pd.Timestamp(test["ts"].min())), "to": str(pd.Timestamp(test["ts"].max()))},
        "test_payments": int(len(test)),
        "test_fraud": int(len(fraud)),
        "test_fraud_amount": round(float(fraud["amount"].sum()), 2),
        "sample": {"fraud": int(len(fraud)), "legit": int(len(legit)), "legit_weight": legit_weight,
                   "seed": args.seed, "method": "all fraud-labelled payments + uniform legit sample, re-weighted"},
        "alert_rate": args.alert_rate,
        "point_in_time": True,
        "xgboost_only_rounds": int(xgb_rounds),
        "models": models,
        "device": args.device,
        "seconds": seconds,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2))
    print(json.dumps({k: {m: round(v["at_alert_rate"]["fraud_amount_caught_share"], 3) for m, v in models.items()}
                      for k in ["fraud_amount_caught_share"]}), flush=True)
    print(f"wrote {args.out}", flush=True)


if __name__ == "__main__":
    main()
