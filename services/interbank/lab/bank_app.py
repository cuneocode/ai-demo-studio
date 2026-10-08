"""Agent Card and TLS server shared by both banks' agents."""

from __future__ import annotations

import ssl

import uvicorn
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentInterface,
    AgentSkill,
    HTTPAuthSecurityScheme,
    SecurityRequirement,
    SecurityScheme,
    StringList,
)

from lab.config import env


def bank_agent_card(*, name: str, description: str, skill: AgentSkill) -> AgentCard:
    return AgentCard(
        name=name,
        description=description,
        version="0.2.0",
        # The bank's own ingress gateway is the only published address.
        supported_interfaces=[AgentInterface(url=env("PUBLIC_URL"), protocol_binding="JSONRPC",
                                             protocol_version="1.0")],
        capabilities=AgentCapabilities(streaming=False, push_notifications=False),
        security_schemes={"gateway": SecurityScheme(
            http_auth_security_scheme=HTTPAuthSecurityScheme(scheme="bearer", bearer_format="JWT"))},
        security_requirements=[SecurityRequirement(schemes={"gateway": StringList(list=[])})],
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        skills=[skill],
    )


def serve(app_path: str) -> None:
    """Serve the A2A app with mTLS; only this bank's gateway holds a trusted client cert."""
    config = uvicorn.Config(
        app_path,
        host="0.0.0.0",
        port=9443,
        ssl_certfile=env("TLS_CERT_FILE"),
        ssl_keyfile=env("TLS_KEY_FILE"),
        ssl_ca_certs=env("TLS_CLIENT_CA_FILE"),
        ssl_cert_reqs=ssl.CERT_REQUIRED,
        server_header=False,
        access_log=False,
        timeout_keep_alive=30,
    )
    config.load()
    config.ssl.minimum_version = ssl.TLSVersion.TLSv1_3
    uvicorn.Server(config).run()
