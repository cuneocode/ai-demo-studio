"""Workbench cases: TabFormer test-window payments when the live or recorded scorer answers, else fixtures."""
import json
import os
from pathlib import Path

CASES_PATH = Path(__file__).resolve().parent / "data" / "cases.json"
LIVE_CASES_PATH = Path(__file__).resolve().parent / ".cache" / "studio_cases.json"
# Presenter hints stay server-side: the audience never sees them (plan U7).
PUBLIC_FIELDS = ("id", "label", "account", "merchant", "amount", "channel", "neighborhood")


def cases_file(live: bool = True) -> Path:
    """live=False when the sample scorer answers: its scores are keyed by the fixture cases."""
    override = os.getenv("FRAUD_CASES")
    if override:
        return Path(override)
    if live and os.getenv("FRAUD_BACKEND", "auto").lower() != "fixture" and LIVE_CASES_PATH.is_file():
        return LIVE_CASES_PATH
    return CASES_PATH


def load_cases(live: bool = True) -> list[dict]:
    return json.loads(cases_file(live).read_text())


def public_case(case: dict) -> dict:
    return {key: case[key] for key in PUBLIC_FIELDS if key in case}


def get_case(case_id: str, live: bool = True) -> dict | None:
    return next((case for case in load_cases(live) if case["id"] == case_id), None)
