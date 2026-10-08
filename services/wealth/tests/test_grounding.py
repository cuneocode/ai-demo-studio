import grounding


def test_drops_ungrounded_note_claims(snapshot):
    note = {
        "summary": "Beat rate 100% while the stock lagged SPY.",
        "bullets": [
            "Beat rate 1.0 over 5 quarters",
            "The moon colony branch is now live",
        ],
        "citations": [
            {"field": "beatRate", "value": "1.0"},
            {"field": "fantasy", "excerpt": "lunar branch"},
        ],
    }
    result = grounding.ground_note(note, snapshot)
    assert result["status"] == "ready"
    assert result["dropped_claims"] >= 1
    assert all("moon" not in item.lower() for item in result["bullets"])
    assert all("lunar" not in str(item.get("excerpt") or "") for item in result["citations"])


def test_ungrounded_only_note_is_omitted(snapshot):
    result = grounding.ground_note({
        "summary": "Secret acquisition of a lunar bank",
        "bullets": ["Secret acquisition of a lunar bank"],
        "citations": [{"field": "x", "excerpt": "lunar bank"}],
    }, snapshot)
    assert result["status"] == "omitted"
    assert "Ungrounded" in result["reason"]


def test_rewrites_buy_action(snapshot):
    rec = grounding.ground_recommendation({"action": "buy", "thesis": "Beat rate 1.0"}, snapshot, [])
    assert rec["status"] == "ready"
    assert rec["action"] == "review"


def test_briefing_excerpts_ground_brief(snapshot):
    briefing = {"objectives": {"facts": [{"text": "Expand digital platforms", "excerpt": "Expand digital platforms"}]}}
    brief = grounding.ground_brief({
        "opening": "Expand digital platforms remains the entitled objective.",
        "agenda": ["Review Expand digital platforms"],
        "discussion_points": ["Holdings include JPM"],
        "citations": [{"field": "objectives", "excerpt": "Expand digital platforms"}],
    }, snapshot, briefing, {"ticker": "JPM"}, [{"ticker": "JPM", "weight": 0.4}], [])
    assert brief["status"] == "ready"
    assert brief["citations"]
