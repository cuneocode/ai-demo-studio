"""The tool a bank's Deep Agent uses to talk to the other bank over A2A."""

from __future__ import annotations

from langchain_core.tools import StructuredTool

from lab.a2a_peer import A2AClientConfig, GatewayDenied, send_message
from lab.config import ORGANIZATION
from lab.controls import ControlBlocked, outbound_controls
from lab.events import current_conversation, current_run, emit


def partner_message_tool(config: A2AClientConfig, *, partner_name: str) -> StructuredTool:
    async def send(message: str) -> str:
        run_id = current_run.get()
        try:
            checks = await outbound_controls.check_outbound(message)
            await emit(run_id, "control", "Splunk Agent Control allowed the outbound message",
                       status="allowed", target=f"{ORGANIZATION}-agent-control",
                       data={"controls": checks})
        except ControlBlocked as exc:
            await emit(run_id, "control", "Splunk Agent Control blocked the outbound message",
                       status="denied", target=f"{ORGANIZATION}-agent-control", body=str(exc))
            return f"NOT SENT. {exc}"
        try:
            return await send_message(config, message, run_id=run_id,
                                      context_id=current_conversation.get())
        except GatewayDenied as exc:
            await emit(run_id, "a2a.denied", f"Gateway refused the message (HTTP {exc.status})",
                       status="denied", source=f"{ORGANIZATION}-gateway", body=exc.reason)
            return f"NOT DELIVERED. The gateway refused it with HTTP {exc.status}: {exc.reason}"

    return StructuredTool.from_function(
        coroutine=send,
        name=f"send_message_to_{config.partner.replace('-', '_')}",
        description=(
            f"Send a message to {partner_name}'s settlement investigation agent over A2A and "
            f"wait for its reply. Messages in one investigation share one A2A conversation, so "
            f"{partner_name} remembers earlier turns. Write a complete, self-contained message."
        ),
    )
