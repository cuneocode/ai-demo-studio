# Brahe Bank in the FSI Demo Studio

Adapted from [Galileo's LangGraph FSI agent](https://github.com/rungalileo/sdk-examples/tree/main/python/agent/langgraph-fsi-agent), revision `0c5e1180586ea59214891003de55db5a5c3685c1`. Upstream MIT attribution is retained in LICENSE.

## Setup and startup

Follow the [Studio setup](../../../README.md#start-studio-and-selected-demos), then
start **Brahe Bank assistant** in **Settings → Services**. Node and Docker Compose 2.30+
are required; Python runs inside the image. The API uses loopback port 8011
and Studio's `/api/banking` proxy in development and production.

```sh
npm run studio:containers -- start banking
npm run studio:containers -- logs banking
npm run studio:containers -- stop banking
```

Health is at `http://localhost:4200/api/banking/health`. Stop preserves the
stack's data volume; closing Studio leaves its containers running. Credentials
come from the operator's scoped root configuration and shared model settings.

For optional source development, install with `npm run banking:install`, run
`(cd services/banking && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8011)`
and `npm run dev` in separate terminals. Stop each with Ctrl+C. Source tests use
`npm run banking:test`. Container data and source-mode `.cache/` are separate.

The server reads the project root `.env`; keys never enter React or browser storage. `OPENAI_API_KEY` and `MODEL_NAME` configure inference. When `PINECONE_API_KEY` is populated, retrieval uses the existing `credit-card-information` index (1536-dimensional OpenAI embeddings); this adapter does not create or modify remote indexes. When empty, it searches the eight bundled fictional product documents locally using lexical ranking, explicitly shown in the UI. This is not vector search or local GPU inference.

`GALILEO_API_KEY`, `GALILEO_PROJECT`, `GALILEO_LOG_STREAM`, and optional `GALILEO_CONSOLE_URL` enable the upstream Galileo callbacks. A separate logger per request avoids mixing concurrent traces. The response says `recorded` only after Galileo acknowledges an upload; delivery failure is reported separately. API credentials and raw provider error bodies are never returned to the frontend.

The inherited credit score tool returns **550**. The supervisor now routes credit-score requests and retains conversation state with an in-memory LangGraph checkpointer. Sessions expire after one hour and disappear when the service restarts. Product responses, eligibility guidance, and document sources are fictional demonstrations, not credit approvals or financial transactions.

Cisco AI Defense is application-enforced in `security.py`: the incoming question is inspected before graph entry, then `ProtectedChatOpenAI` inspects the complete model conversation (including retrieved tool evidence) and generated output/tool arguments on **every** model call, including quality-judge calls. Inspection failure or a policy violation stops execution in enforce/fail-closed mode. Rejected requests discard the session checkpoint so blocked content cannot contaminate later turns. This is not source authorization or financial approval. With cloud policy-based inspection, violations may produce event IDs; safe requests need not produce dashboard events.

Configure `AIDEFENSE_API_KEY`, `AIDEFENSE_REGION` (us-west-2, eu-central-1, or ap-northeast-1), `AIDEFENSE_MODE=enforce`, `AIDEFENSE_FAIL_OPEN=false`, and `AIDEFENSE_TIMEOUT=30` in the project root `.env`. Monitor mode records violations without blocking; off disables inspection. Restart the Python service after config changes. `AGENT_CONTROL_URL` is not an inspection endpoint; Brahe uses its own `BRAHE_AGENT_CONTROL_URL` setting.

## Runtime quality controls

The implemented order is:

```text
Question → AI Defense → scope judge → hosted scope control
         → LangGraph + tools (AI Defense on each model boundary)
         → final AI Defense → evidence/approval judge
         → hosted evidence + no-approval controls → answer release
```

`runtime_controls.py` uses an application LLM judge with strict boolean outputs,
then invokes the real hosted Agent Control service. Server-side JSON controls
require passing verdicts and issue the allow/deny decision. They are bound only
to the configured Brahe log stream and uniquely named Brahe runtime steps:

- `brahe-bank-banking-scope-v1`: banking/product/score/eligibility scope, not unrelated work.
- `brahe-bank-evidence-grounding-v1`: specific claims supported by complete retrieved tool results, with document attribution for product answers.
- `brahe-bank-no-approval-claims-v1`: no claims of real approvals, submissions, card issuance or payments; conditional explanations and explicit negations remain allowed.

This is **not a Galileo Luna scorer**, model training, or a guarantee of correctness.
The judge defaults to `MODEL_NAME` (currently `gpt-5.6-luna`) and can be independently
set with `BRAHE_JUDGE_MODEL`. It uses the existing model provider credentials.
Malformed/refused verdicts, API failures, missing controls and incomplete allowed
evaluations fail closed. A denying control can short-circuit remaining checks.
The protected model buffers responses; no rejected candidate is streamed to users.

Galileo 2.6.0 and Agent Control 8.5.0 integrate through the official control-event
bridge. The existing Splunk-branded Agent Observability console receives agent,
model and **control spans** via Galileo SDK uploads, correlated under one request
trace. This is separate from the optional Splunk OTLP export below and from the
stream's asynchronous evaluators. Existing evaluator settings are not changed.

The current tenant uses `https://agent-control.multitenant.galileocloud.io`.
Override with `BRAHE_AGENT_CONTROL_URL` for another deployment. Management auth
uses `Galileo-API-Key`; runtime token exchange uses `Authorization: Bearer` as
required by this tenant. `BRAHE_CONTROL_TOKEN_HEADER` supports tenants configured
with a dedicated token header. Secrets remain server-side.

After reviewing definitions, explicitly provision a new stream with:

```sh
npm run studio:containers -- controls banking
```

This administrative script creates/binds only these three named controls and
refuses to overwrite a differing existing definition. Normal startup registers
the Brahe runtime and loads policies; it does **not** create or re-enable controls.
To stop enforcement operationally, disable the bindings in Agent Observability;
the application then fails closed rather than quietly serving unguarded answers.

Manual live verification (uses fictional inputs and real provider calls):

```sh
PYTHONPATH=services/banking services/banking/.venv/bin/python services/banking/tests/live_controls.py
```

Live tests cover off-topic blocking, AI Defense short-circuiting, invented score
rejection, false approval rejection, legitimate refusal, and retrieved fee comparisons.

Splunk uses the official `splunk-otel-instrumentation-langchain` distribution with OTel 1.38 to emit correlated workflow, agent, model and tool spans plus GenAI metrics. Configure **either** direct ingest:

```dotenv
SPLUNK_REALM=us0
SPLUNK_ACCESS_TOKEN=your-ingest-token
OTEL_SERVICE_NAME=brahe-bank
```

or an existing OTLP/HTTP collector:

```dotenv
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_SERVICE_NAME=brahe-bank
```

The collector must independently forward traces **and metrics** to Splunk. Signal-specific `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, and their `_HEADERS` variants are also supported. No collector is started or assumed by this app. Direct ingest requires an ingest token, not an API-management token. Leave credentials server-side; never add a `VITE_` prefix.

Health reports configuration only. Per-request `accepted_by_endpoint` means the OTLP receiver acknowledged export, **not** that a Splunk dashboard was queried or verified. Missing configuration and delivery failure are reported separately. In Splunk, look for service `brahe-bank` in AI agents / AI trace data, and use the response trace ID. Metrics are exported every 15 seconds; dashboard indexing can lag.

Message capture defaults to `NO_CONTENT` and emitters to `span_metric`; span topology, timing and usage still export. Conversation text requires explicitly setting `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=SPAN_ONLY` and appropriate Splunk conversation-view permission. That option exports prompts, tool results and answers—use fictional data and your telemetry retention policy. Existing Galileo callbacks are independent and can still export their own payloads.

The unused upstream Chainlit frontend has incompatible Uptrace/Traceloop OTel pins. It is excluded from the studio runtime and listed separately in `requirements-upstream-ui.txt`; use a separate environment if running that original frontend. Do not install the competing `opentelemetry-instrumentation-langchain` distribution into this environment: it owns the same Python namespace as Splunk's instrumentor.

UCS/Nexus/NIM placement remains **proposed**, not deployed. Inference uses the configured OpenAI endpoint. Production identity, persistence, UI flow, and backend implementation can change, but the established ink/navy/slate/cobalt/violet theme must remain consistent. Cyan is prohibited.

Integration references: [Cisco Inspection API](https://developer.cisco.com/docs/ai-defense-inspection/getting-started/), [Cisco inspection response](https://developer.cisco.com/docs/ai-defense-inspection/inspectresponse/), and [Splunk AI agent instrumentation](https://help.splunk.com/en/splunk-observability-cloud/observability-for-ai/splunk-ai-agent-monitoring/set-up-ai-agent-monitoring/zero-code-instrumentation).

Checks: `npm run banking:test` for isolated API/tool tests. Live smoke tests are described in `tests/live_smoke.py` and use the running local service with configured providers.

Isolated tests also verify fail-closed behavior, tool-output blocking, privacy, and actual Splunk instrumentor export to a loopback OTLP receiver (including agent/model/tool spans, shared trace parentage, and metrics). They do not require provider keys or prove cloud dashboard visibility.
