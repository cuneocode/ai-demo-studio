import json
from pathlib import Path

import xbrl

FIXTURES = Path(__file__).parent / "fixtures"


def test_extracts_allowlisted_fy_metrics():
    payload = json.loads((FIXTURES / "companyfacts.json").read_text())
    metrics = xbrl.extract_metrics(payload, fy=2024, accession="0000019617-25-000270")
    by_label = {item["label"]: item for item in metrics}
    assert by_label["Revenue"]["value"] == 169430000000
    assert by_label["Revenue"]["concept"] == "Revenues"
    assert by_label["Revenue"]["origin"] == "xbrl"
    assert by_label["Net income"]["value"] == 49430000000
    assert set(by_label) >= {"Revenue", "Net income", "Assets", "Liabilities", "Stockholders' equity"}


def test_does_not_use_prior_year_when_fy_set():
    payload = json.loads((FIXTURES / "companyfacts.json").read_text())
    metrics = xbrl.extract_metrics(payload, fy=2024)
    revenue = next(item for item in metrics if item["label"] == "Revenue")
    assert revenue["value"] != 155000000000
    assert revenue["fy"] == 2024
