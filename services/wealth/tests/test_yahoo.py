from types import SimpleNamespace

import pandas as pd
import pytest

from providers import yahoo


class FakeTicker:
    def __init__(self, symbol):
        self.symbol = symbol
        if symbol == "EMPTY":
            self.info = {}
            self.recommendations = pd.DataFrame()
            self.quarterly_income_stmt = pd.DataFrame()
            self.earnings_dates = pd.DataFrame()
        else:
            self.info = {
                "symbol": symbol,
                "shortName": "Fixture Co",
                "sector": "Technology",
                "industry": "Software",
                "industryKey": "software-infrastructure",
                "marketCap": 1_000_000_000,
                "trailingPE": 20,
            }
            self.recommendations = pd.DataFrame([{"period": "0m", "strongBuy": 1, "buy": 2, "hold": 1, "sell": 0, "strongSell": 0}])
            self.quarterly_income_stmt = pd.DataFrame(
                {"2025-06-30": [10.0], "2025-03-31": [9.0]},
                index=["Total Revenue"],
            )
            self.earnings_dates = pd.DataFrame(
                {"Reported EPS": [1.2], "EPS Estimate": [1.0], "Surprise(%)": [20.0]},
                index=pd.to_datetime(["2025-07-01"]),
            )

    def history(self, period="2y", auto_adjust=True):
        if self.symbol == "EMPTY":
            return pd.DataFrame()
        idx = pd.date_range("2025-01-01", periods=10, freq="D")
        return pd.DataFrame({"Close": [100 + i for i in range(10)]}, index=idx)

    def get_earnings_dates(self, limit=12):
        return self.earnings_dates


class FakeIndustry:
    def __init__(self, key):
        self.key = key
        self.top_companies = pd.DataFrame(
            {"name": ["Peer One"], "marketCap": [800_000_000], "trailingPE": [18]},
            index=["PEER"],
        )


def test_named_functions_and_empty_fail_closed(monkeypatch):
    monkeypatch.setattr(yahoo, "yf", SimpleNamespace(Ticker=FakeTicker, Industry=FakeIndustry))
    assert yahoo.history("AAPL")[0]["close"] == 100
    assert yahoo.info("AAPL")["name"] == "Fixture Co"
    assert yahoo.earnings("AAPL")[0]["surprisePct"] == 20
    assert yahoo.income_quarters("AAPL")[0]["revenue"] == 10
    with pytest.raises(yahoo.ProviderError):
        yahoo.fetch_snapshot("EMPTY")


def test_peer_discovery_uses_industry(monkeypatch):
    monkeypatch.setattr(yahoo, "yf", SimpleNamespace(Ticker=FakeTicker, Industry=FakeIndustry))
    snap = yahoo.fetch_snapshot("AAPL")
    assert snap["ticker"] == "AAPL"
    assert snap["peers"][0]["ticker"] == "PEER"
    assert "history" in snap["peers"][0]
