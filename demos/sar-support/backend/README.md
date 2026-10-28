# SAR investigation service

The SAR sidecar helps an investigator review synthetic evidence, draft and edit a
cited narrative, record a filing decision, and obtain separate QA approval.
E-filing is simulated. It listens on `127.0.0.1:8015` behind `/api/sar`.

## Setup and startup

## Setup and startup

Follow the [Studio setup](../../README.md#start-studio-and-selected-demos), then
start **SAR investigation** in **Settings → Services**. Node and Docker Compose 2.30+
are required; Python runs inside the image. The API uses loopback port 8015
and Studio's `/api/sar` proxy in development and production.

```sh
npm run studio:containers -- start sar
npm run studio:containers -- logs sar
npm run studio:containers -- stop sar
```

Health is at `http://localhost:4200/api/sar/health`. Stop preserves the
stack's data volume; closing Studio leaves its containers running. Credentials
come from the operator's scoped root configuration and shared model settings.

For optional source development, install with `npm run sar:install`, run
`(cd services/sar && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8015)`
and `npm run dev` in separate terminals. Stop each with Ctrl+C. Source tests use
`npm run sar:test`. Container data and source-mode `.cache/` are separate.

## Configuration and workflow

The service reads the root `.env` and shared Studio model routing. Default hosted
model egress requires `AIDEFENSE_API_KEY` and `AIDEFENSE_REGION`, because case
context leaves the private boundary. General inspection follows
`SAR_AIDEFENSE_MODE`, then the shared mode. Hosted egress enforces inspection.

Open a scenario or a referral from fraud triage, inspect the case and evidence,
and start the investigation. Narrative claims need verified evidence citations.
The investigator can edit the draft and decide file or no SAR with a rationale.
A different QA reviewer must approve before simulated filing. The customer-contact
attempt demonstrates the no-tipping-off denial. Long investigations support
cancellation; saved runs can be reopened from history.

## Hosted controls and tracing

Local policy checks enforce citation, no-tipping-off, and approval rules without
hosted credentials. Configure `GALILEO_API_KEY`, `GALILEO_CONSOLE_URL`,
`GALILEO_PROJECT`, `GALILEO_LOG_STREAM`, and `AGENT_CONTROL_URL` for hosted
controls and Agent Observability. Create the project/stream, review `controls.py`,
then register the policies explicitly:

```sh
npm run studio:containers -- controls sar
```

Use **Services → Apply to running stacks** or Restart. Check whether the run reports local checks
or hosted enforcement and inspect its actual trace export result. Optional generic
OTLP export uses the shared Splunk realm/token or collector settings.

## Storage, fallback, and tests

Synthetic scenarios are in `fixtures/studio/sar-scenarios.json`. The service stores
working runs in its named volume at `.cache/` and reads curated recordings from `data/recorded/`.
**Fallback: recorded demo** preserves the recorded run and produces no new model
calls or exports. Sample execution is labelled separately.

```sh
npm run sar:test
```

See the [configuration guide](../../docs/CONFIGURATION.md) for shared settings.
