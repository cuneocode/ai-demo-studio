"""The fraud narrative's model endpoint: the first healthy backend in the Studio settings chain."""
import sys
from pathlib import Path

sys.path.insert(0, str(next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / "services" / "llm"))
from studio_models import Backend, ChainUnavailable, Selection, call_with_failover, egress_decision, pick, resolve  # noqa: E402,F401

USE_CASE = "fraud-modeling"


def resolve_narrative() -> Backend | None:
    return resolve(USE_CASE)


def pick_narrative() -> Selection | None:
    try:
        return pick(USE_CASE)
    except ChainUnavailable:
        return None
