# Interbank A2A settlement investigation

Two banks investigate a failed delivery-versus-payment settlement (trade TRD-847)
over A2A. Each bank runs:

- a **LangChain Deep Agent** (`bank_a/agent.py`, `bank_b/agent.py`) on the local
  Nemotron 3 Super vLLM, with a read-only SQLite settlement database
  (`bank_*/records.sql`);
- the **A2A SDK** (1.2.2) for both sending and receiving (`lab/a2a_peer.py`);
- its own **agentgateway** (`gateways/bank-*.yaml`), the only path in or out of the
  bank and the enforcement point for **Cisco AI Defense** (ExtProc service in
  `policy/`, buffered request + response, fail closed);
- **Splunk Agent Control** server-side controls on every outbound A2A message
  (`lab/controls.py`, created by `tools/setup_controls.py`);
- an OTel collector exporting both agents' and both gateways' spans to
  **Splunk Agent Observability**. W3C trace context flows through A2A, so one
  investigation is one trace and one session.

```
console ─▶ Bank A gw :7443 ─▶ Bank A agent ─▶ Bank A gw :8443 ═interbank═▶ Bank B gw :9443 ─▶ Bank B agent
                │                   │                                         │                │
         Cisco AI Defense     Agent Control                            Cisco AI Defense   Agent Control
```

## Run

Prerequisites: Docker, the running `fsi-nemotron-super` vLLM container (the lab only
attaches to the `a2a-lab-vllm-a` / `a2a-lab-vllm-b` networks; it never restarts the
model), and the FSI Demo Studio `.env` with Splunk AO, Agent Control and AI Defense keys
(see `.env.example`).

```bash
python3 labctl.py up                 # PKI, tokens, image, controls, stack
open http://127.0.0.1:8088           # dashboard
python3 labctl.py kickoff allowed    # runs to completion (~10-15 min)
python3 labctl.py kickoff blocked    # Cisco AI Defense blocks it at Bank A's gateway
python3 labctl.py verify <run-id>    # checks the Splunk AO trace for that run
python3 labctl.py status | logs | down
```

The two kickoffs:

- **allowed**: "Investigate failed settlement TRD-847 and coordinate with Bank B."
  Bank A's agent queries its records, messages Bank B, answers Bank B's follow-up
  questions through its responder, and writes a root-cause report. The cause is an SSI
  version mismatch: Bank A instructed v2 while Bank B's records hold v3.
- **blocked**: the same request with a prompt injection and a wire instruction
  appended. Cisco AI Defense returns Prompt Injection / General Harms, and Bank A's
  gateway answers 403 before the agent ever sees it.

## Dashboard

`demo/ui` (React Flow, Vite) is served by `demo/server.py`.

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
- Containers run as non-root, read-only, with all capabilities dropped. Banks share only
  the `interbank` network, between the two gateways.
