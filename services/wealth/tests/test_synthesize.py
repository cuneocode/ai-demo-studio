import security
import synthesize


class _Draft:
    def __init__(self, **payload):
        self._payload = payload

    def model_dump(self):
        return self._payload


def test_draft_note_omits_on_defense(monkeypatch, snapshot):
    async def blocked(*_args, **_kwargs):
        raise security.DefenseBlocked("blocked")

    class Fake:
        def with_structured_output(self, _schema, **_kwargs):
            return self

        ainvoke = blocked

    monkeypatch.setattr(synthesize, "chat_model", lambda _use_case: Fake())
    note, rec = __import__("asyncio").run(synthesize.draft_note("JPM", {"earnings": {}}, [], snapshot, None))
    assert note["status"] == "blocked"
    assert rec["status"] == "blocked"
    assert rec["disclaimer"] == synthesize.RESEARCH_DISCLAIMER


def test_draft_note_grounds_structured_output(monkeypatch, snapshot):
    async def complete(*_args, **_kwargs):
        return _Draft(
            summary="Beat rate appears in the tools as 20.8 surprise.",
            bullets=["Surprise(%) 20.8 on the latest print"],
            citations=[{"field": "surprisePct", "value": "20.8"}],
            action="watch",
                thesis="JPMorgan Chase lagged SPY on beat_vs_spy.",
        )

    class Fake:
        def with_structured_output(self, _schema, **_kwargs):
            return self

        ainvoke = complete

    monkeypatch.setattr(synthesize, "chat_model", lambda _use_case: Fake())
    note, rec = __import__("asyncio").run(synthesize.draft_note(
        "JPM",
        {"earnings": {"beatRate": 1.0}},
        [{"id": "beat_vs_spy", "left": "x", "right": "y", "detail": "z", "severity": "high"}],
        snapshot,
        None,
    ))
    assert note["status"] == "ready"
    assert rec["status"] == "ready"
    assert rec["action"] == "watch"
    assert rec["disclaimer"]


def test_research_draft_coerces_citation_map():
    draft = synthesize.ResearchDraft.model_validate({
        "thesis": "JPM lagged SPY on beat_vs_spy.",
        "action": "review",
        "citations": {"earnings_beat_rate": 0.82},
    })
    assert draft.summary == "JPM lagged SPY on beat_vs_spy."
    assert draft.citations[0].field == "earnings_beat_rate"
    assert draft.citations[0].value == "0.82"
