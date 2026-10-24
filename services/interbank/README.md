# Interbank A2A settlement investigation

Two banks investigate a failed delivery-versus-payment settlement (trade TRD-847)
over A2A. Each bank runs:

- a **LangChain Deep Agent** (`bank_a/agent.py`, `bank_b/agent.py`, built in
  `lab/agents.py`) on the backend chosen in the **Studio settings** page, else
  the OpenAI Responses API with `MODEL_NAME` from the studio .env (`lab/models.py`),
  with reasoning summaries and a read-only SQLite settlement database
  (`bank_*/records.sql`);
- the **A2A SDK** (1.2.2) for both sending and receiving (`lab/a2a_peer.py`);
- its own **agentgateway** (`gateways/bank-*.yaml`), the only path in or out of the
  bank and the enforcement point for **Cisco AI Defense** (ExtProc service in
  `policy/`, buffered request + response, fail closed);
- **Splunk Agent Control** server-side controls on every outbound A2A message
  (`lab/controls.py`, created by `tools/setup_controls.py`);
- tracing to **Splunk Agent Observability**: the agents, AI Defense service, and
  console export with `SplunkAOSpanProcessor` plus OpenInference LangChain
  instrumentation (`lab/telemetry.py`, `lab/genai.py`); each gateway exports through
  its bank's OTel collector (`otel/collector.yaml`). Agent Control executions are
  recorded on the Agent Control server and as control spans in the same trace. W3C
  trace context flows through A2A, so one investigation is one trace and one session.
  A2A spans follow Splunk's `splunk-ao-a2a` instrumentor (span names, `a2a.*`
  attributes, `agent_handoff` links via `splunk_ao_observe` request metadata); the
  instrumentor itself supports only `a2a-sdk` < 1.0, so `lab/a2a_peer.py` emits them.

```
console ─▶ Bank A gw :7443 ─▶ Bank A agent ─▶ Bank A gw :8443 ═interbank═▶ Bank B gw :9443 ─▶ Bank B agent
                │                   │                                         │                │
         Cisco AI Defense     Agent Control                            Cisco AI Defense   Agent Control
```

## Run

Prerequisites: Node 24 (minimum 22.18), Docker with Compose 2.30+, and the
root Studio configuration. Python and uv are optional source-development tools.
Configure `GALILEO_API_KEY`, `GALILEO_CONSOLE_URL`, `AIDEFENSE_API_KEY`, and
`AGENT_CONTROL_URL`. Configure a shared model route, or provide `OPENAI_API_KEY`
and `MODEL_NAME`. A remote model needs no local NVIDIA GPU.

Follow the [Studio setup](../../README.md#start-studio-and-selected-demos).
Start the stack in **Settings → Services** or use:

```sh
npm run interbank:up
npm run dev:studio
npm run interbank:status
npm run interbank:down
```

Start builds one shared application image, prepares PKI and scoped vendor files
in a helper container, then starts agents, gateways, policy services, collectors,
and the console as one Compose project. Hosted controls require explicit setup:

```sh
npm run interbank:controls
```

Review the policies before registration. Build and Start do not create hosted
controls. The lab's project/stream names are defined in `labctl.py`. It uses
Responses when supported and Chat Completions otherwise. Shared model routes are
mounted read-only and reloaded per investigation. Loopback model URLs become
`host.docker.internal`; Linux-hosted models must listen on an accessible interface.
Public corporate CA roots are supplied by Studio; `EXTRA_CA_FILE` adds a PEM bundle.

Studio proxies `/api/interbank/*` to loopback port 8088. Health is
`http://localhost:4200/api/interbank/health`, or directly
`http://127.0.0.1:8088/api/health`. An allowed investigation takes about 1 to 2
minutes. Stop the stack explicitly; closing Studio leaves it running. Generated
PKI and credentials live in ignored `.runtime/`; evidence persists in `evidence/`.
Curated fallback playback in `recorded/` works in preview without Docker.

Optional source tools include `labctl.py kickoff allowed` and
`npm run interbank:verify -- <run-id>` (append `blocked` for a denied run).
Trace verification uses the package's helper container and a configured Agent
Observability tenant. Host Python is optional for direct source tools.

The two kickoffs:

- **allowed**: "Investigate failed settlement TRD-847 and coordinate with Bank B."
  Bank A's agent queries its records, messages Bank B, answers Bank B's follow-up
  questions through its responder, and writes a root-cause report. The cause is an SSI
  version mismatch: Bank A instructed v2 while Bank B's records hold v3.
- **blocked**: the same request with a prompt injection and a wire instruction
  appended. Cisco AI Defense returns Prompt Injection / General Harms, and Bank A's
  gateway answers 403 before the agent ever sees it.

## Dashboards

In the studio, the use case shows the architecture map (every component with code
opens its source or configuration, with integration points highlighted) and the live
demo: Bank A's agent terminal, the gateway / AI Defense lane, and Bank B's agent
terminal, side by side, plus the joint report and the run's Splunk session and trace.

The lab's standalone dashboard, `demo/ui` (React Flow, Vite), is served by
`demo/server.py` on http://127.0.0.1:8088.

- **Map**: both banks, their gateways, AI Defense enforcement, records, and the shared
  services. Edges light up as the run uses them and turn red where something is
  blocked.
- **Agent node**: the Deep Agent construction code, system prompt, tools, and the A2A
  client/server code, read live from the running container.
- **Gateway node**: listeners and routes, where AI Defense is attached, and the
  gateway and collector YAML.
- **Timeline**: every A2A message, Agent Control and Cisco verdict, LLM/tool step and
  SQL query, filterable, with trace and span ids.

For UI development: `cd demo/ui && npm ci && npm run dev` (proxies `/api` to :8088).

## Layout

| Path | Purpose |
| --- | --- |
| `bank_a/`, `bank_b/` | Deep Agent definitions, prompts, seed data |
| `lab/` | shared agent runtime: A2A peer, records tool, controls, telemetry, GenAI span translation |
| `policy/` | Cisco AI Defense ExtProc adapter used by each gateway |
| `gateways/` | agentgateway configs (listeners, JWT/mTLS, ExtProc, tracing) |
| `otel/collector.yaml` | per-bank collector to Splunk AO (and a local JSONL copy in `evidence/`) |
| `demo/` | dashboard API + UI |
| `tools/` | Agent Control setup, Splunk trace verifier |

## Security notes

- Credentials are imported at `up` into `.runtime/vendor.env` (0600) and are never
  committed or printed. Signing keys are mounted only into gateways; agents get only
  their own TLS leaf, CA, and a short-lived egress JWT.
- All hops use TLS 1.3 mTLS with P-256/SHA-256 certificates from per-bank CAs
  generated in `.runtime/pki`. These CAs are **self-signed and for local demo use only**.
  Leaf certificates last 90 days and are reissued automatically within 7 days of expiry.
- Containers run as non-root. Agents, policy services, the console, and gateways also
  run with a read-only root filesystem, no-new-privileges, and all capabilities
  dropped. Banks share only the `interbank` network, between the two gateways.

## Tests

From the repository root:

```sh
(cd services/interbank && uv sync --frozen && uv run --frozen pytest tests -q)
```

These Python checks are separate from `interbank:verify`, which inspects delivery
of a real investigation trace to the configured Agent Observability service.
