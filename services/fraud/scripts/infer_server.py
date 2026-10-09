#!/usr/bin/env python3
"""Live NVIDIA GraphSAGE + XGBoost scorer with point-in-time neighbourhoods.

Runs inside nvcr.io/nvidia/cugraph/financial-fraud-training so the studio
hits the trained GNN/XGB artifacts, not fixture scores.

POST /score {"case": {"src", "dst", "edge_attr", "as_of"}}: the neighbourhood is
sampled from payments strictly before ``as_of`` (training split + test window).
Explanations are exact XGBoost TreeSHAP (log-odds), summed per feature group.
"""
from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import xgboost as xgb

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, "/workspace/mnmg")
from gnn_arch import LinkPredictionModel  # noqa: E402
from temporal_graph import build_adjacency, load_history, request_rng, sample_subgraph, to_epoch  # noqa: E402

OUTPUT = Path(os.getenv("FRAUD_OUTPUT", "/workspace/output"))
DATA = Path(os.getenv("FRAUD_GRAPH_DATA", "/data"))
PORT = int(os.getenv("FRAUD_INFER_PORT", "8000"))
DEVICE = os.getenv("FRAUD_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")


def _cfg(output: Path) -> dict:
    for candidate in (
        output / "infer/triton/gnn_embedder/1/model_config.json",
        output / "model_config.json",
    ):
        if candidate.is_file():
            return json.loads(candidate.read_text())
    return {
        "node_types": ["account", "merchant"],
        "edge_types": [
            ["account", "transacts", "merchant"],
            ["merchant", "rev_transacts", "account"],
        ],
        "edge_type_to_predict": ["account", "transacts", "merchant"],
        "num_features": {"account": 4, "merchant": 4},
        "hidden_channels": 64,
        "num_layers": 2,
        "num_neighbors": [15, 10],
        "conv_type": "sage",
        "heads": 1,
        "concat": True,
        "only_raw_node_features_in_embedding": False,
        "no_raw_node_features_in_embedding": False,
        "edge_attr_dim": 6,
    }


class Engine:
    def __init__(self, device: str = DEVICE, data: Path = DATA, output: Path = OUTPUT):
        self.cfg = _cfg(output)
        self.device = torch.device(device)
        self.src_type, self.rel, self.dst_type = self.cfg["edge_type_to_predict"]
        self.edge_types = [tuple(et) for et in self.cfg["edge_types"]]
        self.node_types = self.cfg["node_types"]
        self.num_neighbors = self.cfg.get("inf_num_neighbors") or self.cfg.get("num_neighbors") or [15, 10]
        self.lock = threading.Lock()

        self.edge_idx, self.edge_ts, splits = load_history(data, self.edge_types)
        node_dir = splits[0] / "nodes"
        self.node_x = {
            nt: pd.read_csv(node_dir / f"{nt}.csv").select_dtypes(include=[np.number]).to_numpy(np.float32)
            for nt in self.node_types
        }
        self.adj = build_adjacency(self.edge_idx, self.edge_ts, {nt: len(x) for nt, x in self.node_x.items()})
        self.history = {
            "splits": [str(p) for p in splits],
            "edges": int(len(next(iter(self.edge_ts.values())))),
            "from": str(np.datetime64(int(min(t.min() for t in self.edge_ts.values())), "s")),
            "to": str(np.datetime64(int(max(t.max() for t in self.edge_ts.values())), "s")),
        }

        model = LinkPredictionModel(
            graph_schema=(self.node_types, self.edge_types),
            hidden_channels=self.cfg["hidden_channels"],
            edge_type_to_predict=tuple(self.cfg["edge_type_to_predict"]),
            num_features=self.cfg["num_features"],
            num_layers=self.cfg["num_layers"],
            conv_type=self.cfg["conv_type"],
            heads=self.cfg.get("heads", 1),
            concat=self.cfg.get("concat", True),
        )
        state = torch.load(output / "model_final.pt", map_location=self.device, weights_only=True)
        state = {key.removeprefix("module."): value for key, value in state.items()}
        model.load_state_dict(state)
        model.eval().to(self.device)
        self.embedder = model.gnn
        self.only_raw = self.cfg.get("only_raw_node_features_in_embedding", False)
        self.no_raw = self.cfg.get("no_raw_node_features_in_embedding", False)

        self.booster = xgb.Booster()
        self.booster.load_model(str(output / "xgboost_fraud.json"))
        self.booster.set_param({"device": "cuda" if self.device.type == "cuda" else "cpu"})
        names_path = output / "feature_names.json"
        self.feature_names = json.loads(names_path.read_text()) if names_path.is_file() else None
        self.feature_groups = json.loads((output / "feature_map.json").read_text())["feature_groups"]
        self.ready = True
        print(f"infer_server ready device={self.device} history={self.history} "
              f"nodes={ {nt: x.shape[0] for nt, x in self.node_x.items()} }", flush=True)

    def _sync(self):
        if self.device.type == "cuda":
            torch.cuda.synchronize(self.device)

    def embed(self, src: int, dst: int, attr: np.ndarray, as_of: int | None) -> tuple[np.ndarray, dict]:
        t0 = time.perf_counter()
        seeds = {self.src_type: [src]}
        seeds.setdefault(self.dst_type, []).append(dst)
        sub_x, sub_e, local = sample_subgraph(
            seeds, self.node_x, self.adj, self.num_neighbors, request_rng(src, dst, as_of), as_of,
        )
        t1 = time.perf_counter()
        x_dict = {nt: torch.as_tensor(sub_x[nt], device=self.device) for nt in self.node_types}
        edge_index = {
            et: torch.stack([
                torch.as_tensor(sub_e[et][0], dtype=torch.long, device=self.device),
                torch.as_tensor(sub_e[et][1], dtype=torch.long, device=self.device),
            ])
            for et in self.edge_types
        }
        lbl_src = torch.as_tensor([local[self.src_type][src]], dtype=torch.long, device=self.device)
        lbl_dst = torch.as_tensor([local[self.dst_type][dst]], dtype=torch.long, device=self.device)
        with torch.no_grad():
            node_emb = self.embedder(x_dict, edge_index)
            src_raw = x_dict[self.src_type][lbl_src]
            dst_raw = x_dict[self.dst_type][lbl_dst]
            if self.only_raw:
                parts = [src_raw, dst_raw]
            else:
                parts = [node_emb[self.src_type][lbl_src], node_emb[self.dst_type][lbl_dst]]
                if not self.no_raw:
                    parts += [src_raw, dst_raw]
            parts.append(torch.as_tensor(attr.reshape(1, -1), device=self.device))
            features = torch.cat(parts, dim=-1).float().cpu().numpy()
        self._sync()
        t2 = time.perf_counter()
        sampled = {f"{et[0]}_{et[1]}_{et[2]}": int(len(sub_e[et][0])) for et in self.edge_types}
        return features, {"sample_ms": (t1 - t0) * 1e3, "gnn_ms": (t2 - t1) * 1e3, "sampled_edges": sampled}

    def predict(self, features: np.ndarray) -> np.ndarray:
        return self.booster.predict(xgb.DMatrix(features, feature_names=self.feature_names))

    def explain(self, features: np.ndarray) -> tuple[list[dict], float]:
        contribs = self.booster.predict(
            xgb.DMatrix(features, feature_names=self.feature_names), pred_contribs=True,
        )[0]
        shap = []
        for gid, group in enumerate(self.feature_groups):
            value = float(contribs[group["indices"]].sum())
            shap.append({
                "feature": group.get("original_name") or group.get("label") or f"group_{gid}",
                "value": value,
                "direction": "risk" if value >= 0 else "protective",
            })
        return shap, float(contribs[-1])

    def score(self, src: int, dst: int, attr, as_of=None, explain: bool = True) -> dict:
        as_of_s = to_epoch(as_of)
        with self.lock:
            t0 = time.perf_counter()
            features, timing = self.embed(int(src), int(dst), np.asarray(attr, dtype=np.float32), as_of_s)
            t1 = time.perf_counter()
            probability = float(self.predict(features)[0])
            t2 = time.perf_counter()
            shap, base = self.explain(features) if explain else ([], None)
            t3 = time.perf_counter()
        timing.update({"xgb_ms": (t2 - t1) * 1e3, "explain_ms": (t3 - t2) * 1e3, "total_ms": (t3 - t0) * 1e3})
        return {
            "probability": probability,
            "shap": shap,
            "explain": {"method": "xgboost_treeshap", "units": "log_odds", "base_value": base},
            "as_of": None if as_of_s is None else str(np.datetime64(as_of_s, "s")),
            "temporal_filter": as_of_s is not None,
            "device": str(self.device),
            "timing_ms": {k: (round(v, 3) if isinstance(v, float) else v) for k, v in timing.items()},
        }


ENGINE: Engine | None = None


def _json(handler: BaseHTTPRequestHandler, code: int, payload: dict):
    body = json.dumps(payload).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        if self.path in {"/health", "/v2/health/ready"}:
            if ENGINE and ENGINE.ready:
                _json(self, 200, {
                    "status": "ok",
                    "backend": "gnn_xgb",
                    "device": str(ENGINE.device),
                    "temporal_filter": True,
                    "explain": "xgboost_treeshap",
                    "history": ENGINE.history,
                })
            else:
                _json(self, 503, {"status": "starting"})
            return
        _json(self, 404, {"detail": "not found"})

    def do_POST(self):
        if self.path != "/score":
            _json(self, 404, {"detail": "not found"})
            return
        if ENGINE is None or not ENGINE.ready:
            _json(self, 503, {"detail": "GNN scorer is still loading."})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            case = payload.get("case") or payload
            _json(self, 200, ENGINE.score(case["src"], case["dst"], case["edge_attr"], case.get("as_of")))
        except Exception as exc:
            traceback.print_exc()
            _json(self, 500, {"detail": str(exc)})


def main():
    global ENGINE
    ENGINE = Engine()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"infer_server listening on :{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
