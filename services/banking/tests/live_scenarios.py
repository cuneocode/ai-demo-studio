"""Manual live regression for the exact UI presets; real model/API calls.

Run from the project root with services/banking/.venv/bin/python
services/banking/tests/live_scenarios.py. Each preset starts a fresh conversation.
No policy overrides or canned responses; mismatched outcomes fail the test.
"""
import json
import os
from pathlib import Path

import httpx


def main():
    cases = json.loads((Path(__file__).resolve().parents[3] / "app/banking-scenarios.json").read_text())
    with httpx.Client(base_url=os.getenv("BANKING_TEST_URL", "http://127.0.0.1:8011"), timeout=150) as client:
        for case in cases:
            response = client.post("/api/banking/chat", json={"message": case["prompt"]})
            data = response.json()
            assert response.status_code == case["httpStatus"], (case["id"], response.status_code)
            security, controls = data["security"], data["controls"]
            if case["id"] == "success":
                assert "550" in data["answer"]
                assert any(word in data["answer"].lower() for word in ("demo", "mock"))
                assert security["status"] == "allowed" and controls["status"] == "allowed"
                assert len(controls["checks"]) == 3
            elif case["id"] == "ai-defense":
                assert security["status"] == "blocked" and controls["status"] == "not_checked"
            else:
                assert security["status"] == "allowed" and controls["status"] == "blocked"
                assert any(c["name"] == "Banking scope" and c["status"] == "blocked" for c in controls["checks"])
            print(f'{case["id"]}: PASS ({response.status_code})', flush=True)


if __name__ == "__main__":
    main()
