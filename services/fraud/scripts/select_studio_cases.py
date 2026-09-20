#!/usr/bin/env python3
"""Pick a talk-track queue from the real TabFormer test window."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
GRAPH = ROOT / ".cache" / "graph" / "test_gnn"
OUT = ROOT / ".cache" / "studio_cases.json"

CHANNEL = {
    "Chip Transaction": "pos",
    "Swipe Transaction": "pos",
    "Online Transaction": "cnp",
}


def mask_account(value: str) -> str:
    user, _, card = str(value).partition("-")
    return f"****{user[-4:].zfill(4)}-{card or '0'}"


def merchant_label(value: str) -> str:
    text = str(value).lstrip("-")
    return f"Merchant {text[:4]}…{text[-4:]}" if len(text) > 8 else f"Merchant {text}"


def neighborhood(row: pd.Series, catalog: pd.DataFrame) -> str:
    acct = catalog[catalog["account"] == row["account"]]
    merch = catalog[catalog["merchant"] == row["merchant"]]
    return (
        f"Account {int(len(acct))} test-window payments · "
        f"merchant fraud labels {int(merch['is_fraud'].sum())}/{int(len(merch))} · "
        f"TabFormer date {pd.Timestamp(row['date']).date()}"
    )


def pick(frame: pd.DataFrame, fraud: int, channel: str, amount_min: float = 0, n: int = 1, largest: bool = False) -> pd.DataFrame:
    subset = frame[(frame["is_fraud"] == fraud) & (frame["channel"] == channel) & (frame["amount"] >= amount_min)]
    if subset.empty:
        return frame.iloc[0:0]
    if largest:
        return subset.nlargest(min(n, len(subset)), "amount")
    return subset.sample(n=min(n, len(subset)), random_state=7)


def main() -> None:
    catalog = pd.read_csv(GRAPH / "cases.csv").reset_index(drop=True)
    attrs = pd.read_csv(GRAPH / "edges" / "account_transacts_merchant_attr.csv").reset_index(drop=True)
    catalog["_edge_attr"] = attrs.to_numpy().tolist()
    chosen = pd.concat([
        pick(catalog, 0, "Chip Transaction", 0, 1),
        pick(catalog, 0, "Chip Transaction", 80, 1),
        pick(catalog, 0, "Online Transaction", 150, 1),
        pick(catalog, 0, "Swipe Transaction", 0, 1),
        pick(catalog, 1, "Chip Transaction", 50, 2, largest=True),
        pick(catalog, 1, "Chip Transaction", 0, 1),
        pick(catalog, 1, "Swipe Transaction", 0, 1),
    ]).drop_duplicates(subset=["account", "merchant", "amount", "date", "src", "dst"]).reset_index()
    cases = []
    for offset, row in chosen.iterrows():
        fraud = int(row["is_fraud"]) == 1
        channel = CHANNEL.get(str(row["channel"]), "pos")
        edge_attr = [float(value) for value in row["_edge_attr"]]
        cases.append({
            "id": f"tabformer-{int(row['index']):07d}",
            "label": f"{'Labeled fraud' if fraud else 'Labeled legit'} · {row['channel']} · ${row['amount']:.2f}",
            "account": mask_account(row["account"]),
            "merchant": merchant_label(row["merchant"]),
            "amount": round(float(row["amount"]), 2),
            "channel": channel,
            "neighborhood": neighborhood(row, catalog),
            "hint": "TabFormer test-window payment. The model score is independent of the published label.",
            "src": int(row["src"]),
            "dst": int(row["dst"]),
            "edge_attr": edge_attr,
            "tabformer_label": "fraud" if fraud else "legit",
            "raw_channel": str(row["channel"]),
            "date": str(pd.Timestamp(row["date"]).date()),
        })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cases, indent=2))
    print(f"wrote {OUT} cases={len(cases)}")


if __name__ == "__main__":
    main()
