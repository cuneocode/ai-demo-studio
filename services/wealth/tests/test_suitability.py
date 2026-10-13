from fixtures import household
from nba import addressable, candidates
from tools.suitability import household_findings, suitability_findings


def test_above_the_cap_is_high_and_above_the_guide_is_medium():
    findings = suitability_findings([
        {"ticker": "AAPL", "weight": 0.42},
        {"ticker": "MSFT", "weight": 0.18},
        {"ticker": "JPM", "weight": 0.40},
    ], "Growth objective with moderate risk over a 10 year horizon")
    severity = {item["id"]: item["severity"] for item in findings}
    assert severity["R-CONC-01:AAPL"] == "high" and "20% single-issuer cap" in findings[0]["detail"]
    assert severity["R-CONC-01:MSFT"] == "medium"
    assert "missing_ips" not in severity


def test_missing_ips_and_percent_weights():
    ids = {item["id"] for item in suitability_findings([{"ticker": "JPM", "weight": 100}])}
    assert {"missing_ips", "R-CONC-01:JPM"} <= ids


def test_ips_field_gaps():
    findings = suitability_findings([{"ticker": "JPM", "weight": 0.4}, {"ticker": "BAC", "weight": 0.6}], "Just some notes")
    assert any(item["id"] == "missing_ips_fields" for item in findings)


def test_chuck_profile_against_portfolio_with_reg_bi_framing():
    findings = {row["rule"]: row for row in household_findings(household("chuck-robbins"))}
    conc = findings["R-CONC-01"]
    assert conc["severity"] == "high" and conc["category"] == "suitability"
    assert conc["fields"]["weight"]["display"] == "46%" and conc["fields"]["value"]["display"] == "$6.53M"
    assert conc["reg_bi"].startswith("Care:"), "framed as the Reg BI care obligation"
    assert findings["R-RISK-02"]["fields"]["equity_share"]["display"] == "78%"
    assert "R-EDU-01" not in findings and "R-AFF-01" not in findings, "No invented family or HCYN affiliation"
    order = [row["category"] for row in household_findings(household("chuck-robbins"))]
    assert order == sorted(order, key=["suitability", "data", "planning"].index), "suitability findings lead"


def test_okafor_conservative_band_and_priya_has_no_suitability_breach():
    okafor = {row["rule"]: row for row in household_findings(household("okafor"))}
    assert okafor["R-RISK-02"]["detail"].startswith("Equities are 68%") and "Conservative maximum of 40%" in okafor["R-RISK-02"]["detail"]
    priya = household_findings(household("priya-raman"))
    assert all(row["category"] == "planning" for row in priya)


def test_next_best_actions_carry_dollars_and_a_profile_fit():
    record = household("chuck-robbins")
    actions = {row["id"]: row for row in candidates(record, household_findings(record))}
    assert "NBA-10B51" not in actions and "NBA-529" not in actions
    assert actions["NBA-REBALANCE"]["suitable"]
    assert actions["NBA-EXCHANGE"]["suitable"] is False and "lock-up" in actions["NBA-EXCHANGE"]["fit"]
    assert "NBA-COLLAR" not in actions, "No employer-insider action for an unrelated fictional holding"
    ranked = list(actions)
    assert ranked.index("NBA-EXCHANGE") == len(ranked) - 1, "unsuitable actions sort last"
    expected = max(actions["NBA-DAF"]["dollars"], actions["NBA-REBALANCE"]["dollars"]) + actions["NBA-LADDER"]["dollars"]
    assert addressable(list(actions.values())) == expected, "overlapping allocation actions count once; referrals are not counted"


def test_every_household_action_cites_its_rules():
    for hid in ("chuck-robbins", "okafor", "priya-raman"):
        record = household(hid)
        findings = household_findings(record)
        rules = {row["rule"] for row in findings}
        for action in candidates(record, findings):
            assert set(action["rules"]) <= rules, (hid, action["id"])
            assert action["fields"]["dollars"]["unit"] == "usd"
