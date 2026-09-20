"""Workbench cases: TabFormer test-window payments when present, else fixtures."""
import json
import os
from pathlib import Path

CASES_PATH = Path(__file__).resolve().parent / "data" / "cases.json"
LIVE_CASES_PATH = Path(__file__).resolve().parent / ".cache" / "studio_cases.json"


def cases_file() -> Path:
    override = os.getenv("FRAUD_CASES")
    if override:
        return Path(override)
    if os.getenv("FRAUD_BACKEND", "auto").lower() != "fixture" and LIVE_CASES_PATH.is_file():
        return LIVE_CASES_PATH
    return CASES_PATH


def load_cases() -> list[dict]:
    return json.loads(cases_file().read_text())


def public_case(case: dict) -> dict:
    return {key: case[key] for key in (
        "id", "label", "account", "merchant", "amount", "channel", "neighborhood", "hint"
    )}


def get_case(case_id: str) -> dict | None:
    return next((case for case in load_cases() if case["id"] == case_id), None)
