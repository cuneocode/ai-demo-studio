# Wealth research and advisor service

One Python sidecar supports **Market research** and **Advisor meeting prep**.
It listens on `127.0.0.1:8014` behind `/api/wealth` and shares model routing,
run storage, policies, and telemetry across both workflows.

## Setup and startup

Complete the [live Studio setup](../../README.md#start-the-live-studio), select a
model in Studio settings, and run `npm run dev:studio` from the root. Install this
service alone with `npm run wealth:install`. Stop the managed runtime with Ctrl+C.

For standalone development, use two terminals from the root:

```sh
(cd services/wealth && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8014)
# In another terminal:
npm run dev
```

Stop each with Ctrl+C. Health is at `http://localhost:4200/api/wealth/health`.

## Market research

Load a company, inspect financials, earnings, peers, and news, then analyze its
immutable evidence packet. The result is a cited 12-month outlook with a
Buy/Hold/Sell assessment, drivers, and risks. The initial NVDA packet is bundled
in `data/research/NVDA.json`. Other tickers and **Refresh latest** need Yahoo and
news access. Data gaps and dates remain visible.

Configure `AIDEFENSE_API_KEY` and `AIDEFENSE_REGION` to include inspected news.
Uninspected and flagged articles are excluded from model input. Every packet
includes a synthetic prompt-injection article to demonstrate inspection. The
configured model produces structured output; code verifies at least three
supporting facts and can reassess the opinion using only verified facts.

`GET /api/wealth/market/inputs/{ticker}` creates the packet; analysis posts its ID
to `/api/wealth/market/analyze`. This flow needs a reachable model and has no
recorded assessment fallback. Older research endpoints and recorded research
sessions remain available for their corresponding workflows.

## Advisor meeting prep

Review synthetic holdings, suitability checks, accepted briefing/research context,
and a model-generated meeting brief. The default egress policy requires AI Defense
before client context reaches a hosted provider. Set the inspection key even if
`WEALTH_AIDEFENSE_MODE` is off when using that route. A private endpoint follows
its configured egress policy. Rules and source provenance remain visible when a
model brief is omitted. Human approval owns the final brief; no trade is placed.

`FRED_API_KEY` optionally enables live macro series. Missing credentials use
available cached series. Yahoo prices and earnings do not use that key.

## Controls and tracing

The service reads root `.env`. Model-hop inspection defaults to off unless policy
forces enforcement. Set `WEALTH_AIDEFENSE_MODE=enforce` for general inspection.
Agent Observability uses `GALILEO_API_KEY`, `GALILEO_CONSOLE_URL`,
`GALILEO_PROJECT`, and `GALILEO_LOG_STREAM`. Generic OTLP export is optional.

To enable hosted wealth controls, create your observability project/stream and
review `controls.py`, then run the explicit registration command from the root:

```sh
(cd services/wealth && .venv/bin/python scripts/setup_controls.py)
```

Restart through **Services → Apply**. Without hosted setup, verdicts identify local
checks. Confirm the control source and trace delivery in the run's Runtime details.

## Storage, fallback, and tests

Working caches and saved runs live under `.cache/`. Bundled source snapshots are
in `data/snapshots/`; curated recordings are in `data/recorded/`. Recorded advisory
and older research runs preserve their original counts and create no new calls.
Use the explicit recorded fallback controls where available.

```sh
npm run wealth:test
npm run platform:test
```

See the [configuration guide](../../docs/CONFIGURATION.md) for shared routing,
credential handling, and integration settings.
