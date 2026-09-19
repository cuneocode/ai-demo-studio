import observability_status as status


def test_key_does_not_prove_evaluations_or_delivery(monkeypatch):
    monkeypatch.setenv("GALILEO_API_KEY", "test")
    result = status.summarize()
    assert result["tracing"]["status"] == "configured"
    assert result["evaluators"]["status"] == "not_verified"
    assert result["controls"]["status"] == "not_integrated"


def test_stream_evidence_is_distinct_from_score_results():
    result = status.summarize({"has_traces": True, "scorers": ["agent_flow", "agent_efficiency", "action_advancement_luna"]})
    assert result["tracing"]["status"] == "traces_present"
    assert len(result["evaluators"]["names"]) == 3
    assert result["evaluators"]["results"] == "not_verified"


def test_unreadable_scorers_differ_from_no_scorers():
    assert status.summarize({"has_traces": True, "scorers": None})["evaluators"]["status"] == "not_verified"
    assert status.summarize({"has_traces": False, "scorers": []})["evaluators"]["status"] == "none_configured"


def test_missing_trace_count_does_not_mean_empty_stream(monkeypatch):
    monkeypatch.setenv("GALILEO_API_KEY", "test")
    assert status.summarize({"has_traces": None, "scorers": []})["tracing"]["status"] == "configured"
