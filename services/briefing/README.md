# Company briefing service

The `briefing` sidecar runs a Deep Agent over an annual report and returns cited
business themes and financial context. It listens on `127.0.0.1:8013`, behind the
Studio's `/api/briefing` proxy.

## Setup and startup

Complete the [live Studio setup](../../README.md#start-the-live-studio). It installs
this service with `uv sync --frozen`; `npm run briefing:install` reinstalls it alone.
Run `npm run dev:studio` from the root and open **Company briefing**. Stop the
managed runtime with Ctrl+C.

For standalone sidecar development, run this from the root in its own terminal:

```sh
(cd services/briefing && .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8013)
```

Start the frontend with `npm run dev` in a second terminal. Stop each with Ctrl+C.
Check health through `http://localhost:4200/api/briefing/health`.

## Configuration and workflow

Select a model that supports tool calling in **Studio settings → Model backends**.
The service loads the root `.env`. For ticker lookup, set `SEC_USER_AGENT` to your
real name and email in Studio settings or `.env`; the service falls back to git
`user.name` and `user.email`. SEC access also needs outbound internet.

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

Local working files and cached filings live under `.cache/`. Curated runs in
`data/recorded/` provide the explicit **Fallback: recorded demo** path. They create
no new model calls. A failed live analysis reports its error or incomplete result.

```sh
npm run briefing:test
```

Shared model routing is in `services/llm/studio_models.py`. The
[configuration guide](../../docs/CONFIGURATION.md) covers file precedence and
integration readiness.
