# Wealth research and advisor service

Market research and Advisor meeting prep run as independent Compose projects,
using the same Wealth image. Research uses host port 8014 and `/api/research`;
advisory uses 8017 and `/api/advisory`. Each has its own persistent data volume.
The image exposes `/api/wealth` internally, and Studio rewrites the public paths.

## Setup and startup

Follow the [Studio setup](../../README.md#start-studio-and-selected-demos), then
start **Market research** or **Advisor meeting prep** in **Settings → Services**.
Node and Docker Compose 2.30+ are required. Select the model in shared Settings.

```sh
npm run studio:containers -- start research advisory
npm run studio:containers -- logs advisory
npm run studio:containers -- stop research advisory
```

Health routes are `/api/research/health` and `/api/advisory/health` through Studio.
Stop preserves each stack's data. Closing Studio leaves the containers running.

Optional source development uses `npm run wealth:install` and separate uvicorn
instances on ports 8014 and 8017. Set distinct `WEALTH_CACHE` directories in their
launching environments to retain isolation. Start the frontend with `npm run dev`.
Run `npm run wealth:test` after installing the source environment.

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
npm run studio:containers -- controls research
# The same policies can be registered for advisory when it uses a different stream.
npm run studio:containers -- controls advisory
```

Use **Services → Apply to running stacks** or Restart. Without hosted setup, verdicts identify local
checks. Confirm the control source and trace delivery in the run's Runtime details.

## Storage, fallback, and tests

Working caches and saved runs live under `.cache/` in each stack's named volume. Bundled source snapshots are
in `data/snapshots/`; curated recordings are in `data/recorded/`. Recorded advisory
and older research runs preserve their original counts and create no new calls.
Use the explicit recorded fallback controls where available.

```sh
npm run wealth:test
npm run platform:test
```

See the [configuration guide](../../docs/CONFIGURATION.md) for shared routing,
credential handling, and integration settings.
