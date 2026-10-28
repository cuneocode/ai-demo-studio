"""Offline checks for the M4 scripts on a synthetic TabFormer-shaped CSV.

Run: uv run --no-project --with numpy --with pandas --with pytest \
       pytest services/fraud/scripts/tests
"""
from __future__ import annotations

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import backtest  # noqa: E402
import temporal_graph as tg  # noqa: E402
from select_studio_cases import history_features  # noqa: E402

EDGE_TYPES = [("account", "transacts", "merchant"), ("merchant", "rev_transacts", "account")]


def synthetic_tabformer(path: Path, seed: int = 1) -> None:
    rng = np.random.default_rng(seed)
    rows = []
    days = pd.date_range("2019-01-01", "2019-10-31", freq="D")
    for _ in range(6000):
        day = days[rng.integers(len(days))]
        user, card = int(rng.integers(40)), int(rng.integers(2))
        merchant = int(rng.integers(30))
        fraud = rng.random() < 0.01
        if day >= pd.Timestamp("2019-07-01") and rng.random() < 0.05:
            merchant, fraud = 999, rng.random() < 0.5
        rows.append((user, card, day, int(rng.integers(24)), int(rng.integers(60)),
                     float(rng.gamma(2, 40)), str(rng.choice(["Chip Transaction", "Swipe Transaction", "Online Transaction"])),
                     merchant, fraud))
    for k in range(5):
        rows.append((7, 0, pd.Timestamp("2019-09-20"), 10, k, 1.5, "Online Transaction", 555, False))
    rows.append((7, 0, pd.Timestamp("2019-09-20"), 11, 0, 894.0, "Online Transaction", 556, True))
    rows.append((3, 1, pd.Timestamp("2018-05-01"), 9, 0, 10.0, "Chip Transaction", 1, False))
    frame = pd.DataFrame({
        "User": [r[0] for r in rows], "Card": [r[1] for r in rows],
        "Year": [r[2].year for r in rows], "Month": [r[2].month for r in rows], "Day": [r[2].day for r in rows],
        "Time": [f"{r[3]:02d}:{r[4]:02d}" for r in rows], "Amount": [f"${r[5]:.2f}" for r in rows],
        "Use Chip": [r[6] for r in rows], "Merchant Name": [str(-1000 - r[7] * 7919) for r in rows],
        "Merchant City": "X", "Merchant State": "CA", "Zip": "94000", "MCC": "5411",
        "Errors?": ["Bad CVV," if r[8] and i % 3 == 0 else "" for i, r in enumerate(rows)],
        "Is Fraud?": ["Yes" if r[8] else "No" for r in rows],
    })
    frame.to_csv(path, index=False)


@pytest.fixture(scope="module")
def graph(tmp_path_factory) -> Path:
    root = tmp_path_factory.mktemp("m4")
    csv = root / "card_transaction.v1.csv"
    synthetic_tabformer(csv)
    subprocess.run([sys.executable, str(SCRIPTS / "preprocess_tabformer_v3.py"), "--csv", str(csv),
                    "--out", str(root / "graph")], check=True)
    return root / "graph"


def test_preprocess_layout(graph: Path):
    stats = json.loads((graph.parent / "preprocess_stats.json").read_text())
    assert not (graph / "preprocess_stats.json").exists()
    assert stats["train"]["to"] <= "2019-08-31" < stats["test"]["from"]
    assert stats["rows_read"] > stats["train"]["edges"] + stats["test"]["edges"] - 1
    for split in (graph, graph / "test_gnn"):
        cases = pd.read_csv(split / "cases.csv")
        edges = pd.read_csv(split / "edges" / "account_transacts_merchant.csv")
        assert len(cases) == len(edges)
        assert pd.to_datetime(cases["ts"]).is_monotonic_increasing
        assert (cases[["src", "dst"]].to_numpy() == edges.to_numpy()).all()
        assert sorted(p.name for p in (split / "edges").iterdir()) == [
            "account_transacts_merchant.csv", "account_transacts_merchant_attr.csv",
            "account_transacts_merchant_label.csv",
        ]


def test_temporal_sampling_never_sees_the_future(graph: Path):
    edge_idx, edge_ts, splits = tg.load_history(graph, EDGE_TYPES)
    assert len(splits) == 2
    counts = {"account": int(edge_idx[EDGE_TYPES[0]][0].max()) + 1, "merchant": int(edge_idx[EDGE_TYPES[0]][1].max()) + 1}
    node_x = {nt: np.zeros((n, 3), np.float32) for nt, n in counts.items()}
    adj = tg.build_adjacency(edge_idx, edge_ts, counts)
    test = pd.read_csv(graph / "test_gnn" / "cases.csv")
    pair_first_ts = {}
    src, dst = edge_idx[EDGE_TYPES[0]]
    for s, d, t in zip(src.tolist(), dst.tolist(), edge_ts[EDGE_TYPES[0]].tolist()):
        pair_first_ts[(s, d)] = min(t, pair_first_ts.get((s, d), t))
    for row in test.sample(40, random_state=0).itertuples():
        as_of = tg.to_epoch(row.ts)
        for table in adj.values():
            for node in range(min(len(table.indptr) - 1, 50)):
                nbrs = table.before(node, as_of)
                lo = table.indptr[node]
                assert (table.ts[lo:lo + len(nbrs)] < as_of).all()
        sub_x, sub_e, local = tg.sample_subgraph(
            {"account": [row.src], "merchant": [row.dst]}, node_x, adj, [15, 10],
            tg.request_rng(row.src, row.dst, as_of), as_of,
        )
        inv = {nt: {i: n for n, i in m.items()} for nt, m in local.items()}
        a_s, m_d = sub_e[EDGE_TYPES[0]]
        for ls, ld in zip(a_s.tolist(), m_d.tolist()):
            assert pair_first_ts[(inv["account"][ls], inv["merchant"][ld])] < as_of
        m_s, a_d = sub_e[EDGE_TYPES[1]]
        for ls, ld in zip(m_s.tolist(), a_d.tolist()):
            assert pair_first_ts[(inv["account"][ld], inv["merchant"][ls])] < as_of
        assert sub_x["account"].shape[0] == len(local["account"])
    earliest = int(min(t.min() for t in edge_ts.values()))
    _, sub_e, _ = tg.sample_subgraph({"account": [0], "merchant": [0]}, node_x, adj, [15, 10],
                                     tg.request_rng(0, 0, earliest), earliest)
    assert all(len(a) == 0 for a, _ in sub_e.values())
    _, sub_e, _ = tg.sample_subgraph({"account": [0], "merchant": [0]}, node_x, adj, [15, 10],
                                     tg.request_rng(0, 0, None), None)
    assert sum(len(a) for a, _ in sub_e.values()) > 0


def test_sampling_is_deterministic_per_payment(graph: Path):
    edge_idx, edge_ts, _ = tg.load_history(graph, EDGE_TYPES)
    counts = {"account": int(edge_idx[EDGE_TYPES[0]][0].max()) + 1, "merchant": int(edge_idx[EDGE_TYPES[0]][1].max()) + 1}
    node_x = {nt: np.zeros((n, 1), np.float32) for nt, n in counts.items()}
    adj = tg.build_adjacency(edge_idx, edge_ts, counts)
    runs = [tg.sample_subgraph({"account": [1], "merchant": [2]}, node_x, adj, [3, 2],
                               tg.request_rng(1, 2, 1569000000), 1569000000)[1] for _ in range(2)]
    for et in runs[0]:
        assert (runs[0][et][0] == runs[1][et][0]).all()


def test_studio_cases_hide_the_label(graph: Path, tmp_path: Path):
    out = tmp_path / "studio_cases.json"
    subprocess.run([sys.executable, str(SCRIPTS / "select_studio_cases.py"), "--graph", str(graph), "--out", str(out)],
                   check=True)
    cases = json.loads(out.read_text())
    assert len(cases) >= 5
    assert {"cpp", "card_testing", "clean_control"} <= {c["scenario"] for c in cases}
    assert [c["as_of"] for c in cases] == sorted(c["as_of"] for c in cases)
    for case in cases:
        public = " ".join(str(case[k]) for k in ("label", "account", "merchant", "neighborhood", "hint")).lower()
        assert "labeled" not in public and "legit" not in public
        assert "fraud" not in case["label"].lower()
        assert case["tabformer_label"] in {"fraud", "legit"}
        assert len(case["edge_attr"]) > 3
    card_testing = next(c for c in cases if c["scenario"] == "card_testing")
    assert card_testing["history"]["card_small_payments_24h"] >= 3


def test_history_features_use_only_the_past(graph: Path):
    train = pd.read_csv(graph / "cases.csv")
    test = pd.read_csv(graph / "test_gnn" / "cases.csv")
    feats = history_features(train, test)
    allh = pd.concat([train, test])
    allh["ts"] = pd.to_datetime(allh["ts"])
    for row in feats.sample(30, random_state=2).itertuples():
        ts = pd.Timestamp(row.ts)
        before = allh[allh["ts"] < ts]
        card = before[before["account"] == row.account]
        assert row.card_prior_payments >= len(card)
        assert row.card_prior_fraud <= int(allh[(allh["ts"] <= ts) & (allh["account"] == row.account)]["is_fraud"].sum())


def test_metrics_match_bruteforce():
    rng = np.random.default_rng(3)
    y = (rng.random(400) < 0.2).astype(int)
    s = np.round(rng.random(400) + 0.4 * y, 2)
    w = rng.choice([1.0, 5.0], size=400)
    pos, neg = np.nonzero(y == 1)[0], np.nonzero(y == 0)[0]
    num = sum(w[i] * w[j] * (1.0 if s[i] > s[j] else 0.5 if s[i] == s[j] else 0.0) for i in pos for j in neg)
    assert backtest.roc_auc(y, s, w) == pytest.approx(num / (w[pos].sum() * w[neg].sum()))
    ap = 0.0
    for t in sorted(set(s), reverse=True):
        flag = s >= t
        tp = (w * y)[flag].sum()
        new_tp = (w * y)[s == t].sum()
        ap += tp / w[flag].sum() * new_tp / (w * y).sum()
    assert backtest.average_precision(y, s, w) == pytest.approx(ap)
    perfect = backtest.at_alert_rate(y, y.astype(float), np.ones_like(w), np.ones(400), y.mean())
    assert perfect["recall"] == pytest.approx(1.0) and perfect["precision"] == pytest.approx(1.0)
    assert backtest.fp_per_tp_at_recall(y, y.astype(float), np.ones_like(w), 1.0) == pytest.approx(0.0)


def test_rules_score_on_history(graph: Path):
    test = history_features(pd.read_csv(graph / "cases.csv"), pd.read_csv(graph / "test_gnn" / "cases.csv"))
    scores = backtest.rules_score(test)
    assert len(scores) == len(test) and scores.max() > scores.min()


def test_model_card_partial_and_full(tmp_path: Path):
    cache = tmp_path / ".cache"
    (cache / "train").mkdir(parents=True)
    run = [sys.executable, str(SCRIPTS / "build_model_card.py"), "--cache", str(cache)]
    subprocess.run(run, check=True)
    card = json.loads((cache / "model_card.json").read_text())
    assert card["status"] == "partial" and card["headline"]["train_minutes"] is None
    (cache / "preprocess_stats.json").write_text(json.dumps({"seconds": 90.0, "train": {"edges": 10}}))
    (cache / "train" / "train_run.json").write_text(json.dumps({"seconds": 600, "gnn_trained": True}))
    (cache / "train" / "metrics.json").write_text(json.dumps({"auc": 0.9}))
    model = {"auc_roc": 0.9, "auc_pr": 0.5, "at_alert_rate": {"fraud_amount_caught_share": 0.6, "recall": 0.7}}
    (cache / "backtest.json").write_text(json.dumps({"alert_rate": 0.005, "models": {"gnn_xgboost": model}}))
    (cache / "bench.json").write_text(json.dumps({"devices": {"cuda": {"latency_ms": {"total_ms": {"p50": 4.2, "p95": 7.0}}}}}))
    (cache / "hardware.json").write_text(json.dumps({"gpu": "NVIDIA GB10"}))
    subprocess.run(run, check=True)
    card = json.loads((cache / "model_card.json").read_text())
    assert card["status"] == "measured" and card["missing"] == []
    assert card["headline"]["train_minutes"] == 10.0
    assert card["headline"]["fraud_amount_caught_share"]["gnn_xgboost"] == 0.6
    assert card["headline"]["score_p50_ms"] == {"cuda": 4.2, "cpu": None}


def test_record_scores_against_stub(tmp_path: Path):
    class Stub(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, body: dict):
            data = json.dumps(body).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self._send({"status": "ok", "backend": "gnn_xgb", "device": "cuda"})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            assert body["case"]["as_of"] and body["case_id"] == body["case"]["id"]
            self._send({"probability": 0.42, "shap": [{"feature": "amount", "value": 0.1, "direction": "risk"}],
                        "timing_ms": {"total_ms": 3.0}, "device": "cuda", "temporal_filter": True})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Stub)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    cases = tmp_path / "studio_cases.json"
    cases.write_text(json.dumps([{"id": "tabformer-0000001", "src": 1, "dst": 2, "edge_attr": [1.0], "as_of": "2019-09-02T10:00:00"}]))
    out = tmp_path / "scores.json"
    subprocess.run([sys.executable, str(SCRIPTS / "record_scores.py"), "--url", f"http://127.0.0.1:{server.server_port}",
                    "--cases", str(cases), "--out", str(out)], check=True)
    server.shutdown()
    scores = json.loads(out.read_text())
    assert scores["tabformer-0000001"]["probability"] == 0.42
    assert scores["tabformer-0000001"]["temporal_filter"] is True
