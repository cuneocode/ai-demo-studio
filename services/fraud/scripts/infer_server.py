#!/usr/bin/env python3
"""Live NVIDIA GraphSAGE + XGBoost + Shapley scorer.

Runs inside nvcr.io/nvidia/cugraph/financial-fraud-training so the studio
hits the trained GNN/XGB artifacts, not fixture scores.
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import xgboost as xgb

sys.path.insert(0, "/workspace/mnmg")
from gnn_arch import LinkPredictionModel  # noqa: E402

try:
    from captum.attr import ShapleyValueSampling
    CAPTUM = True
except ImportError:
    CAPTUM = False

OUTPUT = Path(os.getenv("FRAUD_OUTPUT", "/workspace/output"))
DATA = Path(os.getenv("FRAUD_GRAPH_DATA", "/data/test_gnn"))
if not (DATA / "nodes").is_dir():
    DATA = Path("/data")
PORT = int(os.getenv("FRAUD_INFER_PORT", "8000"))
SVS_SAMPLES = int(os.getenv("FRAUD_SVS_SAMPLES", "25"))


def _cfg() -> dict:
    for candidate in (
        OUTPUT / "infer/triton/gnn_embedder/1/model_config.json",
        OUTPUT / "model_config.json",
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


def _load_edges(edge_dir: Path, et: list[str]) -> tuple[np.ndarray, np.ndarray]:
    src_type, rel, dst_type = et
    if rel.startswith("rev_"):
        csv_name = f"{dst_type}_{rel[4:]}_{src_type}.csv"
        frame = pd.read_csv(edge_dir / csv_name)
        return frame.iloc[:, 1].to_numpy(np.int64), frame.iloc[:, 0].to_numpy(np.int64)
    frame = pd.read_csv(edge_dir / f"{src_type}_{rel}_{dst_type}.csv")
    return frame.iloc[:, 0].to_numpy(np.int64), frame.iloc[:, 1].to_numpy(np.int64)


def _build_adjacency(edge_idx: dict, edge_types: list) -> dict:
    adj = {}
    for et in edge_types:
        stem = f"{et[0]}_{et[1]}_{et[2]}"
        src_arr, dst_arr = edge_idx[stem]
        if len(src_arr) == 0:
            adj[tuple(et)] = {}
            continue
        order = np.argsort(dst_arr, kind="stable")
        s_dst, s_src = dst_arr[order], src_arr[order]
        uniq, splits = np.unique(s_dst, return_index=True)
        groups = np.split(s_src, splits[1:])
        adj[tuple(et)] = {int(dst): group for dst, group in zip(uniq, groups)}
    return adj


def _sample_subgraph(batch_src, batch_dst, node_x, edge_idx, adj, edge_types,
                     src_type, dst_type, num_neighbors, rng):
    node_types = list(node_x)
    collected = {nt: set() for nt in node_types}
    collected[src_type].update(int(x) for x in batch_src)
    collected[dst_type].update(int(x) for x in batch_dst)
    frontier = {nt: set() for nt in node_types}
    frontier[src_type] = set(int(x) for x in batch_src)
    frontier[dst_type].update(int(x) for x in batch_dst)
    for n_sample in num_neighbors:
        nxt = {nt: set() for nt in node_types}
        for et in edge_types:
            src_t, _, dst_t = et
            dst_set = frontier[dst_t]
            if not dst_set:
                continue
            adj_et = adj[tuple(et)]
            for dst_id in dst_set:
                srcs = adj_et.get(dst_id)
                if srcs is None or len(srcs) == 0:
                    continue
                chosen = rng.choice(srcs, n_sample, replace=False) if n_sample >= 0 and len(srcs) > n_sample else srcs
                for src in chosen:
                    src = int(src)
                    if src not in collected[src_t]:
                        nxt[src_t].add(src)
                        collected[src_t].add(src)
        frontier = nxt
    ordered = {}
    for nt in node_types:
        seeds = ([int(x) for x in batch_src] if nt == src_type else []) + (
            [int(x) for x in batch_dst] if nt == dst_type else []
        )
        seed_list = list(dict.fromkeys(seeds))
        ordered[nt] = seed_list + sorted(collected[nt] - set(seed_list))
    luts = {}
    for nt, nodes in ordered.items():
        if nodes:
            lut = np.full(int(max(nodes)) + 1, -1, dtype=np.int64)
            lut[nodes] = np.arange(len(nodes), dtype=np.int64)
        else:
            lut = np.array([], dtype=np.int64)
        luts[nt] = lut
    sub_x = {}
    for nt, nodes in ordered.items():
        idx = np.asarray(nodes, dtype=np.int64)
        sub_x[nt] = node_x[nt][idx] if len(idx) else node_x[nt][:0]
    empty = (np.array([], dtype=np.int64), np.array([], dtype=np.int64))
    sub_e = {}
    for et in edge_types:
        stem = f"{et[0]}_{et[1]}_{et[2]}"
        src_arr, dst_arr = edge_idx[stem]
        lut_s, lut_d = luts[et[0]], luts[et[2]]
        if len(src_arr) == 0 or len(lut_s) == 0 or len(lut_d) == 0:
            sub_e[stem] = empty
            continue
        local_s = np.full(len(src_arr), -1, dtype=np.int64)
        local_d = np.full(len(dst_arr), -1, dtype=np.int64)
        ok_s, ok_d = src_arr < len(lut_s), dst_arr < len(lut_d)
        local_s[ok_s] = lut_s[src_arr[ok_s]]
        local_d[ok_d] = lut_d[dst_arr[ok_d]]
        mask = (local_s >= 0) & (local_d >= 0)
        sub_e[stem] = (local_s[mask], local_d[mask]) if mask.any() else empty
    return sub_x, sub_e, luts[src_type][batch_src], luts[dst_type][batch_dst]


class Engine:
    def __init__(self):
        self.cfg = _cfg()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.src_type, self.rel, self.dst_type = self.cfg["edge_type_to_predict"]
        self.edge_types = [tuple(et) for et in self.cfg["edge_types"]]
        self.node_types = self.cfg["node_types"]
        self.num_neighbors = self.cfg.get("num_neighbors") or [15, 10]
        self.rng = np.random.default_rng(42)

        node_dir = DATA / "nodes"
        edge_dir = DATA / "edges"
        self.node_x = {}
        for nt in self.node_types:
            numeric = pd.read_csv(node_dir / f"{nt}.csv").select_dtypes(include=[np.number])
            self.node_x[nt] = numeric.to_numpy(np.float32)
        self.edge_idx = {f"{et[0]}_{et[1]}_{et[2]}": _load_edges(edge_dir, list(et)) for et in self.edge_types}
        self.adj = _build_adjacency(self.edge_idx, self.edge_types)

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
        state = torch.load(OUTPUT / "model_final.pt", map_location=self.device, weights_only=True)
        state = {key.removeprefix("module."): value for key, value in state.items()}
        model.load_state_dict(state)
        model.eval().to(self.device)
        self.embedder = model.gnn
        self.only_raw = self.cfg.get("only_raw_node_features_in_embedding", False)
        self.no_raw = self.cfg.get("no_raw_node_features_in_embedding", False)

        self.booster = xgb.Booster()
        self.booster.load_model(str(OUTPUT / "xgboost_fraud.json"))
        names_path = OUTPUT / "feature_names.json"
        self.feature_names = json.loads(names_path.read_text()) if names_path.is_file() else None
        groups = json.loads((OUTPUT / "feature_map.json").read_text())["feature_groups"]
        self.feature_groups = groups
        n_dims = max(max(group["indices"]) for group in groups) + 1
        mask = torch.zeros(1, n_dims, dtype=torch.long)
        for gid, group in enumerate(groups):
            for idx in group["indices"]:
                mask[0, idx] = gid
        self.captum_mask = mask
        self.group_first = [(mask[0] == gid).nonzero(as_tuple=True)[0][0].item() for gid in range(len(groups))]
        baseline_path = OUTPUT / "svs_baseline.npy"
        self.baseline = torch.from_numpy(np.load(baseline_path)) if baseline_path.is_file() else None
        self.ready = True
        print(f"infer_server ready device={self.device} nodes="
              f"{ {nt: self.node_x[nt].shape[0] for nt in self.node_types} } captum={CAPTUM}", flush=True)

    def embed(self, src: int, dst: int, attr: np.ndarray) -> np.ndarray:
        batch_src = np.asarray([src], dtype=np.int64)
        batch_dst = np.asarray([dst], dtype=np.int64)
        sub_x, sub_e, loc_src, loc_dst = _sample_subgraph(
            batch_src, batch_dst, self.node_x, self.edge_idx, self.adj, self.edge_types,
            self.src_type, self.dst_type, self.num_neighbors, self.rng,
        )
        x_dict = {nt: torch.as_tensor(sub_x[nt], device=self.device) for nt in self.node_types}
        edge_index = {}
        for et in self.edge_types:
            stem = f"{et[0]}_{et[1]}_{et[2]}"
            src_arr, dst_arr = sub_e[stem]
            edge_index[et] = torch.stack([
                torch.as_tensor(src_arr, dtype=torch.long, device=self.device),
                torch.as_tensor(dst_arr, dtype=torch.long, device=self.device),
            ])
        lbl_src = torch.as_tensor(loc_src, dtype=torch.long, device=self.device)
        lbl_dst = torch.as_tensor(loc_dst, dtype=torch.long, device=self.device)
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
            return torch.cat(parts, dim=-1).float().cpu().numpy()

    def _predict_tensor(self, emb_t: torch.Tensor) -> torch.Tensor:
        matrix = xgb.DMatrix(emb_t.detach().cpu().numpy(), feature_names=self.feature_names)
        return torch.tensor(self.booster.predict(matrix), dtype=torch.float32).unsqueeze(1)

    def explain(self, emb: np.ndarray) -> tuple[float, list[dict]]:
        probability = float(self.booster.predict(xgb.DMatrix(emb, feature_names=self.feature_names))[0])
        shap = []
        if CAPTUM and self.feature_groups:
            emb_t = torch.tensor(emb, dtype=torch.float32)
            baseline = self.baseline.expand(1, -1) if self.baseline is not None else torch.zeros_like(emb_t)
            raw = ShapleyValueSampling(self._predict_tensor).attribute(
                emb_t,
                feature_mask=self.captum_mask,
                baselines=baseline,
                target=0,
                n_samples=SVS_SAMPLES,
                perturbations_per_eval=4,
            )
            for gid, group in enumerate(self.feature_groups):
                value = float(raw[0, self.group_first[gid]].detach().cpu())
                shap.append({
                    "feature": group.get("original_name") or group.get("label") or f"group_{gid}",
                    "value": value,
                    "direction": "risk" if value >= 0 else "protective",
                })
        return probability, shap

    def score(self, src: int, dst: int, attr: np.ndarray) -> dict:
        emb = self.embed(int(src), int(dst), np.asarray(attr, dtype=np.float32))
        probability, shap = self.explain(emb)
        return {"probability": probability, "shap": shap}


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
                _json(self, 200, {"status": "ok", "backend": "gnn_xgb", "device": str(ENGINE.device)})
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
            src = int(case["src"])
            dst = int(case["dst"])
            attr = np.asarray(case["edge_attr"], dtype=np.float32)
            _json(self, 200, ENGINE.score(src, dst, attr))
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
