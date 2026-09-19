"""Run manually against the local API: .venv/bin/python tests/live_smoke.py.
Uses real model calls; prints only fictional answers and assertion results.
"""
import httpx

with httpx.Client(base_url="http://127.0.0.1:8011", timeout=155) as client:
    print("HEALTH", client.get("/api/banking/health").json())
    session = None
    for question, terms in [
        ("What's my credit score?", ["550"]),
        ("Compare Orbit and Celestial annual fees.", ["orbit", "celestial", "99"]),
        ("Based on my credit score, which of those cards meet the score requirement?", ["550", "orbit", "celestial"]),
        ("What is tomorrow's weather in Paris?", []),
    ]:
        payload = {"message": question}
        if session:
            payload["session_id"] = session
        response = client.post("/api/banking/chat", json=payload)
        if "weather" in question:
            assert response.status_code == 422, "Off-topic request should be blocked"
            data = response.json()
            assert data["controls"]["status"] == "blocked"
            assert data["session_reset"] is True
            print("QUESTION", question, "BLOCKED", data["controls"])
            continue
        response.raise_for_status()
        data = response.json()
        session = data["session_id"]
        print("QUESTION", question, "ANSWER", data["answer"], "TOOLS", [t["name"] for t in data["trace"]], "SOURCES", len(data["sources"]), "TELEMETRY", data["telemetry"])
        assert all(term in data["answer"].lower() for term in terms), "Answer did not match expected source facts"
        if "annual fees" in question:
            assert data["sources"], "Missing retrieval sources"
    print("LIVE_SMOKE_PASSED")
