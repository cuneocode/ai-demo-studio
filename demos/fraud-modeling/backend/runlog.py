"""The fraud service's shared run timeline (services/common/runs.py)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str((next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / "services" / "common")))
from runs import RunStore, emit_current, emit_model_call, router  # noqa: E402,F401

store = RunStore("fraud", component="fraud-triage", cache_dir=ROOT / ".cache" / "runs",
                 recordings_dir=ROOT / "data" / "recorded")
