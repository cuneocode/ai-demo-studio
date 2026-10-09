"""Point-in-time neighbourhood sampling over the TabFormer account <-> merchant graph.

A scored payment's neighbourhood may only contain payments made strictly before it
(``ts < as_of``). History spans the training split and the test window, so the
model sees the same past a production scorer would, and nothing after the payment.

Sampling mirrors PyG ``NeighborLoader``: for every frontier node, up to ``fanout``
incoming edges are drawn, and only the sampled edges are passed to the GNN.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

EdgeType = tuple[str, str, str]


def split_dirs(root: Path) -> list[Path]:
    """Training split first, then the test window; a lone split dir also works."""
    return [p for p in (root, root / "test_gnn") if (p / "nodes").is_dir() and (p / "edges").is_dir()]


def to_epoch(value) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, np.integer)):
        return int(value)
    stamp = pd.Timestamp(value)
    if stamp.tzinfo is not None:
        stamp = stamp.tz_convert("UTC").tz_localize(None)
    return int(stamp.value // 1_000_000_000)


def catalog_times(split: Path) -> np.ndarray:
    """Per-edge epoch seconds from the split's cases.csv (``ts``, else day-resolution ``date``)."""
    catalog = split / "cases.csv"
    if not catalog.is_file():
        raise FileNotFoundError(f"{catalog} is missing; re-run preprocess_tabformer_v3.py")
    column = "ts" if "ts" in pd.read_csv(catalog, nrows=0).columns else "date"
    times = pd.to_datetime(pd.read_csv(catalog, usecols=[column])[column])
    return times.to_numpy("datetime64[s]").astype(np.int64)


def _edge_csv(edge_dir: Path, et: EdgeType) -> tuple[Path, bool]:
    src_type, rel, dst_type = et
    if rel.startswith("rev_"):
        return edge_dir / f"{dst_type}_{rel[4:]}_{src_type}.csv", True
    return edge_dir / f"{src_type}_{rel}_{dst_type}.csv", False


def load_history(root: Path, edge_types: list[EdgeType]) -> tuple[dict, dict, list[Path]]:
    """Concatenate every split's edges with their timestamps, per edge type."""
    splits = split_dirs(root)
    if not splits:
        raise FileNotFoundError(f"No nodes/ and edges/ under {root}")
    edge_idx: dict[EdgeType, tuple[np.ndarray, np.ndarray]] = {}
    edge_ts: dict[EdgeType, np.ndarray] = {}
    for et in edge_types:
        srcs, dsts, times = [], [], []
        for split in splits:
            path, reverse = _edge_csv(split / "edges", et)
            frame = pd.read_csv(path)
            a = frame.iloc[:, 0].to_numpy(np.int64)
            b = frame.iloc[:, 1].to_numpy(np.int64)
            ts = catalog_times(split)
            if len(ts) != len(frame):
                raise ValueError(f"{split}/cases.csv rows ({len(ts)}) != {path.name} rows ({len(frame)})")
            srcs.append(b if reverse else a)
            dsts.append(a if reverse else b)
            times.append(ts)
        edge_idx[et] = (np.concatenate(srcs), np.concatenate(dsts))
        edge_ts[et] = np.concatenate(times)
    return edge_idx, edge_ts, splits


@dataclass
class Adjacency:
    """Incoming neighbours per destination node, sorted by time (CSR)."""

    indptr: np.ndarray
    nbr: np.ndarray
    ts: np.ndarray

    @classmethod
    def build(cls, src: np.ndarray, dst: np.ndarray, ts: np.ndarray, n_dst: int) -> "Adjacency":
        order = np.lexsort((ts, dst))
        indptr = np.searchsorted(dst[order], np.arange(n_dst + 1), side="left")
        return cls(indptr, src[order], ts[order])

    def before(self, node: int, as_of: int | None) -> np.ndarray:
        if node + 1 >= len(self.indptr):
            return self.nbr[:0]
        lo, hi = int(self.indptr[node]), int(self.indptr[node + 1])
        if as_of is None:
            return self.nbr[lo:hi]
        return self.nbr[lo:lo + int(np.searchsorted(self.ts[lo:hi], as_of, side="left"))]


def build_adjacency(edge_idx: dict, edge_ts: dict, node_counts: dict[str, int]) -> dict[EdgeType, Adjacency]:
    return {
        et: Adjacency.build(src, dst, edge_ts[et], node_counts[et[2]])
        for et, (src, dst) in edge_idx.items()
    }


def sample_subgraph(
    seeds: dict[str, list[int]],
    node_x: dict[str, np.ndarray],
    adj: dict[EdgeType, Adjacency],
    num_neighbors: list[int],
    rng: np.random.Generator,
    as_of: int | None,
) -> tuple[dict, dict, dict]:
    """Return local node features, local sampled edges, and global->local id maps."""
    node_types = list(node_x)
    ordered = {nt: list(dict.fromkeys(int(n) for n in seeds.get(nt, []))) for nt in node_types}
    local = {nt: {n: i for i, n in enumerate(ordered[nt])} for nt in node_types}
    frontier = {nt: list(ordered[nt]) for nt in node_types}
    edges: dict[EdgeType, tuple[list[int], list[int]]] = {et: ([], []) for et in adj}
    for fanout in num_neighbors:
        nxt: dict[str, list[int]] = {nt: [] for nt in node_types}
        for et, table in adj.items():
            src_t, _, dst_t = et
            for d in frontier[dst_t]:
                srcs = table.before(d, as_of)
                if len(srcs) == 0:
                    continue
                if 0 <= fanout < len(srcs):
                    srcs = srcs[rng.choice(len(srcs), fanout, replace=False)]
                for s in srcs.tolist():
                    if s not in local[src_t]:
                        local[src_t][s] = len(ordered[src_t])
                        ordered[src_t].append(s)
                        nxt[src_t].append(s)
                    edges[et][0].append(local[src_t][s])
                    edges[et][1].append(local[dst_t][d])
        frontier = nxt
    sub_x = {nt: node_x[nt][np.asarray(ordered[nt], dtype=np.int64)] for nt in node_types}
    sub_e = {et: (np.asarray(a, dtype=np.int64), np.asarray(b, dtype=np.int64)) for et, (a, b) in edges.items()}
    return sub_x, sub_e, local


def request_rng(src: int, dst: int, as_of: int | None) -> np.random.Generator:
    """Deterministic per payment, so a recorded score can be reproduced."""
    return np.random.default_rng([int(src), int(dst), (as_of or 0) & 0xFFFFFFFF])
