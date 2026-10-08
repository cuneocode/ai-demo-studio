# Interbank A2A settlement investigation

Two banks investigate a failed delivery-versus-payment settlement (trade TRD-847)
over A2A. Each bank runs:

- a **LangChain Deep Agent** (`bank_a/agent.py`, `bank_b/agent.py`, built in
  `lab/agents.py`) on the backend chosen in the studio's **Model backends** page, else
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

Prerequisites: Docker, `uv`, and the FSI Demo Studio `.env` (the repository root) with
OpenAI, Splunk AO, Agent Control and AI Defense keys (see `.env.example`). Agents use
the Responses API with `MODEL_REASONING_EFFORT` (default `medium`) and detailed
reasoning summaries, which the dashboards show as each agent's thinking. If the host
sits behind a TLS-inspecting proxy, `up` adds its root to the agents' egress CA bundle:
the Cisco Secure Access root from the macOS System keychain, or a PEM file named by
`EXTRA_CA_FILE`.

The agents and dashboard mount the studio's `.studio/` directory read-only and read
`models.json` on each investigation, so switching the backend needs no restart. A
provider without the Responses API runs on Chat Completions: tool calls and answers
still stream, without thinking. A loopback base URL is reached as
`host.docker.internal`. Docker Desktop forwards it to the host's loopback; on Linux
the endpoint (for example vLLM) must also listen on the Docker bridge address.

From the repository root:

```bash
npm run interbank:up                         # PKI, tokens, image, controls, stack
npm run dev                                  # studio: Use case library → Interbank settlement investigation
npm run interbank:verify -- <run-id>         # checks the Splunk AO trace for that run
npm run interbank:verify -- <run-id> blocked # same, for a run AI Defense blocked
npm run interbank:status
npm run interbank:down
```

The studio proxies `/api/interbank/*` to this lab's dashboard API on
127.0.0.1:8088 and reads source excerpts from disk, so the code viewer works even
when the lab is down. `labctl.py` also runs directly
(`uv run --no-project --python 3.12 --with httpx --with pyjwt --with cryptography python labctl.py kickoff allowed`).
An allowed investigation takes about 1–2 minutes.

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
