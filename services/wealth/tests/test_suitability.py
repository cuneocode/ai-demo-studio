from tools.suitability import suitability_findings


def test_concentration_and_single_name():
    findings = suitability_findings([
        {"ticker": "AAPL", "weight": 0.42},
        {"ticker": "MSFT", "weight": 0.22},
        {"ticker": "JPM", "weight": 0.36},
    ], "Growth objective with moderate risk over a 10 year horizon")
    ids = {item["id"] for item in findings}
    assert "concentration_AAPL" in ids
    assert "single_name_MSFT" in ids
    assert "missing_ips" not in ids


def test_missing_ips_and_percent_weights():
    findings = suitability_findings([{"ticker": "JPM", "weight": 100}])
    ids = {item["id"] for item in findings}
    assert "missing_ips" in ids
    assert "concentration_JPM" in ids


def test_ips_field_gaps():
    findings = suitability_findings([{"ticker": "JPM", "weight": 0.4}, {"ticker": "BAC", "weight": 0.6}], "Just some notes")
    assert any(item["id"] == "missing_ips_fields" for item in findings)
