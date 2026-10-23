# Financial Services AI Demo Studio

A local demo studio with ten financial services use cases, guided walkthroughs,
architecture views, live Python services, and labelled recordings. Banking data and
customer scenarios are synthetic. Two use cases are illustrative designs.

## System requirements

| Requirement | Recording-only preview | Live Studio |
| --- | --- | --- |
| Operating system | macOS or Linux; use WSL2 on Windows | Same; startup scripts use POSIX paths and shell syntax |
| Node.js and npm | Node 24 recommended; minimum 22.18, with bundled npm 10+ | Same |
| Python and uv | None | Python 3.12 recommended, managed by uv (verified with 0.11.23); service packages allow 3.12 or 3.13 |
| Git | Required to clone | Also used to install the pinned Visa harness |
| Docker Engine with Compose v2 | None | Required for the interbank lab only; Docker Desktop works on macOS |
| GPU | None | None when using a hosted or remote model; local model hosting and live fraud scoring have separate GPU requirements |
| Network | Package installation; playback uses bundled data | Package installation, selected model endpoints, and configured data, inspection, control, and telemetry services |

Use a current Chrome, Chromium, Firefox, Safari, or Edge browser. Apple Silicon
and Linux ARM64 are used in the development setup. Other Linux architectures and
WSL2 need verification in your environment. Native Windows startup is unsupported.

For planning, allow **8 GB RAM and 3 GB free disk for preview**, or **16 GB RAM and
10 GB free disk for the live Studio**. These are starting recommendations, rather
than benchmarked minimums. The current macOS installation uses about 0.9 GB for
`node_modules` and 2.5 GB across the six Python environments, before download caches,
browser binaries, saved runs, and Docker images. Budget additional Docker resources
for interbank. GPU training and model weights have separate storage requirements.

The root `.nvmrc` selects Node 24 and `.python-version` selects Python 3.12. Node
22.18 is the minimum because host scripts import TypeScript directly using
[built-in type stripping](https://nodejs.org/api/typescript.html#type-stripping).
Install [Node.js](https://nodejs.org/en/download),
[uv](https://docs.astral.sh/uv/getting-started/installation/), and, when needed,
[Docker](https://docs.docker.com/get-started/get-docker/).

## Start the live Studio

From the repository root of your clone or fork:

```sh
node --version
npm --version
uv --version
npm ci
uv python install 3.12
npm run studio:install
npm run studio:doctor -- --live
npm run dev:studio
```

Open [http://localhost:4200](http://localhost:4200). `studio:install` installs six
isolated Python environments using their committed lockfiles. Both `dev:studio`
and `start:studio` require all six environments. Interbank is started separately.

In **Studio settings**:

1. Save your model provider key under **Credentials**, or configure an accessible
   OpenAI-compatible endpoint under **Model backends**. Select the model and test
   the connection. The default chain includes an optional private vLLM provider
   and the OpenAI API. The private provider is skipped until its URL is configured.
2. Configure the integrations required by your demo using the table below. Use
   your own tenant, project, and agent stream. Create the project and stream in
   Agent Observability before registering hosted controls.
3. Test the saved credentials and use **Services → Apply** to start or restart
   the managed services. Check **Live configuration**, the service status, and
   the demo's Runtime details before running a live action.

Credentials are saved to the ignored root `.env` with mode 0600. Model routing
is saved to ignored `.studio/models.json`; it contains key variable names.
Model routes are read per request. Credential changes require **Apply**. You can
also copy `.env.example` to `.env` if the file does not exist, set `chmod 600 .env`,
and edit it before starting. Keep existing credentials when updating a checkout.
See the [configuration guide](docs/CONFIGURATION.md) for integration details.

Stop the foreground Studio command with **Ctrl+C**. It stops the Python processes
it launched. Services started separately must be stopped in their own terminals.

## Demo setup and execution modes

All ten entries remain visible in the library. Live execution needs the service
and integrations listed here. **Fallback: recorded demo** opens preserved runs;
recordings retain their original timestamps and measured counts.

| Demo | Runtime | Additional setup for live execution | Guide |
| --- | --- | --- | --- |
| Brahe Bank assistant | `banking`, port 8011 | Model plus Agent Observability project/stream and registered banking controls; AI Defense when enabled; Pinecone optional | [Banking](services/banking/README.md) |
| Card fraud triage | `fraud`, port 8012 | GPU scorer endpoint for live GNN scores; model for the triage agent; otherwise labelled recorded/sample scores and scripted text | [Fraud](services/fraud/README.md) |
| Company briefing | `briefing`, port 8013 | Model; SEC contact for ticker lookup, or upload a filing; AI Defense and OTLP export optional | [Briefing](services/briefing/README.md) |
| Market research | `wealth`, port 8014 | Model and market-data access; AI Defense to include inspected news; FRED optional | [Wealth](services/wealth/README.md) |
| Advisor meeting prep | `wealth`, port 8014 | Model and holdings/market data; hosted model egress requires AI Defense | [Wealth](services/wealth/README.md) |
| SAR investigation | `sar`, port 8015 | Model; hosted model egress requires AI Defense; hosted controls and tracing optional | [SAR](services/sar/README.md) |
| Code vulnerability analysis | `vulnerability`, port 8016 | Model; Visa harness installed by uv; hosted controls and tracing optional | [Vulnerability](services/vulnerability/README.md) |
| Interbank settlement investigation | Docker lab, port 8088 | Docker, model, AI Defense, Agent Observability, and Agent Control; separate lab startup | [Interbank](services/interbank/README.md) |
| KYC processing | Illustrative UI | Proposed workflow, no live KYC backend | Library story and architecture |
| Transaction LLM | Illustrative UI | Proposed workflow, no live transaction backend | Library story and architecture |

Market research loads an immutable evidence packet with financials, earnings, peers,
and news, then creates a cited 12-month Buy/Hold/Sell assessment. Uninspected or
flagged news is excluded. At least three supporting facts must verify. This flow
has no recorded assessment fallback. Other wealth workflows expose their own
recordings and labelled partial results.

Code vulnerability analysis runs Visa's DeepAgents harness against a synthetic
payments API. Its scoped Foundry profile adds revision-bound citations, independent
HTTP validation, publication gates, reviewed patches, and rescans. HEC evidence is
prepared and downloaded locally; the Studio does not send it to a Splunk receiver.

### Start the interbank lab

Configure the required root `.env` values first, then run in another terminal:

```sh
npm run studio:doctor -- --interbank
npm run interbank:up
npm run interbank:status
```

Keep the Studio running and open **Interbank settlement investigation**. `up`
builds images, generates local PKI, creates the lab's hosted controls, and starts
the containers. It requires permission to create resources in your configured
tenant. Use the [lab guide](services/interbank/README.md) for prerequisites,
trace verification, proxy certificates, and Linux container networking.

```sh
npm run interbank:down
```

### Preview recordings without live services

```sh
npm ci
npm run studio:doctor
npm run studio:preview
```

Open [http://localhost:4200](http://localhost:4200). Preview requires no Python,
Docker, model keys, or `.env`. Live demo APIs are disabled. Use the explicit
recorded fallback controls where available. Vulnerability analysis has no bundled
recording. Closing the command stops the preview.

### Run a production build locally

```sh
npm run build
npm run start:studio
```

For recording-only playback of the build, use `npm run start:preview` instead.
The public local listener defaults to port 4200 and the internal frontend uses
4201. Set `STUDIO_PORT` and, if needed, `FRONTEND_PORT` in the launching shell.
These launcher variables are not read from `.env`.

The server listens on loopback. Share the repo or screen-share the running Studio.
Hosted deployment needs authentication and access controls for the settings and
process-management APIs. Cloudflare development bindings in this repo are empty;
no hosted deployment is configured.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Missing Python environment | Run `npm run studio:install`, then `npm run studio:doctor -- --live` |
| Unsupported Python selected | Run `uv python install 3.12`; run installs from this checkout, which includes `.python-version` |
| Port already occupied | Stop the other instance or set `STUDIO_PORT=4300 npm run dev:studio`; Python ports remain 8011 through 8016 |
| Model is configured but runs fail | Test the endpoint and selected model in Studio settings; check required tool calling and demo-specific egress policy |
| Credential changes have no effect | Save, then **Services → Apply**; rebuild interbank with `interbank:up` |
| Hosted controls missing | Register the demo's policies for your project/stream using its service guide, then restart the service |
| SEC lookup fails | Set your real `SEC_USER_AGENT` contact, or upload a text-based annual report |
| Fraud shows recorded/sample scores | Start and connect the separate GPU scorer; inspect the score provenance |
| Browser test cannot launch | Run `npx playwright install chromium`, or set `CHROME_PATH` to your browser executable |
| Package or model TLS errors | Configure your organization's trusted CA for Node, Python, and Docker; see the interbank guide for `EXTRA_CA_FILE` |

`studio:doctor` checks local prerequisites without reading credentials, starting
services, or making model calls. `--live` makes missing Python requirements fail
the check; `--interbank` also requires a working Docker daemon and Compose v2.
Runtime health and confirmed trace delivery are reported separately in the Studio.

## Development and repository layout

| Path | Purpose |
| --- | --- |
| `app/` | React Studio, shared workspaces, run stats, narratives, settings, and architecture explorer |
| `services/` | Six Python sidecars, interbank lab, shared run code, and model routing |
| `scripts/` | Local launchers, service management, host APIs, prerequisite checks, and source evidence generation |
| `config/` | Committed non-secret model routing defaults |
| `fixtures/` | Synthetic scenarios and curated demo inputs |
| `tests/` | Node tests and Playwright browser flows |
| `docs/` | Configuration, requirements verification, and design plans |
| `worker/`, `db/`, `drizzle/`, `build/`, `.openai/` | vinext/Cloudflare build support and optional storage scaffolding |

Read [AGENTS.md](AGENTS.md) before making changes and
[CONTRIBUTING.md](CONTRIBUTING.md) for development, tests, and fork conventions.
Every Architecture tab uses one continuous draw.io canvas with collapsible
journey, system, and component detail, platform layers, and source evidence. See
[architecture maps](ARCHITECTURE_MAPS.md) for authoring and validation.
Validation commands include `npm test`, `npm run typecheck`, `npm run lint`,
`npm run test:browser`, and the per-service `npm run <service>:test` commands.
See [setup verification](docs/SETUP_VERIFICATION.md) for the tested environment
and checks completed during the onboarding cleanup.

Upstream license notices remain with vendored/adapted code, including
[banking's MIT notice](services/banking/LICENSE). This repository currently has no
root license; the owner needs to choose redistribution terms before public release.
