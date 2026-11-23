"""agentgateway ExtProc service: Cisco AI Defense on every A2A request and response.

agentgateway 1.6's native prompt guards apply to LLM routes, not A2A routes, so each
bank's gateway sends A2A traffic through this Envoy ExtProc service. The gateway
buffers the full body, this service inspects the A2A text with Cisco AI Defense, and
returns either CONTINUE or an immediate 403. Any error returns 503 (fail closed).

One gRPC port per gateway hop, so every verdict says exactly where it was enforced.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import grpc
from envoy.service.ext_proc.v3 import external_processor_pb2 as pb
from envoy.service.ext_proc.v3 import external_processor_pb2_grpc as pb_grpc
from envoy.type.v3 import http_status_pb2
from opentelemetry.trace import SpanKind

from lab.config import ORGANIZATION
from lab.events import emit
from lab.telemetry import continue_from, set_output, setup_telemetry, span
from policy.ai_defense import InspectionUnavailable, inspect_chat

MAX_BODY = 256 * 1024

# Hop name -> gRPC port. Matches the extProc hosts in gateways/<bank>.yaml.
HOPS = {
    "bank-a": {"egress-to-bank-b": 9001, "ingress-from-bank-b": 9002, "ingress-from-console": 9003},
    "bank-b": {"egress-to-bank-a": 9001, "ingress-from-bank-a": 9002},
}[ORGANIZATION]


def a2a_text(body: bytes) -> str:
    """The conversational text in an A2A JSON-RPC request/response or Agent Card."""
    if not body:
        return ""
    try:
        payload = json.loads(body)
    except ValueError:
        return body.decode(errors="replace")
    found: list[str] = []

    def parts(message: Any) -> None:
        for part in (message or {}).get("parts", []):
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                found.append(part["text"])

    if isinstance(payload, dict):
        params, result = payload.get("params") or {}, payload.get("result") or {}
        parts(params.get("message"))
        task = result.get("task") or {}
        for artifact in task.get("artifacts", []):
            parts(artifact)
        parts(result.get("message"))
        if "supportedInterfaces" in payload:  # Agent Card
            found += [payload.get("name", ""), payload.get("description", "")]
            for skill in payload.get("skills", []):
                found += [skill.get("description", ""), *skill.get("examples", [])]
    if found:
        return "\n".join(t for t in found if t)
    return "\n".join(_strings(payload))


def _strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _strings(v)]
    if isinstance(value, list):
        return [s for v in value for s in _strings(v)]
    return []


class AIDefenseProcessor(pb_grpc.ExternalProcessorServicer):
    def __init__(self, hop: str) -> None:
        self.hop = hop
        self.gateway = f"{ORGANIZATION}-gateway"

    async def Process(self, requests, context):
        headers: dict[str, str] = {}
        bodies = {"request_body": bytearray(), "response_body": bytearray()}
        async for request in requests:
            kind = request.WhichOneof("request")
            if kind in ("request_headers", "response_headers"):
                for h in getattr(request, kind).headers.headers:
                    headers[h.key.lower()] = h.raw_value.decode(errors="replace") or h.value
                yield _continue(kind)
            elif kind in bodies:
                chunk = getattr(request, kind)
                bodies[kind].extend(chunk.body)
                if len(bodies[kind]) > MAX_BODY:
                    yield _deny(413, {"error": "A2A body exceeds the inspection limit"})
                    return
                if not chunk.end_of_stream:
                    yield _continue(kind)
                    continue
                stage = "request" if kind == "request_body" else "response"
                denial = await self.inspect(stage, bytes(bodies[kind]), headers)
                if denial:
                    yield denial
                    return
                yield _continue(kind)
            else:
                yield _continue(kind or "request_trailers")

    async def inspect(self, stage: str, body: bytes, headers: dict[str, str]):
        run_id = headers.get("x-investigation-id", "")
        text = a2a_text(body)
        card = headers.get(":path", "").startswith("/.well-known/")
        where = f"{self.gateway} {self.hop} {'Agent Card' if card else 'A2A ' + stage}"
        if not text.strip():
            return None
        with continue_from(headers), span(
            f"Cisco AI Defense: {where}",
            kind="tool",
            label="cisco_ai_defense.inspect_chat",
            span_kind=SpanKind.INTERNAL,
            input=text,
            attributes={"gateway.hop": self.hop, "gateway.stage": stage},
        ) as current:
            role = "user" if stage == "request" else "assistant"
            try:
                verdict = await inspect_chat([{"role": role, "content": text}],
                                             run_id=run_id, hop=f"{self.hop}:{stage}")
            except InspectionUnavailable as exc:
                set_output(current, {"allowed": False, "error": str(exc)})
                await emit(run_id, "guardrail", f"AI Defense unavailable at {where}",
                           status="error", source=self.gateway,
                           target=f"{ORGANIZATION}-ai-defense", body=text,
                           data={"hop": self.hop, "stage": stage, "fail_closed": True})
                return _deny(503, {"error": "AI Defense unavailable; blocked (fail closed)",
                                   "gateway": self.gateway, "hop": self.hop})
            allowed = verdict["is_safe"]
            current.set_attribute("guardrail.action", "allow" if allowed else "deny")
            set_output(current, verdict)
            await emit(run_id, "guardrail",
                       f"AI Defense {'allowed' if allowed else 'BLOCKED'}: {where}",
                       status="allowed" if allowed else "denied", source=self.gateway,
                       target=f"{ORGANIZATION}-ai-defense", body=text,
                       data={"hop": self.hop, "stage": stage, "agent_card": card, **verdict})
        if allowed:
            return None
        return _deny(403, {
            "error": f"Blocked by {ORGANIZATION} AI gateway: Cisco AI Defense policy violation",
            "gateway": self.gateway,
            "hop": self.hop,
            "stage": stage,
            "classifications": verdict["classifications"],
            "rules": verdict["rules"],
            "event_id": verdict["event_id"],
        })


def _continue(kind: str) -> pb.ProcessingResponse:
    common = pb.CommonResponse(status=pb.CommonResponse.CONTINUE)
    if kind in ("request_headers", "response_headers"):
        return pb.ProcessingResponse(**{kind: pb.HeadersResponse(response=common)})
    if kind in ("request_body", "response_body"):
        return pb.ProcessingResponse(**{kind: pb.BodyResponse(response=common)})
    return pb.ProcessingResponse(**{kind: pb.TrailersResponse()})


def _deny(status: int, body: dict[str, Any]) -> pb.ProcessingResponse:
    return pb.ProcessingResponse(immediate_response=pb.ImmediateResponse(
        status=http_status_pb2.HttpStatus(code=status),
        headers=pb.HeaderMutation(set_headers=[]),
        body=json.dumps(body).encode(),
        details=body.get("error", "denied"),
    ))


async def main() -> None:
    setup_telemetry()
    servers = []
    for hop, port in HOPS.items():
        server = grpc.aio.server(options=[("grpc.max_receive_message_length", MAX_BODY * 2)])
        pb_grpc.add_ExternalProcessorServicer_to_server(AIDefenseProcessor(hop), server)
        # Plaintext gRPC on the bank-internal policy network shared only with its gateway.
        server.add_insecure_port(f"0.0.0.0:{port}")
        await server.start()
        servers.append(server)
    await asyncio.gather(*(s.wait_for_termination() for s in servers))


if __name__ == "__main__":
    asyncio.run(main())
