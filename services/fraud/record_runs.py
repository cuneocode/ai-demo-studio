"""Records the committed golden triage runs in data/recorded/ through the real /runs API.

    cd services/fraud && .venv/bin/python record_runs.py            # scripted goldens (no model)
    cd services/fraud && .venv/bin/python record_runs.py --live     # plus live-agent goldens (Studio model chain)

Scores come from whichever scorer answers (live sidecar, recorded Sparky scores, or sample scores) and are
labelled as such inside the recording. AI Defense and Agent Control verdicts are real when configured in .env.
Analyst decisions are scripted here and recorded as "Maya (analyst)". All data is synthetic.
"""
import argparse
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent
ANALYST = "Maya (analyst)"

# scenario, disposition, follow-up decisions, write an analyst note first
SCRIPTED = [
    ("cpp-orbit", "block_and_reissue", {"bulk_reissue": "approve"}, False),
    ("card-testing", "block_and_reissue", {}, False),
    ("ato-illustrative", "contact_customer", {}, False),
    ("clean-grocery", "false_positive", {}, False),
    ("attack-dispute-injection", "contact_customer", {}, False),
    ("attack-note-pii", "escalate", {}, True),
]
LIVE = [
    ("cpp-orbit", "block_and_reissue", {"bulk_reissue": "approve"}, False),
    ("attack-dispute-injection", "contact_customer", {}, False),
]


def wait_for(client: TestClient, run_id: str, test, timeout: float = 300) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        page = client.get(f"/api/fraud/runs/{run_id}").json()
        found = test(page)
        if found:
            return found
        time.sleep(0.5)
    raise TimeoutError(f"{run_id} did not reach the expected step")


def pending(request_id: str):
    def check(page: dict):
        asked = {e["data"].get("request_id") for e in page["events"] if e["kind"] == "hitl.request"}
        answered = {e["data"].get("request_id") for e in page["events"] if e["kind"] == "hitl.decision"}
        if page["run"]["status"] != "running":
            raise RuntimeError(f"run ended before {request_id}: {page['run']['status']}")
        return page if request_id in asked - answered else None
    return check


def finished(page: dict):
    return page if page["run"]["status"] != "running" else None


def record(client: TestClient, store, scenario: str, disposition: str, follow_up: dict, note: bool, live: bool) -> Path:
    mode = "agent" if live else "scripted"
    started = client.post("/api/fraud/runs", json={"scenario": scenario, "label": f"Triage · {scenario}",
                                                   "input": {"score_queue": True, "mode": mode}}).json()
    run_id = started["run_id"]
    page = wait_for(client, run_id, pending("disposition"))
    request = next(e for e in page["events"] if e["kind"] == "hitl.request" and e["data"].get("request_id") == "disposition")
    case_file = request["data"]["case_file"]
    if live and case_file["mode"] == "scripted":
        raise RuntimeError("No model answered on the Studio chain; not recording a live golden.")

    saved_note = None
    if note:
        draft = case_file.get("analyst_note") or ""
        first = client.post("/api/fraud/notes", json={"note": draft, "case_id": case_file["case"]["id"], "run_id": run_id}).json()
        saved_note = draft if first["saved"] else first.get("masked")
        if not first["saved"] and saved_note:
            again = client.post("/api/fraud/notes", json={"note": saved_note, "case_id": case_file["case"]["id"], "run_id": run_id}).json()
            if not again["saved"]:
                saved_note = None

    body = {"request_id": "disposition", "decision": disposition, "by": ANALYST}
    if saved_note:
        body["note"] = saved_note
    assert client.post(f"/api/fraud/runs/{run_id}/decision", json=body).status_code == 200
    for request_id, decision in follow_up.items():
        wait_for(client, run_id, pending(request_id))
        assert client.post(f"/api/fraud/runs/{run_id}/decision",
                           json={"request_id": request_id, "decision": decision, "by": ANALYST}).status_code == 200
    page = wait_for(client, run_id, finished)
    result = page["run"].get("result") or {}
    served = (result.get("served_by") or {}).get("label") if isinstance(result.get("served_by"), dict) else None
    title = f"{case_file['scenario']['title']} · " + (f"live agent · {served}" if live else "scripted investigation")
    name = f"{scenario}-{'live' if live else 'scripted'}"
    return store.record_golden(run_id, name, title=title, synthetic=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--live", action="store_true", help="also record live-agent goldens on the Studio model chain")
    parser.add_argument("--only", nargs="*", help="scenario ids to record")
    args = parser.parse_args()
    os.environ.setdefault("FRAUD_DECISION_TIMEOUT", "300")

    import server
    from runlog import store

    store.cache_dir = None
    plans = [(item, False) for item in SCRIPTED] + ([(item, True) for item in LIVE] if args.live else [])
    with TestClient(server.app) as client:
        for (scenario, disposition, follow_up, note), live in plans:
            if args.only and scenario not in args.only:
                continue
            path = record(client, store, scenario, disposition, follow_up, note, live)
            print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
