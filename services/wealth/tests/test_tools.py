from tools.conflicts import detect_conflicts
from tools.earnings import earnings_from_snapshot
from tools.macro import macro_from_payload
from tools.peers import peers_from_snapshot
from tools.returns import returns_from_snapshot


def test_earnings_beat_rate_and_deceleration(snapshot):
    earnings = earnings_from_snapshot(snapshot)
    assert earnings["status"] == "ready"
    assert earnings["beatRate"] == 1.0
    assert earnings["observations"] == 5
    assert earnings["revenue"]["decelerating"] is True
    assert earnings["revenue"]["latestYoy"] < earnings["revenue"]["priorYoy"]


def test_returns_lag_spy(snapshot):
    returns = returns_from_snapshot(snapshot)
    assert returns["status"] == "ready"
    one_year = returns["windows"]["1Y"]
    assert one_year["ticker"] < 0
    assert one_year["spy"] > 0
    assert one_year["excess"] < -0.2


def test_peers_median_and_premium(snapshot):
    peers = peers_from_snapshot(snapshot)
    assert peers["status"] == "ready"
    assert peers["count"] == 3
    assert peers["medianPe"] == 12.0
    assert peers["pePremium"] > 0.4


def test_macro_absent_without_payload():
    macro = macro_from_payload({"status": "absent", "reason": "FRED_API_KEY is not configured."})
    assert macro["status"] == "absent"
    assert not macro["series"]


def test_macro_directions(macro):
    parsed = macro_from_payload(macro)
    assert parsed["status"] == "ready"
    assert parsed["series"]["FEDFUNDS"]["direction"] == "up"
    assert parsed["series"]["CPIAUCSL"]["latest"] == 322.4


def test_structured_conflicts_fire(snapshot, macro):
    earnings = earnings_from_snapshot(snapshot)
    peers = peers_from_snapshot(snapshot)
    returns = returns_from_snapshot(snapshot)
    parsed = macro_from_payload(macro)
    rows = detect_conflicts(snapshot, earnings, peers, returns, parsed)
    ids = {row["id"] for row in rows}
    assert "beat_vs_spy" in ids
    assert "pe_vs_growth" in ids
    assert "macro_vs_sector" in ids
    assert all({"id", "severity", "left", "right", "detail"} <= row.keys() for row in rows)
