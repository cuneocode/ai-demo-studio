"""Plain-English names for the scorer's Shapley feature groups. The UI never shows raw column names."""
import re

FEATURE_LABELS = {
    "merchant_neighborhood": "Merchant's network of linked cards",
    "account_neighborhood": "Account's network of linked payments",
    "account_gnn_embedding": "Card's own graph history",
    "account_history": "Card's payment history",
    "raw_account_features": "Card profile",
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
}


def feature_label(feature: str) -> str:
    key = feature.strip().lower().replace(" ", "_").replace("-", "_")
    if key in FEATURE_LABELS:
        return FEATURE_LABELS[key]
    words = re.sub(r"[_\s]+", " ", feature).strip()
    return words[:1].upper() + words[1:] if words else "Unnamed signal"
