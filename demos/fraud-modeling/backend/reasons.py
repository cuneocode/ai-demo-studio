"""Plain-English names and reason codes for the scorer's TreeSHAP feature groups. The UI never shows raw column names."""
import re

FEATURE_LABELS = {
    "merchant_neighborhood": "Merchant's network of linked cards",
    "account_neighborhood": "Card's network of linked payments",
    "account_gnn_embedding": "Card's own graph history",
    "merchant_gnn_embedding": "Merchant's graph profile",
    "account_history": "Card's payment history",
    "raw_account_features": "Card profile",
    "raw_merchant_features": "Merchant profile",
    "transaction_amount": "Amount",
    "payment_channel": "Payment channel",
    "amount": "Amount",
    "mcc": "Merchant category",
    "merchant_city": "Merchant location",
    "merchant_state": "Merchant location",
    "zip": "Merchant location",
    "use_chip": "Payment channel",
    "time": "Time of day",
    "hour": "Time of day",
    "hour_sin": "Time of day",
    "hour_cos": "Time of day",
}

# Feature groups that come from the graph (GraphSAGE embeddings); everything else is the payment itself.
NETWORK_GROUPS = {"merchant_neighborhood", "account_neighborhood", "account_gnn_embedding", "merchant_gnn_embedding"}


def _key(feature: str) -> str:
    return feature.strip().lower().replace(" ", "_").replace("-", "_")


def feature_label(feature: str) -> str:
    key = _key(feature)
    if key in FEATURE_LABELS:
        return FEATURE_LABELS[key]
    words = re.sub(r"[_\s]+", " ", feature).strip()
    return words[:1].upper() + words[1:] if words else "Unnamed signal"


def reason_text(feature: str, value: float, case: dict) -> tuple[str, str]:
    """(code, sentence) for one TreeSHAP group, worded from the case's own facts."""
    key = _key(feature)
    network = case.get("network") or {}
    history = case.get("history") or {}
    profile = case.get("profile") or {}
    risk = value >= 0
    fraud = network.get("cards_confirmed_fraud") or history.get("merchant_prior_fraud_cards")
    if key == "merchant_neighborhood":
        if risk and fraud:
            window = network.get("window_days")
            return "NET_CONFIRMED_FRAUD_LINKS", f"Merchant linked to {fraud} cards with confirmed fraud{f' in the last {window} days' if window else ' before this payment'}"
        return "NET_PROTECTIVE", "Merchant's other cards are overwhelmingly clean"
    if key == "account_neighborhood":
        small = history.get("card_small_payments_24h") or network.get("small_auths")
        if risk and small:
            return "NET_TESTING_PATTERN", f"{small} tiny authorizations just before, at a merchant where other cards went bad"
        return ("NET_CARD_LINKS", "Card's recent payments connect to risky merchants") if risk else ("NET_CARD_CLEAN", "Card's recent payments connect to clean merchants")
    if key in {"account_gnn_embedding", "account_history", "raw_account_features"}:
        if risk:
            return "CARD_PROFILE", "Card's own history adds some risk"
        since = profile.get("card_since")
        return "CLEAN_HISTORY", f"Card's clean history{f' since {since[:4]}' if since else ''}"
    if key in {"transaction_amount", "amount"}:
        typical = profile.get("typical_amount")
        if risk and typical:
            return "AMOUNT_VS_PROFILE", f"Amount {float(case.get('amount') or 0) / typical:.1f}× this card's typical spend"
        return ("AMOUNT", "Amount adds some risk") if risk else ("AMOUNT_TYPICAL", "Amount is typical for this card")
    if key in {"payment_channel", "use_chip"}:
        if case.get("channel") == "cnp":
            return ("CNP", "Card not present") if risk else ("CNP_PROTECTIVE", "Online channel is normal for this card")
        return ("CARD_PRESENT_RISK", "Channel adds some risk") if risk else ("CARD_PRESENT", "Card present (chip or swipe)")
    label = feature_label(feature)
    return key.upper()[:32] or "SIGNAL", f"{label} {'raises' if risk else 'lowers'} the score"


def reasons_for(shap: list[dict], case: dict) -> list[dict]:
    """Reason chips, strongest first, each with its signed TreeSHAP contribution."""
    out = []
    for item in sorted(shap, key=lambda entry: abs(entry["value"]), reverse=True):
        code, text = reason_text(item["feature"], item["value"], case)
        out.append({"code": code, "text": text, "value": round(float(item["value"]), 3), "feature": item["feature"],
                    "label": feature_label(item["feature"]), "direction": "risk" if item["value"] >= 0 else "protective",
                    "network": _key(item["feature"]) in NETWORK_GROUPS})
    return out
