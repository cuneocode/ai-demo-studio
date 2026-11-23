"""The wealth service's run timeline (services/common/runs.py): live events and recorded golden runs."""
from __future__ import annotations

import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVICE.parent / "common"))

from runs import RunStore, emit_current, emit_model_call, router as runs_router  # noqa: E402

DEMOS = SERVICE.parents[1] / "demos"
RECORDINGS = {
    "advisory": DEMOS / "client-advisory" / "fixtures" / "recorded",
    "research": DEMOS / "market-research" / "fixtures" / "recorded",
}

store = RunStore("wealth", component="wealth", cache_dir=SERVICE / ".cache" / "runs",
                 recordings_dir=RECORDINGS["advisory"], recording_sources=(RECORDINGS["research"],))

__all__ = ["RECORDINGS", "emit_current", "emit_model_call", "runs_router", "store"]
