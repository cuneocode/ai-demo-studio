"""The payment's merchant/card neighborhood as of the payment's timestamp, for the network view.

Fixture cases: a deterministic synthetic subgraph built from the case's network summary (merchant,
every confirmed-fraud card with its date, a sample of clean cards). TabFormer cases: the same layout
from the point-in-time counts select_studio_cases.py recorded (cards seen before the payment and how
many had fraud-labelled payments before it). Only payments strictly before the scored one count.

The counts are data; the individual card dots (last 4, purchase and confirmation dates) are generated
from a seed to match them, and the response says so (`layout`).
"""
import hashlib
import random
from datetime import datetime, timedelta

MAX_CLEAN_SHOWN = 14
MAX_FRAUD_SHOWN = 40


def _rng(case_id: str) -> random.Random:
    return random.Random(int(hashlib.sha256(case_id.encode()).hexdigest()[:12], 16))


def _parse(stamp: str | None) -> datetime:
    try:
        return datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except ValueError:
        return datetime(2026, 10, 2, 21, 14)


def get_neighborhood(case: dict) -> dict:
    network = case.get("network") or {}
    history = case.get("history") or {}
    at = _parse(case.get("at") or case.get("as_of"))
    window = int(network.get("window_days") or 21)
    seen = int(network.get("cards_seen") or history.get("merchant_prior_cards") or 0)
    fraud = int(network.get("cards_confirmed_fraud") or history.get("merchant_prior_fraud_cards") or 0)
    lag = network.get("fraud_lag_days") or [2, 19]
    rng = _rng(case["id"])
    hub = network.get("testing_merchant") or case.get("merchant")

    nodes = [
        {"id": "merchant", "kind": "merchant", "label": hub, "detail": f"{seen:,} cards in {window} days before this payment"},
        {"id": "card", "kind": "scored", "label": case.get("account"), "detail": f"Scored payment · ${float(case.get('amount') or 0):,.2f}"},
    ]
    edges = [{"source": "card", "target": "merchant", "kind": "scored"}]
    for index in range(min(fraud, MAX_FRAUD_SHOWN)):
        bought = at - timedelta(days=rng.uniform(1, window), hours=rng.uniform(0, 23))
        confirmed = bought + timedelta(days=rng.uniform(lag[0], lag[1]))
        if confirmed >= at:
            confirmed = at - timedelta(hours=rng.uniform(2, 40))
        node_id = f"f{index}"
        last4 = f"{rng.randint(0, 9999):04d}"
        days = max(1, round((confirmed - bought).total_seconds() / 86400))
        nodes.append({"id": node_id, "kind": "fraud", "label": f"****{last4}",
                      "bought_at": bought.isoformat(), "confirmed_at": confirmed.isoformat(),
                      "detail": f"Confirmed fraud {days} day{'s' if days != 1 else ''} after buying here"})
        edges.append({"source": node_id, "target": "merchant", "kind": "fraud"})
    clean = max(0, seen - fraud)
    for index in range(min(clean, MAX_CLEAN_SHOWN)):
        bought = at - timedelta(days=rng.uniform(1, window), hours=rng.uniform(0, 23))
        node_id = f"c{index}"
        nodes.append({"id": node_id, "kind": "clean", "label": f"****{rng.randint(0, 9999):04d}",
                      "bought_at": bought.isoformat(), "detail": "No fraud reported"})
        edges.append({"source": node_id, "target": "merchant", "kind": "clean"})
    ratio = network.get("dispute_ratio")
    return {
        "as_of": at.isoformat(),
        "window_days": window,
        "merchant": hub,
        "cards_seen": seen,
        "cards_confirmed_fraud": fraud,
        "fraud_share": round(fraud / seen, 4) if seen else None,
        "dispute_ratio": ratio,
        "card_prior_payments": history.get("card_prior_payments"),
        "card_prior_fraud": history.get("card_prior_fraud"),
        "card_prior_visits_here": history.get("card_prior_visits_here"),
        "small_auths": network.get("small_auths"),
        "other_cards_to_reissue": network.get("other_cards_to_reissue"),
        "shown": {"fraud": min(fraud, MAX_FRAUD_SHOWN), "clean": min(clean, MAX_CLEAN_SHOWN), "clean_total": clean},
        "nodes": nodes,
        "edges": edges,
        "temporal_filter": True,
        "source": "TabFormer point-in-time counts" if case.get("source") == "tabformer" else "Synthetic neighborhood",
        "layout": "illustrative",
        "layout_note": "The counts are data; the card dots, last-4s, and dates are generated to match them.",
    }
