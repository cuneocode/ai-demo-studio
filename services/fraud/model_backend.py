"""The fraud narrative's model endpoint: the model chosen in Studio settings, else .env."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "llm"))
from studio_models import Backend, resolve  # noqa: E402

USE_CASE = "fraud-modeling"


def resolve_narrative() -> Backend | None:
    return resolve(USE_CASE)
