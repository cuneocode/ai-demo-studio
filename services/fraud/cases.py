"""Alert-queue cases: TabFormer test-window payments when the live or recorded scorer answers, else fixtures.

Public fields never carry ground truth. `tabformer_label` (trained mode) and presenter
hints stay server-side; the label is revealed only after the analyst's disposition.
"""
import json
import os
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
CASES_PATH = DATA / "cases.json"
SCENARIOS_PATH = DATA / "scenarios.json"
LIVE_CASES_PATH = Path(__file__).resolve().parent / ".cache" / "studio_cases.json"
PUBLIC_FIELDS = ("id", "label", "account", "merchant", "amount", "channel", "neighborhood", "scenario", "history",
                 "at", "as_of", "mcc", "mcc_label", "currency", "situation", "scoreable_by_model", "illustrative",
                 "customer", "customer_id")
HIDDEN_FIELDS = frozenset({"tabformer_label", "hint"})
# select_studio_cases.py scenario names → the fixture case that stands in for each one.
SCENARIO_FIXTURE = {"cpp": "cpp-orbit", "card_testing": "card-testing", "clean_control": "clean-grocery", "ato": "ato-illustrative"}
CHANNELS = {"Online Transaction": "cnp", "Chip Transaction": "pos", "Swipe Transaction": "pos"}


def cases_file(live: bool = True) -> Path:
    """live=False when the sample scorer answers: its scores are keyed by the fixture cases."""
    override = os.getenv("FRAUD_CASES")
    if override:
        return Path(override)
    if live and os.getenv("FRAUD_BACKEND", "auto").lower() != "fixture" and LIVE_CASES_PATH.is_file():
        return LIVE_CASES_PATH
    return CASES_PATH


def _fixtures() -> dict[str, dict]:
    return {case["id"]: case for case in json.loads(CASES_PATH.read_text())}


def _with_context(case: dict, fixtures: dict[str, dict]) -> dict:
    """TabFormer cases carry no profile, network summary, or playbook; borrow the stand-in fixture's, honestly marked."""
    if case.get("synthetic") and "profile" in case:
        return case
    stand_in = fixtures.get(SCENARIO_FIXTURE.get(case.get("scenario") or "", ""), fixtures.get("cnp-verify", {}))
    history = case.get("history") or {}
    network = {"window_days": None, "cards_seen": history.get("merchant_prior_cards"),
               "cards_confirmed_fraud": history.get("merchant_prior_fraud_cards"), "dispute_ratio": None,
               "point_in_time": True}
    return {
        **case,
        "channel": CHANNELS.get(case.get("raw_channel") or "", case.get("channel") or "cnp"),
        "at": case.get("at") or case.get("as_of"),
        "situation": case.get("situation") or case.get("neighborhood"),
        "scoreable_by_model": True,
        "profile": case.get("profile") or {"typical_amount": None, "prior_disputes": 0},
        "signals": case.get("signals") or {"new_device": False, "address_change_hours": None, "reissue_requested": False},
        "network": case.get("network") or network,
        "similar": case.get("similar") or [],
        "playbook": case.get("playbook") or stand_in.get("playbook", "general"),
        "source": "tabformer",
    }


def load_cases(live: bool = True) -> list[dict]:
    raw = json.loads(cases_file(live).read_text())
    fixtures = _fixtures()
    return [_with_context(case, fixtures) for case in raw]


def public_case(case: dict) -> dict:
    return {key: case[key] for key in PUBLIC_FIELDS if key in case and key not in HIDDEN_FIELDS}


def get_case(case_id: str, live: bool = True) -> dict | None:
    return next((case for case in load_cases(live) if case["id"] == case_id), None)


def label_reveal(case: dict) -> str | None:
    """The TabFormer ground-truth label, for display only after the analyst has decided."""
    label = case.get("tabformer_label")
    return label if label in {"fraud", "legit"} else None


def load_scenarios() -> dict:
    return json.loads(SCENARIOS_PATH.read_text())


def scenario_for(scenario_id: str, live: bool = True) -> tuple[dict, dict] | None:
    """(scenario card, its case). In trained mode the card maps to the TabFormer case picked for that scenario."""
    scenario = next((item for item in load_scenarios()["scenarios"] if item["id"] == scenario_id), None)
    if not scenario:
        return None
    cases = load_cases(live)
    wanted = scenario["case_id"]
    case = next((item for item in cases if item["id"] == wanted), None)
    if case is None:
        kind = next((name for name, fixture in SCENARIO_FIXTURE.items() if fixture == wanted), None)
        case = next((item for item in cases if kind and item.get("scenario") == kind), None)
    if case is None:
        # ATO is illustrative and never in the TabFormer queue: it always runs on its fixture.
        case = _fixtures().get(wanted)
    return (scenario, case) if case else None
