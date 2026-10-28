# Company briefing service

The `briefing` sidecar runs a Deep Agent over an annual report and returns cited
business themes and financial context. It listens on `127.0.0.1:8013`, behind the
Studio's `/api/briefing` proxy.

## Setup and startup

Follow the [Studio setup](../../../README.md#start-studio-and-selected-demos), then
start **Company briefing** in **Settings → Services**. Node and Docker Compose 2.30+
are required; Python runs inside the image. The API uses loopback port 8013
and Studio's `/api/briefing` proxy in development and production.

```sh
npm run studio:containers -- start briefing
npm run studio:containers -- logs briefing
npm run studio:containers -- stop briefing
```

Health is at `http://localhost:4200/api/briefing/health`. Stop preserves the
stack's data volume; closing Studio leaves its containers running. Credentials
come from the operator's scoped root configuration and shared model settings.

For optional source development, install with `npm run briefing:install`, run
`(cd services/briefing && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8013)`
and `npm run dev` in separate terminals. Stop each with Ctrl+C. Source tests use
`npm run briefing:test`. Container data and source-mode `.cache/` are separate.

## Configuration and workflow

Select a model that supports tool calling in **Studio settings → Model backends**.
The service loads the root `.env`. For ticker lookup, set `SEC_USER_AGENT` to your
real name and email in Studio settings or `.env`. Source mode can use git contact
settings as a fallback. Containers require explicit contact details for SEC lookup,
which also needs outbound internet.

Alternatively upload a PDF, HTML, or TXT annual report, up to 40 MB. PDFs need a
text layer; scanned images require OCR before upload. The agent reads filing
sections through tools and verifies theme quotes before returning the briefing.
Review the source citations before accepting the company into Studio context.

AI Defense model-hop inspection defaults to off. Set `AIDEFENSE_API_KEY`,
`AIDEFENSE_REGION`, and `BRIEFING_AIDEFENSE_MODE=enforce` to enable it. Optional
OTLP export uses `SPLUNK_REALM` plus `SPLUNK_ACCESS_TOKEN`, or
`OTEL_EXPORTER_OTLP_ENDPOINT`. This service has no hosted Agent Control
registration command. Apply credential changes through Studio settings.

## Storage, fallback, and tests

Local working files and cached filings live under `.cache/` in the named data volume. Curated runs in
`data/recorded/` provide the explicit **Fallback: recorded demo** path. They create
no new model calls. A failed live analysis reports its error or incomplete result.

```sh
npm run briefing:test
```

Shared model routing is in `services/llm/studio_models.py`. The
[configuration guide](../../../docs/CONFIGURATION.md) covers file precedence and
integration readiness.
