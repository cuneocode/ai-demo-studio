import pytest

from casefile import CaseFile, scenarios, scenario
from citations import check_sentence, split_inline, verify
from facts import extract


@pytest.mark.parametrize("item", scenarios(), ids=lambda item: item["id"])
def test_every_sample_narrative_verifies(item):
    cf = CaseFile(item)
    draft = cf.case["sample_draft"]
    checked = verify(draft["sections"], cf.ledger, cf.year, drop=False)
    assert checked["ok"], [i["problems"] for s in checked["sections"] for i in s["sentences"] if not i["ok"]]
    assert checked["every_sentence_cited"] and checked["every_fact_verified"]
    assert not checked["missing_sections"]


def mule():
    return CaseFile(scenario("mule-reyes"))


def test_a_changed_amount_is_caught():
    cf = mule()
    result = check_sentence("The account received 23 P2P credits totalling $15,860.00.", ["AGG-IN-P2P"], cf.ledger, cf.year)
    assert not result["ok"] and "$15,860.00" in result["unverified"]


def test_an_amount_from_uncited_evidence_is_caught():
    cf = mule()
    result = check_sentence("Ten credits totalling $6,120.00 used listed cards.", ["AGG-IN"], cf.ledger, cf.year)
    assert "$6,120.00" in result["unverified"]


def test_uncited_unknown_and_withheld_citations_fail():
    cf = mule()
    assert "no citation" in check_sentence("The subject is a student.", [], cf.ledger, cf.year)["problems"]
    assert any("unknown evidence" in p for p in check_sentence("The subject is a student.", ["KYC-9"], cf.ledger, cf.year)["problems"])
    cf.ledger.get("DOC-1.1").withheld = True
    assert any("withheld" in p for p in check_sentence("He resells tickets.", ["DOC-1.1"], cf.ledger, cf.year)["problems"])


def test_dates_inside_a_cited_window_and_masked_refs():
    cf = mule()
    assert check_sentence("Credits continued on 2026-09-30.", ["AGG-IN"], cf.ledger, cf.year)["ok"]
    assert not check_sentence("Credits continued on 2026-11-30.", ["AGG-IN"], cf.ledger, cf.year)["ok"]
    assert check_sentence("Checking account ending 6620 was opened on 2026-08-28.", ["ACCT-1"], cf.ledger, cf.year)["ok"]
    assert "ending 9999" in check_sentence("Account ending 9999 was opened on 2026-08-28.", ["ACCT-1"], cf.ledger, cf.year)["unverified"]
    assert check_sentence("The checking account ends in 6620.", ["ACCT-1"], cf.ledger, cf.year)["ok"]
    assert "ending 9999" in check_sentence("The checking account ends in 9999.", ["ACCT-1"], cf.ledger, cf.year)["unverified"]


def test_a_comma_after_a_number_is_punctuation_not_a_thousands_separator():
    found = extract("A customer since 1998, aged 64, received 23, then 1,250 and 12,500.5 more.")
    assert found.numbers == [64.0, 23.0, 1250.0, 12500.5]
    cf = CaseFile(scenario("explained-novak"))
    assert check_sentence("Gabriel Novak, age 64, has been a customer since 1998, per KYC.", ["KYC-1"], cf.ledger, cf.year)["ok"]


def test_month_names_percentages_and_inline_citations():
    cf = mule()
    assert check_sentence("About 96% of credits left, the last on October 5, 2026.", ["AGG-OUT"], cf.ledger, cf.year)["ok"]
    text, cites = split_inline("The account received 23 P2P credits [AGG-IN-P2P, TXN-01].", [])
    assert text.endswith("credits.") and cites == ["AGG-IN-P2P", "TXN-01"]


def test_agent_draft_drops_unsupported_sentences_and_keeps_the_rest():
    cf = mule()
    sections = [{"section": "what", "sentences": [
        {"text": "The account received 23 P2P credits totalling $14,860.00.", "cites": ["AGG-IN-P2P"]},
        {"text": "The subject also wired $50,000.00 overseas.", "cites": ["AGG-OUT"]},
        {"text": "Nobody knows why.", "cites": []},
    ]}]
    checked = verify(sections, cf.ledger, cf.year, drop=True)
    assert checked["kept"] == 1 and len(checked["dropped"]) == 2 and checked["ok"]
    edited = verify(sections, cf.ledger, cf.year, drop=False)
    assert not edited["ok"] and not edited["every_sentence_cited"] and not edited["every_fact_verified"]


def test_extract_ignores_ids_times_and_years():
    found = extract("TXN-05 at 12:31 on 2026-09-25 in 2026 for $685.00 (IND-MM-01, ****3375)")
    assert found.money == [685.0] and found.numbers == [] and found.dates == ["2026-09-25"] and found.refs == ["3375"]
