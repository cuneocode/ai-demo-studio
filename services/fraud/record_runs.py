"""Writes the committed sample recordings in data/recorded/ by scoring against the fixture backend.

    cd services/fraud && .venv/bin/python record_runs.py

No sidecar, no model, no AI Defense: the recordings are synthetic sample runs, marked as such.
"""
import os

os.environ.update({"FRAUD_BACKEND": "fixture", "FRAUD_ENABLE_NARRATIVE": "false", "AIDEFENSE_MODE": "off",
                   "FRAUD_ENV_FILE": os.devnull})

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
from runlog import store  # noqa: E402

RECORDINGS = [
    ("cpp-orbit-sample", "txn-compromised-merchant", "Compromised merchant · sample scores"),
    ("clean-grocery-sample", "txn-clean-pos", "Clean grocery purchase · sample scores"),
]


def main() -> None:
    store.cache_dir = None
    with TestClient(server.app) as client:
        for name, case_id, title in RECORDINGS:
            body = client.post("/api/fraud/score", json={"case_id": case_id}).json()
            assert body["backend"] == "fixture", body
            path = store.record_golden(body["run_id"], name, title=title, synthetic=True)
            print(f"wrote {path.relative_to(server.Path(__file__).resolve().parent)}")


if __name__ == "__main__":
    main()
