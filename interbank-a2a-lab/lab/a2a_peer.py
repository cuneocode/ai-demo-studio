"""Official A2A SDK on both sides of every bank: a client to send, a server to receive.

Sending: the agent never addresses the other bank directly. It talks to its own
bank's agentgateway egress listener, which inspects the message with Cisco AI
Defense, swaps credentials, and forwards it to the partner's ingress gateway.

Receiving: an A2A JSON-RPC server (AgentExecutor + DefaultRequestHandler) that
only accepts calls signed by its own bank's gateway.
"""

from __future__ import annotations

import ssl
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
from a2a.client import A2ACardResolver, A2AClientError, ClientConfig, create_client
from a2a.helpers.proto_helpers import new_task_from_user_message
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.context import ServerCallContext
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import ServerCallContextBuilder, create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import AgentCard, Message, Part, Role, SendMessageRequest, TaskState
from opentelemetry.trace import SpanKind
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from lab.auth import AuthenticationError, verify_gateway_token
from lab.config import ORGANIZATION, SERVICE_NAME, secret_file
from lab.events import emit
from lab.telemetry import continue_from, inject_headers, set_output, span


class GatewayDenied(RuntimeError):
    def __init__(self, status: int, reason: str) -> None:
        super().__init__(reason)
        self.status = status
        self.reason = reason


def mtls_context(ca_file: str, cert_file: str, key_file: str) -> ssl.SSLContext:
    context = ssl.create_default_context(cafile=ca_file)
    context.minimum_version = ssl.TLSVersion.TLSv1_3
    context.load_cert_chain(cert_file, key_file)
    return context


# ---------------------------------------------------------------- sending ----

@dataclass
class A2AClientConfig:
    partner: str              # "bank-b"
    gateway_url: str          # this bank's own egress gateway, e.g. https://bank-a-gateway:8443
    ca_file: str
    cert_file: str
    key_file: str
    token_file_env: str       # bearer token the egress gateway admits


async def send_message(config: A2AClientConfig, text: str, *, run_id: str, context_id: str) -> str:
    """Send one A2A message to the partner bank's agent and return its reply text."""
    gateway = config.gateway_url.rstrip("/")
    with span(
        f"invoke_agent {config.partner}-agent",
        kind="agent",
        label=f"{config.partner}-agent",
        span_kind=SpanKind.CLIENT,
        input=text,
        attributes={
            "gen_ai.provider.name": "a2a",
            "a2a.context_id": context_id,
            "server.address": urlsplit(gateway).hostname,
        },
    ) as current:
        headers = inject_headers({
            "authorization": f"Bearer {secret_file(config.token_file_env)}",
            "x-investigation-id": run_id,
        })
        denied: dict[str, object] = {}

        async def keep_gateway_denial(response: httpx.Response) -> None:
            if response.status_code >= 400:
                await response.aread()
                denied.update(status=response.status_code, reason=response.text[:2000])

        async with httpx.AsyncClient(
            verify=mtls_context(config.ca_file, config.cert_file, config.key_file),
            headers=headers,
            timeout=httpx.Timeout(900, connect=10),
            event_hooks={"response": [keep_gateway_denial]},
        ) as transport:
            await emit(run_id, "a2a.send", f"A2A SendMessage to {config.partner}",
                       target=f"{ORGANIZATION}-gateway", body=text,
                       data={"context_id": context_id, "via": gateway})
            try:
                card = await A2ACardResolver(transport, gateway).get_agent_card()
                advertised = [i.url for i in card.supported_interfaces]
                if not advertised or any(_host(url) != _host(gateway) for url in advertised):
                    raise GatewayDenied(0, f"Agent Card advertised {advertised}, not {gateway}")
                client = await create_client(card, ClientConfig(
                    streaming=False,
                    httpx_client=transport,
                    supported_protocol_bindings=["JSONRPC"],
                ))
                request = SendMessageRequest(message=Message(
                    message_id=str(uuid.uuid4()),
                    context_id=context_id,
                    role=Role.ROLE_USER,
                    parts=[Part(text=text)],
                    metadata={"investigation_id": run_id, "sender": ORGANIZATION},
                ))
                task = None
                async for response in client.send_message(request):
                    if response.HasField("task"):
                        task = response.task
            except (A2AClientError, httpx.HTTPError) as exc:
                if denied:
                    set_output(current, f"Gateway denied the message (HTTP {denied['status']}): "
                                        f"{denied['reason']}")
                    raise GatewayDenied(int(denied["status"]), str(denied["reason"])) from exc
                raise
        if task is None or task.status.state != TaskState.TASK_STATE_COMPLETED:
            raise RuntimeError(f"{config.partner} did not complete the A2A task")
        reply = "\n".join(
            part.text for artifact in task.artifacts for part in artifact.parts if part.text
        )
        set_output(current, reply)
        current.set_attribute("a2a.task_id", task.id)
        await emit(run_id, "a2a.reply", f"A2A reply from {config.partner}",
                   source=f"{ORGANIZATION}-gateway", target=SERVICE_NAME, body=reply,
                   data={"task_id": task.id, "context_id": task.context_id,
                         "agent": card.name})
        return reply


def _host(url: str) -> tuple[str | None, int | None]:
    parts = urlsplit(url)
    return parts.hostname, parts.port


# -------------------------------------------------------------- receiving ----

@dataclass
class Inbound:
    text: str
    caller: str        # who the gateway says sent it: "operations-console" | "bank-a" | "bank-b"
    run_id: str
    context_id: str
    task_id: str


Handler = Callable[[Inbound], Awaitable[str]]


class GatewayIdentity(ServerCallContextBuilder):
    """Expose the gateway-verified caller and trace headers to the executor."""

    def build(self, request: Request) -> ServerCallContext:
        return ServerCallContext(state={
            "caller": request.state.caller,
            "headers": dict(request.headers),
        })


class BankAgentExecutor(AgentExecutor):
    def __init__(self, handle: Handler) -> None:
        self.handle = handle

    async def execute(self, context: RequestContext, event_queue) -> None:
        task = context.current_task or new_task_from_user_message(context.message)
        await event_queue.enqueue_event(task)
        updater = TaskUpdater(event_queue, task.id, task.context_id)
        await updater.start_work()
        state = context.call_context.state
        headers = state["headers"]
        inbound = Inbound(
            text=context.get_user_input(),
            caller=state["caller"],
            run_id=headers.get("x-investigation-id", task.context_id),
            context_id=task.context_id,
            task_id=task.id,
        )
        with continue_from(headers), span(
            f"{SERVICE_NAME} handles A2A message from {inbound.caller}",
            kind="agent",
            label=SERVICE_NAME,
            span_kind=SpanKind.SERVER,
            input=inbound.text,
            attributes={
                "gen_ai.provider.name": "a2a",
                "a2a.task_id": task.id,
                "a2a.context_id": task.context_id,
                "a2a.caller": inbound.caller,
            },
        ) as current:
            await emit(inbound.run_id, "a2a.receive", f"A2A message received from {inbound.caller}",
                       source=f"{ORGANIZATION}-gateway", body=inbound.text,
                       data={"task_id": task.id, "context_id": task.context_id})
            try:
                reply = await self.handle(inbound)
            except Exception as exc:
                await emit(inbound.run_id, "run", f"{SERVICE_NAME} failed", status="error",
                           body=f"{type(exc).__name__}: {exc}")
                await updater.failed(_agent_message(task, f"{SERVICE_NAME} failed: {exc}"))
                raise
            set_output(current, reply)
        await updater.add_artifact([Part(text=reply)], name=f"{SERVICE_NAME}-reply")
        await updater.complete(_agent_message(task, reply))
        await emit(inbound.run_id, "a2a.respond", f"{SERVICE_NAME} replies over A2A",
                   target=f"{ORGANIZATION}-gateway", body=reply, data={"task_id": task.id})

    async def cancel(self, context: RequestContext, event_queue) -> None:
        updater = TaskUpdater(event_queue, context.task_id, context.context_id)
        await updater.cancel()


def _agent_message(task, text: str) -> Message:
    return Message(message_id=str(uuid.uuid4()), task_id=task.id, context_id=task.context_id,
                   role=Role.ROLE_AGENT, parts=[Part(text=text)])


def a2a_server(
    card: AgentCard,
    handle: Handler,
    *,
    jwks_file: str,
    issuer: str,
    audience: str,
    callers: dict[str, str],
) -> Starlette:
    """callers maps the gateway-signed JWT subject to the caller name the agent sees."""
    handler = DefaultRequestHandler(
        agent_executor=BankAgentExecutor(handle),
        task_store=InMemoryTaskStore(),
        agent_card=card,
    )
    routes = [Route("/health", lambda _: JSONResponse({"status": "ok"}))]
    routes += create_agent_card_routes(card)
    routes += create_jsonrpc_routes(handler, rpc_url="/", context_builder=GatewayIdentity())

    async def only_my_gateway(request: Request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        try:
            claims = verify_gateway_token(request.headers.get("authorization"), jwks_file=jwks_file,
                                          issuer=issuer, audience=audience)
            request.state.caller = callers[claims["sub"]]
        except (AuthenticationError, KeyError):
            return JSONResponse({"error": "caller is not admitted by this bank's gateway"}, 401)
        return await call_next(request)

    app = Starlette(routes=routes)
    app.add_middleware(BaseHTTPMiddleware, dispatch=only_my_gateway)
    return _A2AVersion(app)


class _A2AVersion:
    """agentgateway 1.6 forwards A2A requests without the 1.0 version header the SDK expects."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http" and scope["method"] == "POST":
            scope["headers"] = [h for h in scope["headers"] if h[0] != b"a2a-version"]
            scope["headers"].append((b"a2a-version", b"1.0"))
        await self.app(scope, receive, send)
