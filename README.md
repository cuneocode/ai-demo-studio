# Financial Services AI Demo Studio

A local Studio for eight executable financial-services demos and two illustrative
use cases. A trusted operator configures shared integrations and starts individual
Docker Compose stacks from the dashboard. Banking data and customer scenarios are
synthetic. Recordings are labelled and remain available with live stacks stopped.

Every use case includes Use case demo, Architecture, and Capacity planning tabs.
Capacity planning loads a configured AI Infrastructure Planner browser component.
It starts from the use case and available run measurements, with production demand
entered separately. See [planner configuration](docs/CONFIGURATION.md#capacity-planning).

## System requirements

| Requirement | Recording preview | Live container demos |
| --- | --- | --- |
| Operating system | macOS or Linux; WSL2 on Windows | Same; Docker Desktop or Docker Engine |
| Node and npm | Node 24 recommended; minimum 22.18, npm 10+ | Same |
| Docker | None | Running engine and Compose **2.30+** |
| Python and uv on the host | None | None for container operation; required for optional source development and Python tests |
| CPU | 64-bit CPU | Four cores recommended for local containers; model hosting has separate requirements |
| Memory | 8 GB recommended | 16 GB host memory recommended; allocate about 8 GB to Docker for Interbank or Vulnerability and start selected stacks |
| Disk | 3 GB free recommended | Allow **30 GB free** for images and build layers, plus saved runs and model artifacts |
| GPU | None | Optional remote/local model hosting and live fraud graph scoring have separate NVIDIA GPU requirements |
| Network | Package installation | Image and dependency downloads, selected model endpoints, and configured integrations |

These memory and disk figures are planning recommendations. The operator requires
at least 15 GB of free host disk before building or starting stacks. Container
operations run sequentially, with bounded dependency-install concurrency. On Docker
Desktop, also allow sufficient space in its VM disk. Use a current browser.
Native Windows shell startup is unsupported; use WSL2. The root `.nvmrc` selects
Node 24. Source Python environments use `.python-version` and each service's lockfile.

## Start Studio and selected demos

From your clone or fork, with Docker running:

```sh
npm ci
npm run studio:doctor -- --live
npm run dev:studio
```

Open [http://localhost:4200](http://localhost:4200), then open **Studio settings**:

1. Save your provider credentials and configure/test the model endpoint. For the
   OpenAI API, select the OpenAI provider at `https://api.openai.com/v1` and choose
   an available model with tool calling. Use a per-use-case route to select it directly.
2. Configure AI Defense, Splunk, Agent Observability, and Agent Control as required
   by the selected demo. Use your own tenant, project, and stream.
3. Under **Services**, select **Start** for a use case. The first start builds its
   image. Wait for the stack's readiness status and inspect any configuration needs.
4. Open that demo from the library. **Logs** shows container output; **Stop** stops
   the stack and retains its data. **Restart** recreates it with saved settings.

Start each stack explicitly. Existing containers keep running across Studio
sessions. Market Research and Advisor Prep use separate containers and data
volumes while reusing the Wealth image. GPU scoring is an optional Fraud component.

Build all images ahead of a presentation, without starting demos or registering
hosted controls:

```sh
npm run studio:install
```

Or manage selected stacks from the command line:

```sh
npm run studio:containers -- build sar
npm run studio:containers -- start sar briefing
npm run studio:containers -- status
npm run studio:containers -- logs sar
npm run studio:containers -- stop sar briefing
```

Closing Studio leaves containers running. Stop them through **Services** or the
CLI. Stop preserves volumes and existing Interbank evidence. Each checkout owns
separate Compose projects. API ports remain fixed, so stop another checkout's
conflicting services before starting the same demo here.

## Shared configuration

Studio saves credentials to ignored root `.env` with mode 0600 and model routing
to ignored `.studio/models.json`. Keys remain write-only in the browser. The
operator supplies scoped runtime environment files, read-only model configuration,
and trusted CA certificates under ignored `.studio/runtime/`. Images contain no
workstation credentials or saved runs.

**Apply to running stacks** applies credential changes without starting stopped
use cases. Model-route changes are reflected in running containers on the next
request. Host-loopback model URLs are translated to `host.docker.internal` inside
containers. See [configuration](docs/CONFIGURATION.md) and
[container packages](docs/CONTAINERS.md).

Hosted control registration is an explicit administrative action. Review the
policies, create the intended project/stream, then select **Register hosted
controls** for that package. Build and Start do not register tenant resources.

## Demo packages

| Demo | Runtime / host port | Live prerequisites | Guide |
| --- | --- | --- | --- |
| Brahe Bank assistant | `banking` / 8011 | Model; registered banking controls and Agent Observability; AI Defense when enabled; Pinecone optional | [Banking](services/banking/README.md) |
| Card fraud triage | `fraud` / 8012 | Model for triage; optional NVIDIA scorer for live graph scores; recorded/sample scores retain provenance | [Fraud](services/fraud/README.md) |
| Company briefing | `briefing` / 8013 | Model; SEC contact for lookup or an uploaded filing; AI Defense and OTLP optional | [Briefing](services/briefing/README.md) |
| Market research | `research` / 8014 | Model, market-data access, inspected news; FRED optional | [Wealth](services/wealth/README.md) |
| Advisor meeting prep | `advisory` / 8017 | Model and holdings/context; hosted client-data inference requires AI Defense | [Wealth](services/wealth/README.md) |
| SAR investigation | `sar` / 8015 | Model; hosted client-data inference requires AI Defense | [SAR](services/sar/README.md) |
| Code vulnerability analysis | `vulnerability` / 8016 | Model; pinned Visa harness is included in its image | [Vulnerability](services/vulnerability/README.md) |
| Interbank settlement investigation | `interbank` / 8088 | Model, AI Defense, Agent Observability, explicit hosted control setup | [Interbank](services/interbank/README.md) |
| KYC processing | Illustrative package | Proposed workflow with no executable backend | Library story and architecture |
| Transaction intelligence | Illustrative package | Proposed workflow with no executable backend | Library story and architecture |

Market Research analyzes an immutable evidence packet and verifies cited facts.
It has no recorded assessment fallback. Vulnerability analysis has no bundled
recording; it runs Visa VVAH against synthetic payments source, checks Foundry
evidence, and prepares downloadable HEC events locally. HEC delivery is unconfigured.

Interbank retains its agents, gateways, policy services, collectors, PKI, and
persistent evidence as one stack. Use the same Services controls or:

```sh
npm run interbank:up
npm run interbank:status
npm run interbank:down
```

## Preview and production build

Recording preview requires no Docker, Python, credentials, or live services:

```sh
npm ci
npm run studio:preview
```

Live execution and container controls are disabled in preview. Open explicit
recorded fallbacks. To run a production build locally:

```sh
npm run build
npm run start:studio
# Recording-only production preview:
npm run start:preview
```

The listener uses loopback port 4200. Set `STUDIO_PORT` in the launching shell to
change it; production uses the next port for its internal frontend unless
`FRONTEND_PORT` is supplied. Studio is a trusted local operator with Docker access.
Share the repo or screen-share the dashboard. Hosted authentication and access
controls require a separate deployment design; Cloudflare bindings remain empty.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Docker unavailable | Start Docker and run `npm run studio:doctor -- --live` |
| Low disk or stalled image extraction | Free host and Docker VM disk space; inspect Docker before retrying; preserve saved-data volumes |
| Stack starts but is blocked | Inspect readiness, configuration, and Logs; running containers and live integration readiness are distinct |
| Hosted controls unavailable | Check the effective Agent Control URL, credentials, project/stream and existing bindings before registering policies; use the intended tenant endpoint explicitly |
| Port occupied | Stop the conflicting external process or stack; Studio preserves services it does not own |
| Credential change has no effect | Save, then Apply to running stacks or Restart the selected stack |
| Model unreachable inside Docker | Check the selected URL; host loopback is translated automatically; remote hosts must be reachable from Docker |
| GPU scorer unavailable | Configure `FRAUD_SCORE_URL` to a reachable NVIDIA scorer or use labelled sample/recorded scores |
| Corporate TLS failure | Set `EXTRA_CA_FILE` to the public corporate CA bundle before building/starting; Studio also exports system trust roots |
| Browser test cannot launch | Run `npx playwright install chromium`; `CHROME_PATH` is an optional override |

## Development and extension

Read [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the
[use-case authoring guide](docs/ADDING_USE_CASES.md) before adding a demo. The guide
maps the required files, identifies reference demos, and defines the shared visual
and execution patterns. Start with SAR for a case-review workflow, Banking for
chat, or Interbank for a multi-container agent workflow. Keep the existing shell,
three tabs, themes, story renderer, run stats and architecture viewer.

A coding-agent request can start with:

> Read AGENTS.md and docs/ADDING_USE_CASES.md. Add a use case for [workflow and
> intended user]. Follow the closest reference demo and the shared visual design.
> Use my configured model routes and integrations. Complete the registration,
> story, architecture, guided tour and relevant checks, then report what was
> verified live and what remains unconfigured.

The [container package contract](docs/CONTAINERS.md) covers runtime isolation,
configuration and lifecycle. The package registry is
`config/use-cases.ts`; Compose definitions live in `use-cases/` and the Interbank
service directory. Agents and application code remain in `services/` and execute
inside their images. `app/` owns Studio UI, run components, narratives, and guides.

Source development remains available with `npm run studio:install:source`, an
individual sidecar command from its service guide, and `npm run dev`. Install uv
and Python 3.12 for this workflow. Each service keeps its own `uv.lock` and environment.

Architecture tabs use the shared draw.io explorer with stable identities, platform
layers, and source evidence. See [architecture maps](ARCHITECTURE_MAPS.md).
Validation includes `npm test`, typecheck, lint, affected browser flows, Python
checks, and real container lifecycle checks. See [setup verification](docs/SETUP_VERIFICATION.md).

Preserve build support in `worker/`, `db/`, `drizzle/`, `build/`, and `.openai/`.
Upstream notices remain with adapted code, including [banking's MIT notice](services/banking/LICENSE).
The repository owner controls the root license decision.
