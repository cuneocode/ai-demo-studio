"""Splunk Agent Observability (Galileo SDK) for the agent run. Configuration is not delivery."""
from __future__ import annotations

import asyncio
import os


def galileo_configured() -> str:
    return "configured" if os.getenv("GALILEO_API_KEY") else "disabled"


def attach_galileo(name: str, input_text: str):
    if not os.getenv("GALILEO_API_KEY"):
        return None, [], "disabled"
    try:
        from galileo import GalileoLogger
        from galileo.handlers.langchain import GalileoAsyncCallback
        logger = GalileoLogger()
        logger.start_trace(input=input_text, name=name)
        return logger, [GalileoAsyncCallback(galileo_logger=logger, start_new_trace=False, flush_on_chain_end=False)], "enabled"
    except Exception:
        return None, [], "unavailable"


async def finish_galileo(logger, status: str, output: str, code: int = 200) -> str:
    if not logger:
        return status
    try:
        logger.conclude(output=output, status_code=code)
        uploaded = await asyncio.wait_for(logger.async_flush(), 8)
        return "recorded" if uploaded else "no trace recorded"
    except Exception:
        return "delivery unavailable"
    finally:
        try:
            logger.disable_agent_control()
        except Exception:
            pass


def summarize(controls_health: dict) -> dict:
    configured = bool(os.getenv("GALILEO_API_KEY"))
    return {
        "tracing": {"status": "configured" if configured else "not_configured", "transport": "Galileo SDK",
                    "stream": os.getenv("GALILEO_LOG_STREAM", "")},
        "evaluators": {"status": "not_verified", "names": [], "results": "not_verified"},
        "controls": {"status": "enforcing" if controls_health.get("status") == "enforcing" else "local_checks",
                     "names": controls_health.get("names", []), "detail": controls_health.get("detail")},
    }
