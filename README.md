# Financial Services AI Demo Studio

Nine use cases with live AI services, guided walkthroughs, architecture views,
and explicitly labelled recorded fallbacks. The library keeps every use case visible, including
technical demos and illustrative prototypes.

## Start the live studio — default

Requires **Node.js 22.13 or newer**, npm, and **uv**. From a fresh checkout:

```bash
npm ci
npm run studio:install
npm run studio:doctor
npm run dev:studio
```

Open **http://localhost:4200**. In **Studio settings**, configure model endpoints
and credentials, test connections, and apply changes. The primary demo actions
and guided walkthroughs run the real services. They use synthetic banking data;
model, tool, policy, and telemetry results identify what actually executed.

The install command sets up banking, fraud, briefing, wealth, and SAR. **Docker**
is needed only for live interbank execution: start Docker, then run
`npm run interbank:up`. A configuration check is not proof of a working service;
check live status and each result’s provenance.

## Market research

The user story is: **load a company, inspect its evidence, and review a concise
12-month outlook with a Buy/Hold/Sell opinion, key drivers, risks, and peer context.**
The initial NVDA packet is cached public data in
`services/wealth/data/research/NVDA.json`. Other tickers and **Refresh latest** use
Yahoo financials, earnings, industry peers, and news from the last 30 days.
Provider gaps and snapshot dates stay visible; paywalled previews are not treated
as complete articles. Article dialogs show the complete text supplied to analysis.

`GET /api/wealth/market/inputs/{ticker}` creates an immutable packet. Analysis posts
its id to `/api/wealth/market/analyze`. Every packet includes the same synthetic
prompt-injection article. Cisco AI Defense screens articles before model input;
flagged or uninspected articles are excluded. The configured model produces a
structured assessment, and code checks supporting facts against source fields or
quotes. At least three facts must verify. If a fact is discarded, the opinion is
reassessed using only verified facts. No trade or distribution takes place.

The UI contains company selection, compact input metrics and peers, article
dialogs, the report, collapsed agent activity, Live run stats, and Runtime details.
Usage, actual inspection verdicts, and trace delivery use the shared wealth
instrumentation. This flow has no canned recommendation or recorded-run fallback.

## Last-resort fallback

If a live dependency fails, fix it or explicitly open **Fallback: recorded demo**.
Recordings keep their original date and counts and generate no new model calls or
traces. Synthetic score or code-written narrative fallbacks are labelled separately;
they are not evidence that an AI model ran. Fraud never silently switches a failed
live request to replay.

For a machine that cannot run live services, an **optional recording-only preview**
is available after `npm ci`:

```bash
npm run studio:preview
```

Preview requires no Python, Docker, or model keys and disables all live demo APIs.
It is not the default presentation path. Initial package installation needs internet.

## Present and share

For a production build on the same machine:

```bash
npm run build
npm run start:studio
# Only for a recording-only fallback:
npm run start:preview
```

These commands listen on loopback at localhost:4200. That address is only accessible
on the presenter's machine. To share now, give colleagues the repository and the
live setup commands above, or present through screen sharing. This is not a hosted public
link. Hosting requires a separate deployment with access controls for the host-side
settings and service-management API; do not expose the local server directly.

`npm run studio:doctor` checks prerequisites without reading keys, starting services,
or making model calls. If port 4200 is occupied, stop the other local studio first.
Closing the startup command stops processes it owns; independently started services
must be stopped where they were launched.

Synthetic banking data is labelled throughout. Chuck Robbins's public role as
Cisco Chair and CEO is used as context; the portfolio and banking events are
hypothetical. HCYN is a fictional, unrelated investment. Original recordings are
preserved; subsequent review corrections are disclosed alongside playback.

## Studio settings

The studio's **Studio settings** page makes the demo portable: each presenter
brings their own models and credentials without editing files.

- **Credentials** for Splunk Agent Observability, Splunk Observability Cloud, Cisco
  AI Defense (key, region, and per-use-case modes), and the optional data sources are
  saved to the repository `.env` (git-ignored, mode 0600) in place, keeping its
  comments. Keys are write-only: the browser only learns whether each is set, and
  each group has a **Test** button that checks the saved or pasted values.
- **Model backends** choose the OpenAI-compatible endpoint every live use case calls
  (for example the OpenAI API on a laptop, or vLLM on Sparky), with optional
  per-use-case overrides. They are saved to `.studio/models.json` (git-ignored),
  which holds provider URLs, model names, and the *name* of each key variable; key
  values stay in `.env`. Services resolve it per request, so model changes need no
  restart. Without the file, each service keeps its own `.env` settings.
- **Live configuration** lists the settings each live demo still needs.
- **Services** applies credential changes. Services read `.env` when they start, so
  **Apply** restarts the Python services the studio launched (`npm run dev:studio` or
  `npm run start:studio`) and starts any that are stopped. **Rebuild lab** reruns
  `npm run interbank:up` for the interbank containers. Services started any other way
  must be restarted where they run.

The settings API is served by the Node layer in front of the worker (the Vite dev
server and `scripts/start-studio.mjs`), because it writes to disk and manages
processes. It accepts same-origin JSON writes only.

### Live services

`STUDIO_START_SERVICES=1 npm run dev` (or `npm run dev:studio`) starts the Python
services below; Vite proxies `/api/<id>` to each. Install with `npm run <id>:install`
and test with `npm run <id>:test`.

| Service | Port | Demo |
| --- | --- | --- |
| `banking` | 8011 | Brahe Bank assistant |
| `fraud` | 8012 | Card fraud triage |
| `briefing` | 8013 | Company briefing |
| `wealth` | 8014 | Market research and client advisory |
| `sar` | 8015 | SAR investigation: synthetic cases, a cited narrative, investigator and QA approval, simulated e-filing |

The interbank lab runs in Docker (`npm run interbank:up`).

The top bar's **Controls** and **Telemetry** pages, the service bell, the help
drawer, the Cisco platform rows, and the story builder's readiness score all read
`/api/studio/status`: a read-only snapshot of each service's health (AI Defense
mode, Agent Control, tracing and export status, recent interbank runs) that never
includes setting values beyond URLs and names.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
