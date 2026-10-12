from types import SimpleNamespace

import pytest

from lab import controls


def evaluation(*, safe=True, matches=(), non_matches=(), errors=None):
    named = lambda names: [SimpleNamespace(control_name=name) for name in names]  # noqa: E731
    return SimpleNamespace(is_safe=safe, matches=named(matches), non_matches=named(non_matches), errors=errors)


@pytest.fixture
def gate(monkeypatch):
    monkeypatch.setattr(controls.OutboundControls, "_init", lambda self: setattr(self, "stream_id", "stream"))

    def returning(result):
        async def evaluate(*_args, **_kwargs):
            return result
        monkeypatch.setattr(controls.agent_control, "evaluate_controls", evaluate)
        return controls.OutboundControls()

    return returning


async def test_the_bound_control_evaluated_and_allowed(gate):
    checks = await gate(evaluation(non_matches=[controls.CONTROL_NAME])).check_outbound("TRD-847 status?")
    assert checks == [{"control": controls.CONTROL_NAME, "matched": False}]


async def test_a_matching_control_denies(gate):
    with pytest.raises(controls.ControlBlocked, match="denied"):
        await gate(evaluation(safe=False, matches=[controls.CONTROL_NAME])).check_outbound("account 99-1234-5678")


async def test_nothing_evaluated_is_not_an_allow(gate):
    # An unbound control leaves is_safe=True with no matches at all.
    with pytest.raises(controls.ControlBlocked, match="did not evaluate"):
        await gate(evaluation()).check_outbound("TRD-847 status?")


async def test_only_unrelated_controls_is_not_an_allow(gate):
    with pytest.raises(controls.ControlBlocked, match="did not evaluate"):
        await gate(evaluation(non_matches=["some-other-control"])).check_outbound("TRD-847 status?")


async def test_evaluation_errors_fail_closed(gate):
    with pytest.raises(controls.ControlBlocked, match="failed"):
        await gate(evaluation(non_matches=[controls.CONTROL_NAME], errors=["timeout"])).check_outbound("x")
