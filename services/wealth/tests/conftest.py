from datetime import datetime, timedelta, timezone

import pytest


def _closes(start: float, change: float, days: int = 400):
    origin = datetime(2025, 8, 16, tzinfo=timezone.utc)
    rows = []
    price = start
    for index in range(days):
        price = start * (1 + change * (index / days))
        rows.append({"date": (origin + timedelta(days=index)).date().isoformat(), "close": round(price, 4)})
    return rows


def sample_snapshot(ticker: str = "JPM"):
    history = _closes(180, -0.12)
    spy = _closes(500, 0.18)
    return {
        "ticker": ticker,
        "name": "JPMorgan Chase",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "info": {
            "symbol": ticker,
            "name": "JPMorgan Chase",
            "sector": "Financial Services",
            "industry": "Banks - Diversified",
            "industryKey": "banks-diversified",
            "marketCap": 800_000_000_000,
            "trailingPE": 18.4,
            "forwardPE": 16.2,
            "currency": "USD",
        },
        "history": history,
        "benchmark": {"ticker": "SPY", "history": spy},
        "earnings": [
            {"period": "2025-07-15", "epsActual": 1.45, "epsEstimate": 1.20, "surprisePct": 20.8},
            {"period": "2025-04-15", "epsActual": 1.30, "epsEstimate": 1.18, "surprisePct": 10.2},
            {"period": "2025-01-15", "epsActual": 1.22, "epsEstimate": 1.10, "surprisePct": 10.9},
            {"period": "2024-10-15", "epsActual": 1.15, "epsEstimate": 1.05, "surprisePct": 9.5},
            {"period": "2024-07-15", "epsActual": 1.05, "epsEstimate": 1.00, "surprisePct": 5.0},
        ],
        "income": [
            {"period": "2024-03-31", "revenue": 40_000_000_000},
            {"period": "2024-06-30", "revenue": 41_000_000_000},
            {"period": "2024-09-30", "revenue": 42_000_000_000},
            {"period": "2024-12-31", "revenue": 43_000_000_000},
            {"period": "2025-03-31", "revenue": 44_000_000_000},
            {"period": "2025-06-30", "revenue": 43_500_000_000},
        ],
        "recommendations": [{"period": "0m", "strongBuy": 8, "buy": 12, "hold": 4, "sell": 0, "strongSell": 0}],
        "peers": [
            {"ticker": "BAC", "name": "Bank of America", "marketCap": 300_000_000_000, "trailingPE": 12.0, "history": _closes(40, 0.05, 260)},
            {"ticker": "WFC", "name": "Wells Fargo", "marketCap": 200_000_000_000, "trailingPE": 13.1, "history": _closes(50, 0.04, 260)},
            {"ticker": "C", "name": "Citigroup", "marketCap": 150_000_000_000, "trailingPE": 11.5, "history": _closes(60, 0.03, 260)},
        ],
    }


def sample_macro():
    return {
        "status": "ready",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "series": {
            "FEDFUNDS": {
                "series": "FEDFUNDS",
                "label": "Federal funds rate",
                "unit": "percent",
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "observations": [{"date": "2026-07-01", "value": 4.33}, {"date": "2026-08-01", "value": 4.50}],
            },
            "CPIAUCSL": {
                "series": "CPIAUCSL",
                "label": "Consumer price index",
                "unit": "index",
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "observations": [{"date": "2026-07-01", "value": 320.1}, {"date": "2026-08-01", "value": 322.4}],
            },
            "DGS10": {
                "series": "DGS10",
                "label": "10-year Treasury yield",
                "unit": "percent",
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "observations": [{"date": "2026-08-01", "value": 4.20}, {"date": "2026-08-15", "value": 4.25}],
            },
            "UNRATE": {
                "series": "UNRATE",
                "label": "Unemployment rate",
                "unit": "percent",
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "observations": [{"date": "2026-07-01", "value": 4.1}, {"date": "2026-08-01", "value": 4.2}],
            },
        },
    }


@pytest.fixture
def snapshot():
    return sample_snapshot()


@pytest.fixture
def macro():
    return sample_macro()


@pytest.fixture(autouse=True)
def no_studio_models(monkeypatch, tmp_path):
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(tmp_path / "models.json"))


@pytest.fixture(autouse=True)
def no_hosted_guardrails(monkeypatch):
    """Tests never reach AI Defense or Agent Control: untrusted items get the local screen, policies run locally."""
    import controls
    import security

    async def not_configured(_text, _label):
        return {"status": "not_configured", "by": "AI Defense", "classifications": [], "rules": [], "spans": []}

    monkeypatch.setattr(security.defense, "inspect_untrusted", not_configured)
    monkeypatch.setattr(controls.controls, "ready", False)
    monkeypatch.setattr(controls.controls, "_tried", True)
    monkeypatch.setattr(controls.controls, "reason", "Agent Control is not used in tests")


@pytest.fixture
def no_models(monkeypatch):
    """Every drafting tier above the fixture fails, as when no model answers."""
    import advisory
    import research

    async def down(*_args, **_kwargs):
        raise RuntimeError("no model in tests")

    for module in (research, advisory):
        monkeypatch.setattr(module, "run_deep_agent", down)
        monkeypatch.setattr(module, "run_single_call", down)
