#!/usr/bin/env python3
"""Pick a talk-track queue from the real TabFormer test window.

Public fields (label, neighborhood, hint) never carry the payment's own label;
it is kept in ``tabformer_label`` for the post-decision reveal. Neighbourhood
stats only use payments strictly earlier than the scored one.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

CHANNEL = {
    "Chip Transaction": ("pos", "Card present · chip"),
    "Swipe Transaction": ("pos", "Card present · swipe"),
    "Online Transaction": ("cnp", "Card not present"),
}
SMALL_AMOUNT = 10.0


def mask_account(value: str) -> str:
    user, _, card = str(value).partition("-")
    return f"****{user[-4:].zfill(4)}-{card or '0'}"


def merchant_label(value: str) -> str:
    text = str(value).lstrip("-")
    return f"Merchant {text[:4]}…{text[-4:]}" if len(text) > 8 else f"Merchant {text}"


def history_features(train: pd.DataFrame, test: pd.DataFrame) -> pd.DataFrame:
    """Point-in-time counts for every test row, from all earlier payments."""
    test = test.copy()
    test["_test_row"] = np.arange(len(test))
    train = train.assign(_test_row=-1)
    h = pd.concat([train, test], ignore_index=True)
    h["ts"] = pd.to_datetime(h["ts"] if "ts" in h else h["date"])
    h = h.sort_values("ts", kind="stable").reset_index(drop=True)
    fraud = h["is_fraud"].astype(int)

    h["card_prior_payments"] = h.groupby("account").cumcount()
    h["card_prior_fraud"] = fraud.groupby(h["account"]).cumsum() - fraud
    h["card_prior_visits_here"] = h.groupby(["account", "merchant"]).cumcount()
    first_card = (~h.duplicated(["merchant", "account"])).astype(int)
    h["merchant_prior_payments"] = h.groupby("merchant").cumcount()
    h["merchant_prior_cards"] = first_card.groupby(h["merchant"]).cumsum() - first_card
    dup = pd.Series(True, index=h.index)
    dup[fraud == 1] = h.loc[fraud == 1].duplicated(["merchant", "account"])
    first_fraud_card = ((fraud == 1) & ~dup).astype(int)
    h["merchant_prior_fraud_cards"] = first_fraud_card.groupby(h["merchant"]).cumsum() - first_fraud_card

    small = pd.Series((h["amount"] < SMALL_AMOUNT).astype(float).to_numpy(), index=pd.DatetimeIndex(h["ts"]))
    rolled = small.groupby(h["account"].to_numpy()).transform(lambda s: s.rolling("24h").sum())
    h["card_small_payments_24h"] = (rolled.to_numpy() - small.to_numpy()).astype(int)
    cols = [
        "card_prior_payments", "card_prior_fraud", "card_prior_visits_here", "merchant_prior_payments",
        "merchant_prior_cards", "merchant_prior_fraud_cards", "card_small_payments_24h",
    ]
    out = h[h["_test_row"] >= 0].sort_values("_test_row")[cols].reset_index(drop=True)
    return pd.concat([test.drop(columns=["_test_row"]).reset_index(drop=True), out], axis=1)


def neighborhood_text(row: pd.Series) -> str:
    return (
        f"Card: {int(row.card_prior_payments)} earlier payments, {int(row.card_prior_visits_here)} at this merchant · "
        f"Merchant: {int(row.merchant_prior_cards)} cards seen earlier, "
        f"{int(row.merchant_prior_fraud_cards)} with fraud-labelled payments before this one"
    )


def first(frame: pd.DataFrame, sort: list[str] | None = None, seed: int = 7) -> pd.DataFrame:
    if frame.empty:
        return frame
    if sort:
        return frame.sort_values(sort, ascending=False, kind="stable").head(1)
    return frame.sample(n=1, random_state=seed)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", type=Path, default=ROOT / ".cache" / "graph")
    parser.add_argument("--out", type=Path, default=ROOT / ".cache" / "studio_cases.json")
    args = parser.parse_args()

    test = pd.read_csv(args.graph / "test_gnn" / "cases.csv")
    attrs = pd.read_csv(args.graph / "test_gnn" / "edges" / "account_transacts_merchant_attr.csv")
    train = pd.read_csv(args.graph / "cases.csv")
    test["_edge_attr"] = attrs.to_numpy().tolist()
    test = history_features(train, test)
    fraud, legit = test[test["is_fraud"] == 1], test[test["is_fraud"] == 0]

    picks = [
        ("cpp", first(
            fraud[(fraud.card_prior_fraud == 0) & (fraud.card_prior_payments >= 50)],
            ["merchant_prior_fraud_cards", "amount"],
        )),
        ("card_testing", first(
            fraud[(fraud.amount >= 100) & (fraud.card_small_payments_24h >= 3)],
            ["card_small_payments_24h", "amount"],
        )),
        ("clean_control", first(legit[
            (legit.channel == "Chip Transaction") & (legit.card_prior_fraud == 0)
            & (legit.merchant_prior_fraud_cards == 0)
        ], ["card_prior_visits_here", "card_prior_payments"])),
        ("queue", first(legit[legit.channel == "Online Transaction"], seed=11)),
        ("queue", first(legit[legit.channel == "Swipe Transaction"], seed=12)),
        ("queue", first(legit[(legit.channel == "Chip Transaction") & (legit.amount >= 80)], seed=13)),
        ("queue", first(fraud[fraud.channel != "Online Transaction"], seed=14)),
        ("queue", first(fraud[fraud.channel == "Online Transaction"], seed=15)),
    ]
    rows, seen = [], set()
    for scenario, frame in picks:
        for index, row in frame.iterrows():
            if index not in seen:
                seen.add(index)
                rows.append((scenario, index, row))
    rows.sort(key=lambda item: str(item[2]["ts"]))

    cases = []
    for scenario, index, row in rows:
        channel, channel_text = CHANNEL.get(str(row["channel"]), ("pos", str(row["channel"])))
        ts = pd.Timestamp(row["ts"])
        cases.append({
            "id": f"tabformer-{int(index):07d}",
            "label": f"{channel_text} · ${row['amount']:.2f} · {ts:%b %d %H:%M}",
            "account": mask_account(row["account"]),
            "merchant": merchant_label(row["merchant"]),
            "amount": round(float(row["amount"]), 2),
            "channel": channel,
            "neighborhood": neighborhood_text(row),
            "hint": "TabFormer test-window payment (synthetic). The label stays hidden until the analyst decides.",
            "src": int(row["src"]),
            "dst": int(row["dst"]),
            "edge_attr": [float(value) for value in row["_edge_attr"]],
            "as_of": ts.isoformat(),
            "date": str(ts.date()),
            "raw_channel": str(row["channel"]),
            "scenario": scenario,
            "history": {key: int(row[key]) for key in (
                "card_prior_payments", "card_prior_fraud", "card_prior_visits_here", "merchant_prior_payments",
                "merchant_prior_cards", "merchant_prior_fraud_cards", "card_small_payments_24h",
            )},
            "tabformer_label": "fraud" if int(row["is_fraud"]) == 1 else "legit",
        })
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(cases, indent=2))
    print(f"wrote {args.out} cases={len(cases)} scenarios={[c['scenario'] for c in cases]}")


if __name__ == "__main__":
    main()
