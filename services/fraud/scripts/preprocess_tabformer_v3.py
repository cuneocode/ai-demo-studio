#!/usr/bin/env python3
"""Convert IBM TabFormer transactions into the NVIDIA 3.0 graph layout."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def parse_amount(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype(str).str.replace(r"[\$,]", "", regex=True), errors="coerce").fillna(0.0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--min-year", type=int, default=2019)
    parser.add_argument("--max-date", default="2019-10-31")
    parser.add_argument("--cutoff", default="2019-08-31")
    args = parser.parse_args()

    raw = pd.read_csv(args.csv, dtype=str, keep_default_na=False)
    raw["Year"] = pd.to_numeric(raw["Year"], errors="coerce")
    raw = raw[raw["Year"] >= args.min_year].copy()
    raw["amount"] = parse_amount(raw["Amount"])
    raw["amount"] = raw["amount"].clip(upper=raw["amount"].quantile(0.99))
    raw["hour"] = pd.to_numeric(raw["Time"].str.split(":").str[0], errors="coerce").fillna(0)
    raw["account"] = raw["User"].astype(str) + "-" + raw["Card"].astype(str)
    raw["merchant"] = raw["Merchant Name"].astype(str)
    raw["channel"] = raw["Use Chip"].astype(str)
    raw["is_fraud"] = raw["Is Fraud?"].str.strip().str.lower().isin({"yes", "1", "true"}).astype(int)
    raw["date"] = pd.to_datetime(
        raw["Year"].astype(int).astype(str)
        + "-"
        + raw["Month"].astype(str).str.zfill(2)
        + "-"
        + raw["Day"].astype(str).str.zfill(2),
        errors="coerce",
    )
    raw = raw.dropna(subset=["date"]).sort_values("date").reset_index(drop=True)

    account_ids = {value: index for index, value in enumerate(raw["account"].unique())}
    merchant_ids = {value: index for index, value in enumerate(raw["merchant"].unique())}
    raw["src"] = raw["account"].map(account_ids)
    raw["dst"] = raw["merchant"].map(merchant_ids)
    raw["hour_sin"] = np.sin(2 * np.pi * raw["hour"] / 24)
    raw["hour_cos"] = np.cos(2 * np.pi * raw["hour"] / 24)

    raw = raw[raw["date"] <= pd.Timestamp(args.max_date)].copy()
    cutoff = pd.Timestamp(args.cutoff)
    train = raw[raw["date"] <= cutoff].copy()
    test = raw[raw["date"] > cutoff].copy()
    if train.empty or test.empty or int(test["is_fraud"].sum()) == 0:
        raise SystemExit("Split produced an empty set or a test window with no fraud labels.")

    def node_frame(frame: pd.DataFrame, ids: dict[str, int], key: str, prefix: str, extra: dict[str, pd.Series]) -> pd.DataFrame:
        grouped = frame.groupby(key).agg(
            avg_amount=("amount", "mean"),
            txn_count=("amount", "count"),
            amount_std=("amount", "std"),
        )
        grouped["amount_std"] = grouped["amount_std"].fillna(0.0)
        grouped = grouped.rename(columns={
            "avg_amount": f"{prefix}_avg_amount",
            "txn_count": f"{prefix}_txn_count",
            "amount_std": f"{prefix}_amount_std",
        })
        for name, series in extra.items():
            grouped[name] = series
        grouped = grouped.reindex(ids.keys()).fillna(0.0)
        return grouped.reset_index(drop=True).astype(float)

    train_acct_merchants = train.groupby("account")["merchant"].nunique().rename("acct_unique_merchants")
    train_merch_accounts = train.groupby("merchant")["account"].nunique().rename("merch_unique_accounts")
    accounts = node_frame(train, account_ids, "account", "acct", {"acct_unique_merchants": train_acct_merchants})
    merchants = node_frame(train, merchant_ids, "merchant", "merch", {"merch_unique_accounts": train_merch_accounts})

    def write_split(frame: pd.DataFrame, dest: Path) -> None:
        dest.joinpath("nodes").mkdir(parents=True, exist_ok=True)
        dest.joinpath("edges").mkdir(parents=True, exist_ok=True)
        accounts.to_csv(dest / "nodes" / "account.csv", index=False)
        merchants.to_csv(dest / "nodes" / "merchant.csv", index=False)
        frame[["src", "dst"]].to_csv(dest / "edges" / "account_transacts_merchant.csv", index=False)
        frame[["is_fraud"]].rename(columns={"is_fraud": "fraud"}).to_csv(
            dest / "edges" / "account_transacts_merchant_label.csv", index=False
        )
        channel = pd.get_dummies(frame["channel"], prefix="channel", dtype=float)
        attr = pd.concat([frame[["amount", "hour_sin", "hour_cos"]].astype(float), channel], axis=1)
        attr.to_csv(dest / "edges" / "account_transacts_merchant_attr.csv", index=False)
        catalog = frame[["account", "merchant", "amount", "channel", "is_fraud", "date"]].copy()
        catalog["src"] = frame["src"]
        catalog["dst"] = frame["dst"]
        catalog.to_csv(dest / "cases.csv", index=False)

    args.out.mkdir(parents=True, exist_ok=True)
    write_split(train, args.out)
    write_split(test, args.out / "test_gnn")
    print(
        f"wrote {args.out}: accounts={len(account_ids)} merchants={len(merchant_ids)} "
        f"train_edges={len(train)} test_edges={len(test)} train_fraud={int(train.is_fraud.sum())} "
        f"test_fraud={int(test.is_fraud.sum())} cutoff={cutoff.date()}"
    )


if __name__ == "__main__":
    main()
