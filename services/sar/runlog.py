"""The SAR service's run timeline (services/common/runs.py): live events, human decisions, recorded golden runs."""
from __future__ import annotations

import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVICE.parent / "common"))

from runs import RunStore, emit_current, router as runs_router  # noqa: E402

RECORDINGS = SERVICE / "data" / "recorded"

store = RunStore("sar", component="sar", cache_dir=SERVICE / ".cache" / "runs", recordings_dir=RECORDINGS)

__all__ = ["RECORDINGS", "emit_current", "runs_router", "store"]
