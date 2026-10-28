"""Smoke-test infer_server/backtest/bench plumbing with a stand-in for the image's gnn_arch.

Skipped unless torch and xgboost are importable:
  uv run --no-project --with numpy --with pandas --with pytest --with torch --with xgboost \
    pytest services/fraud/scripts/tests
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

torch = pytest.importorskip("torch")
xgb = pytest.importorskip("xgboost")

SCRIPTS = Path(__file__).resolve().parents[1]
GNN_ARCH = '''
import torch
from torch import nn

class _Gnn(nn.Module):
    def __init__(self, num_features, hidden, edge_types):
        super().__init__()
        self.lin = nn.ModuleDict({nt: nn.Linear(n, hidden) for nt, n in num_features.items()})
        self.edge_types = edge_types

    def forward(self, x_dict, edge_index_dict):
        out = {nt: self.lin[nt](x) for nt, x in x_dict.items()}
        for (src, _, dst), index in edge_index_dict.items():
            if index.shape[1]:
                out[dst] = out[dst].index_add(0, index[1], out[src][index[0]])
        return out

class LinkPredictionModel(nn.Module):
    def __init__(self, graph_schema, hidden_channels, edge_type_to_predict, num_features, num_layers,
                 conv_type, heads=1, concat=True):
        super().__init__()
        self.gnn = _Gnn(num_features, hidden_channels, graph_schema[1])
'''


@pytest.fixture(scope="module")
def trained(tmp_path_factory, request):
    from test_m4_offline import synthetic_tabformer

    import subprocess

    root = tmp_path_factory.mktemp("engine")
    synthetic_tabformer(root / "tab.csv")
    subprocess.run([sys.executable, str(SCRIPTS / "preprocess_tabformer_v3.py"), "--csv", str(root / "tab.csv"),
                    "--out", str(root / "graph")], check=True)
    stub = root / "mnmg"
    stub.mkdir()
    (stub / "gnn_arch.py").write_text(GNN_ARCH)
    sys.path.insert(0, str(stub))
    from gnn_arch import LinkPredictionModel

    graph, out = root / "graph", root / "train"
    out.mkdir()
    n_acc = pd.read_csv(graph / "nodes" / "account.csv").shape[1]
    n_mer = pd.read_csv(graph / "nodes" / "merchant.csv").shape[1]
    n_attr = pd.read_csv(graph / "edges" / "account_transacts_merchant_attr.csv").shape[1]
    hidden = 8
    cfg = {
        "node_types": ["account", "merchant"],
        "edge_types": [["account", "transacts", "merchant"], ["merchant", "rev_transacts", "account"]],
        "edge_type_to_predict": ["account", "transacts", "merchant"],
        "num_features": {"account": n_acc, "merchant": n_mer},
        "hidden_channels": hidden, "num_layers": 2, "num_neighbors": [5, 3], "conv_type": "sage",
    }
    (out / "model_config.json").write_text(json.dumps(cfg))
    model = LinkPredictionModel((cfg["node_types"], [tuple(e) for e in cfg["edge_types"]]), hidden,
                                tuple(cfg["edge_type_to_predict"]), cfg["num_features"], 2, "sage")
    torch.save(model.state_dict(), out / "model_final.pt")
    width = 2 * hidden + n_acc + n_mer + n_attr
    spans = [("account_gnn_embedding", 0, hidden), ("merchant_gnn_embedding", hidden, 2 * hidden),
             ("raw_account_features", 2 * hidden, 2 * hidden + n_acc),
             ("raw_merchant_features", 2 * hidden + n_acc, 2 * hidden + n_acc + n_mer),
             ("transaction_features", 2 * hidden + n_acc + n_mer, width)]
    (out / "feature_map.json").write_text(json.dumps(
        {"feature_groups": [{"original_name": n, "indices": list(range(a, b))} for n, a, b in spans]}))
    rng = np.random.default_rng(0)
    x = rng.normal(size=(500, width)).astype(np.float32)
    booster = xgb.train({"objective": "binary:logistic", "max_depth": 3},
                        xgb.DMatrix(x, label=(x[:, -n_attr] > 0.5).astype(int)), num_boost_round=10)
    booster.save_model(str(out / "xgboost_fraud.json"))
    sys.path.insert(0, str(SCRIPTS))
    return graph, out, root


def test_engine_scores_point_in_time(trained):
    from infer_server import Engine

    graph, out, _ = trained
    engine = Engine(device="cpu", data=graph, output=out)
    assert len(engine.history["splits"]) == 2
    case = pd.read_csv(graph / "test_gnn" / "cases.csv").iloc[-1]
    attr = pd.read_csv(graph / "test_gnn" / "edges" / "account_transacts_merchant_attr.csv").iloc[-1].to_numpy()
    first = engine.score(case.src, case.dst, attr, case.ts)
    again = engine.score(case.src, case.dst, attr, case.ts)
    assert 0 <= first["probability"] <= 1 and first["probability"] == again["probability"]
    assert first["temporal_filter"] and first["as_of"].startswith(str(case.ts)[:10])
    assert [g["feature"] for g in first["shap"]][0] == "account_gnn_embedding"
    contribs = sum(g["value"] for g in first["shap"]) + first["explain"]["base_value"]
    assert 1 / (1 + np.exp(-contribs)) == pytest.approx(first["probability"], abs=1e-5)
    assert {"sample_ms", "gnn_ms", "xgb_ms", "explain_ms", "total_ms"} <= set(first["timing_ms"])


def test_backtest_and_bench_run(trained, monkeypatch):
    import backtest
    import bench_score

    graph, out, root = trained
    monkeypatch.setattr(sys, "argv", ["backtest", "--graph", str(graph), "--output", str(out),
                                      "--out", str(root / "backtest.json"), "--device", "cpu", "--legit-sample", "300"])
    backtest.main()
    result = json.loads((root / "backtest.json").read_text())
    assert set(result["models"]) == {"rules", "xgboost_only", "gnn_xgboost"}
    for model in result["models"].values():
        assert 0 <= model["auc_roc"] <= 1 and 0 <= model["at_alert_rate"]["fraud_amount_caught_share"] <= 1
    monkeypatch.setattr(sys, "argv", ["bench", "--graph", str(graph), "--output", str(out),
                                      "--out", str(root / "bench.json"), "--devices", "cpu", "--n", "20", "--warmup", "2"])
    bench_score.main()
    bench = json.loads((root / "bench.json").read_text())
    assert bench["devices"]["cpu"]["latency_ms"]["total_ms"]["p50"] > 0
