from casefile import CaseFile, catalogue, load_case, scenario
from typologies import evaluate, recommendation


def results(scenario_id):
    return {item["id"]: item for item in evaluate(load_case(scenario(scenario_id)["case"]), catalogue())}


def indicators(result):
    return {item["id"]: item for item in result["indicators"]}


def test_money_mule_matches_on_every_indicator():
    mule = results("mule-reyes")["money_mule"]
    assert mule["matched"] and mule["fired"] == 6
    found = indicators(mule)
    assert found["MM-01"]["observed_text"] == "96.0%"
    assert found["MM-02"]["observed"] == 17
    assert round(found["MM-03"]["observed"], 1) == 9.9
    assert found["MM-04"]["observed"] == 10
    assert found["MM-05"]["observed"] == 27


def test_structuring_matches_and_mule_does_not():
    found = results("structuring-harbor")
    assert found["structuring"]["matched"] and found["structuring"]["fired"] == 5
    assert indicators(found["structuring"])["ST-01"]["observed"] == 12
    assert indicators(found["structuring"])["ST-02"]["observed"] == 56300
    assert not found["money_mule"]["matched"]
    assert not found["funnel_account"]["matched"], "FA-02 fires on the wire, but FA-01 is required"


def test_explained_activity_matches_nothing_and_recommends_no_file():
    found = results("explained-novak")
    assert not any(item["matched"] for item in found.values())
    assert [i["id"] for i in found["money_mule"]["indicators"] if i["status"] == "fired"] == ["MM-03"]
    assert recommendation(list(found.values())) == "no_file"


def test_own_account_transfer_is_not_pass_through():
    mm01 = indicators(results("explained-novak")["money_mule"])["MM-01"]
    assert mm01["status"] == "clear" and mm01["observed"] < 0.01


def test_declined_attempt_is_reported_but_not_counted_as_posted():
    cf = CaseFile(scenario("mule-reyes"))
    text = cf.ledger.get("AGG-FRAUD").text
    assert "$480.00" in text and "****1188" in text and "declined" in text
    assert "23 totalling $14,860.00" in cf.ledger.get("AGG-IN").text


def test_ledger_keeps_pii_out_of_model_visible_text():
    cf = CaseFile(scenario("mule-reyes"))
    every = " ".join(item.text for item in cf.ledger.items.values())
    assert "000-41-2207" not in every
    assert "2004-03-11" not in every
    assert "88 Example Terrace" not in every
