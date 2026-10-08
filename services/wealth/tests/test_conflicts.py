from tools.conflicts import detect_conflicts


def test_conflicts_do_not_scan_prose():
    snapshot = {"info": {"sector": "Technology"}}
    earnings = {"beatRate": 0.2, "observations": 8, "revenue": {"decelerating": False, "latestYoy": 0.2}}
    peers = {"pePremium": 0.01}
    returns = {"windows": {"1Y": {"excess": 0.1}}}
    macro = {"status": "absent", "series": {}}
    assert detect_conflicts(snapshot, earnings, peers, returns, macro) == []


def test_beat_conflict_requires_underperformance():
    snapshot = {"info": {"sector": "Technology"}}
    earnings = {"beatRate": 0.8, "observations": 8, "revenue": {}}
    peers = {}
    returns = {"windows": {"1Y": {"excess": 0.05}}}
    assert detect_conflicts(snapshot, earnings, peers, returns, {"status": "absent", "series": {}}) == []
    returns["windows"]["1Y"]["excess"] = -0.09
    rows = detect_conflicts(snapshot, earnings, peers, returns, {"status": "absent", "series": {}})
    assert rows[0]["id"] == "beat_vs_spy"
    assert rows[0]["severity"] == "high"
