"""Read-only stream evidence, distinct from OTLP export and runtime controls.

Never infer evaluators from an API key, or successful scoring from configuration.
This module does not enable scorers, compute scores, or register controls.
"""
import asyncio
import json
import os
import time

_cache = None
_cache_key = None
_expires = 0
_lock = asyncio.Lock()


def read_stream():
    from galileo.log_streams import LogStreams
    from galileo.resources.api.run_scorer_settings import get_settings_projects_project_id_runs_run_id_scorer_settings_get as settings
    from galileo.resources.api.trace import query_traces_projects_project_id_traces_search_post as traces
    from galileo.resources.models.log_records_query_request import LogRecordsQueryRequest
    streams = LogStreams()
    stream = streams.get(name=os.environ["GALILEO_LOG_STREAM"], project_name=os.environ["GALILEO_PROJECT"])
    if stream is None:
        raise ValueError("Stream not found")
    response = settings.sync_detailed(project_id=stream.project_id, run_id=stream.id, client=streams.config.api_client)
    # Return only allowlisted evidence, never provider payloads or scorer prompts.
    scorers = None
    if int(response.status_code) == 200:
        data = json.loads(response.content)
        if isinstance(data.get("scorers"), list):
            scorers = list(dict.fromkeys(s.get("metric_name") or s.get("name") for s in data["scorers"] if isinstance(s, dict) and isinstance(s.get("metric_name") or s.get("name"), str)))
    has_traces = None
    try:
        # Scoped read-only search, not trace creation. Never return trace content.
        found = traces.sync_detailed(project_id=stream.project_id, client=streams.config.api_client,
            body=LogRecordsQueryRequest(log_stream_id=stream.id, limit=1, truncate_fields=True))
        if int(found.status_code) == 200:
            records = json.loads(found.content).get("records")
            if isinstance(records, list):
                has_traces = bool(records)
    except Exception:
        pass  # An unavailable count does not mean the stream is empty.
    return {"has_traces": has_traces, "scorers": scorers}


def summarize(evidence=None):
    configured = bool(os.getenv("GALILEO_API_KEY"))
    result = {
        "tracing": {"status": "configured" if configured else "not_configured", "transport": "Galileo SDK", "stream": os.getenv("GALILEO_LOG_STREAM", "")},
        "evaluators": {"status": "not_verified", "names": [], "results": "not_verified"},
        "controls": {"status": "not_integrated"},
    }
    if evidence is not None:
        if evidence["has_traces"] is not None:
            result["tracing"]["status"] = "traces_present" if evidence["has_traces"] else "awaiting_traces"
        if evidence["scorers"] is not None:
            result["evaluators"].update(status="configured" if evidence["scorers"] else "none_configured", names=evidence["scorers"])
    return result


async def stream_status():
    global _cache, _cache_key, _expires
    key = (os.getenv("GALILEO_PROJECT"), os.getenv("GALILEO_LOG_STREAM"), bool(os.getenv("GALILEO_API_KEY")))
    async with _lock:
        if _cache is not None and _cache_key == key and time.monotonic() < _expires:
            return _cache
        evidence = None
        if all(key):
            try:
                evidence = await asyncio.wait_for(asyncio.to_thread(read_stream), timeout=6)
            except Exception:
                pass  # Unknown is not disabled. Do not expose SDK errors.
        _cache, _cache_key, _expires = summarize(evidence), key, time.monotonic() + 60
        return _cache
