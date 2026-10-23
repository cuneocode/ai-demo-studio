# SAR investigation service

The SAR sidecar helps an investigator review synthetic evidence, draft and edit a
cited narrative, record a filing decision, and obtain separate QA approval.
E-filing is simulated. It listens on `127.0.0.1:8015` behind `/api/sar`.

## Setup and startup

Complete the [live Studio setup](../../README.md#start-the-live-studio), select a
model in Studio settings, and start `npm run dev:studio` from the root. Open
**SAR investigation**. Install this service alone with `npm run sar:install`.
Stop the managed runtime with Ctrl+C.

For standalone development, use two terminals from the root:

```sh
(cd services/sar && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8015)
# In another terminal:
npm run dev
```

Stop each with Ctrl+C. Health is at `http://localhost:4200/api/sar/health`.

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
(cd services/sar && .venv/bin/python setup_controls.py)
```

Restart through **Services → Apply**. Check whether the run reports local checks
or hosted enforcement and inspect its actual trace export result. Optional generic
OTLP export uses the shared Splunk realm/token or collector settings.

## Storage, fallback, and tests

Synthetic scenarios are in `fixtures/studio/sar-scenarios.json`. The service stores
working runs in `.cache/` and reads curated recordings from `data/recorded/`.
**Fallback: recorded demo** preserves the recorded run and produces no new model
calls or exports. Sample execution is labelled separately.

```sh
npm run sar:test
```

See the [configuration guide](../../docs/CONFIGURATION.md) for shared settings.
