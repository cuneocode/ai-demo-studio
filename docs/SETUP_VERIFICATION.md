# Setup verification

## Container migration validation, October 23, 2026

The working branch migrates all eight executable demos to independent Compose
projects. The new README describes this target runtime. The October 22 checks
below document the earlier source-mode implementation.

Validated on macOS Apple Silicon with Node 24.11.1, Docker Engine 28.1.1,
and 7.7 GiB assigned to Docker. Builds and tests ran sequentially.

| Check | Result |
| --- | --- |
| Production build, TypeScript, and lint | Passed |
| Compose packages | All eight executable packages built and started through the operator |
| Full Node suite | 228 passed, including updated Research architecture coverage |
| Shared Python and service suites | 344 passed across shared code and seven source environments |
| Affected browser flows | 57 passed with mocked APIs and one browser worker, covering container controls, Settings, architecture, stats, Banking, Briefing, Fraud, SAR, Interbank, Research, Advisor, and cross-demo handoffs |
| Real production dashboard | Eight stacks displayed; Research Start/Stop and public/legacy proxies passed; Advisor stayed stopped |
| Research/Advisor isolation | Separate volumes confirmed; stopping Research left Advisor available |
| SAR persistence | Recreation preserved a synthetic run's identity, result, provenance, and event identities |
| Live Research | Two model calls, 12,277 input tokens, 620 output tokens, ready report, and acknowledged Agent Observability upload |
| Live Research restoration | The same 14 events and measured usage survived recreation |
| Live Interbank | Synthetic investigation completed with model calls, A2A, database tools, AI Defense, and hosted control decisions |
| Interbank trace delivery | Destination query confirmed 133 correlated spans, including 11 LLM and three control spans; verifier passed |
| Interbank evidence | All 35 earlier investigations remained available after migration |
| Vulnerability | Visa 1.5.0 scan/remediation imports passed inside the image; local sample checks reproduced the expected vulnerable baseline; live readiness reports unregistered hosted controls |
| Architecture source capture | All 93 excerpts regenerate |

Banking's hosted controls are unavailable in this configuration. Vulnerability
requires its explicit hosted-policy setup before a live scan. Fraud used labelled
fixture scores; local NVIDIA scoring was not exercised. Generic Splunk OTLP export
was unconfigured during Research; Agent Observability delivery was verified.

An earlier image extraction exhausted host disk and stalled Docker. Recovery
preserved saved data. The operator now queues operations, limits Compose and
installer concurrency, and checks for 15 GB of free host disk. Retired Interbank
containers and networks were removed after verifying checkout ownership; PKI,
configuration, and evidence were retained. All test stacks were stopped afterward.

## Source-mode verification, October 22, 2026

Verified on October 22, 2026 using macOS on Apple Silicon, Node 24.11.1,
npm 11.6.2, uv 0.11.23, and uv-managed Python 3.12.13. This is the verified local
configuration. Linux, WSL2, other CPU architectures, and lower memory/disk budgets
were not exercised during this cleanup.

A temporary source snapshot included the current working files and the onboarding
changes. It excluded `.env`, `.studio/`, installed dependencies, runtime caches,
and generated output. Model and integration variables were removed from the
integrated startup environment. Existing work in the main checkout was preserved.

## Passed checks

| Check | Result |
| --- | --- |
| Fresh `npm ci` | Installed the committed dependency graph |
| Fresh `npm run studio:install` | Installed all six frozen Python environments, including the pinned Visa harness |
| Fresh `npm run studio:doctor -- --live` | All six Python environments imported FastAPI and uvicorn and used supported Python 3.12.13 |
| `studio:doctor -- --interbank` on the host | Docker daemon and Compose available; no lab resources created |
| Doctor failure handling | Preview prerequisite check succeeded without live tools; `--live` and `--interbank` returned failure when their tools were missing |
| Fresh `npm run studio:preview` | Browser loaded the Studio and settings with no credential file |
| Fresh `STUDIO_PORT=4300 npm run dev:studio` | All six sidecars started, returned HTTP 200 health responses, and appeared as managed processes |
| Missing model configuration | Banking, briefing, wealth, SAR, and vulnerability reported unready; fraud identified its available recorded/sample scoring path |
| Fresh `npm run build` | Production build completed |
| Fresh `STUDIO_PORT=4400 npm run start:preview` | Homepage returned 200, Studio status reported preview, and live vulnerability requests returned 503 |
| Preview API regression checks | Both Node tests passed, including the vulnerability API block and recording access |
| `npm run platform:test` | 21 shared Python tests passed |
| Targeted ESLint on changed JavaScript/TypeScript | Passed |
| Port collision | A second dev server exited with a clear port-in-use error |
| Sharing hygiene | No tracked `.env`, private key, Python bytecode, or runtime credential files; the limited credential-pattern scan found no matches |

The new `npm test` command builds the Studio and runs all Node tests. The rendered
HTML smoke test now verifies the real Studio shell instead of the removed starter
screen. Playwright uses its installed Chromium by default; `CHROME_PATH` remains
an optional override.

## Source-mode checkout failures, October 22

The broader checks expose outstanding application/test issues beyond the onboarding
changes. They remain visible to contributors:

- **Node tests:** 169 passed and 18 failed. Failures are in
  `tests/architecture.test.mjs` (15), `tests/explorer-model.test.mjs` (1), and
  `tests/guide-tours.test.mjs` (2). They include market-research diagram/expectation
  drift, a stale architecture case count, and market-research guide anchors/story
  requirements.
- **TypeScript:** 19 errors remain in company-profile parsing, architecture scene
  types, an explorer test, Vite middleware annotations, and missing Cloudflare
  worker/storage declarations. The cleanup enabled `.ts` imports in `tsconfig.json`
  to match the host scripts' actual imports.
- **Repo-wide lint:** passed after fixing the Foundry panel's state reset during
  the subsequent feature verification.
- **Browser tests:** 10 passed and 4 failed across `tests/settings.spec.ts` and
  `tests/shell.spec.ts`, using installed Chromium against live Studio mode on port
  4300. Failures include stale settings labels/selectors, telemetry text, and the
  KYC stage label expectation (`Prototype` versus the current `Planned`). The
  passing flows include model-key validation, AI Defense settings, the model
  indicator, navigation persistence, theme persistence, tab switching, and keeping
  a run intact while viewing its architecture.

## Integration coverage

This verification covered local installation, launchers, proxies, health,
configuration UI, preview blocking, and shared model/run behavior. It did not
register hosted controls, create an interbank deployment, call a paid model,
train a GPU scorer, or establish telemetry delivery. Those procedures require
the engineer's configured accounts and are documented in the service guides.

The repository has no root license selection. Preserve upstream notices while
the owner chooses the repository's redistribution terms.

## Foundry evidence verification

The local Foundry extension was checked after the onboarding cleanup on October
22, 2026. `npm run vulnerability:test` passed all 29 checks, including real HTTP
probes before and after a reviewed fix, citation denial, immutable artifact hashes,
idempotent HEC export, per-operation telemetry, and finding history across rescans.
Two added regressions ensure an empty rescan requires current HTTP evidence and
working legitimate access before its coverage goals can close.

`npm run lint` and `npm run build` passed. The targeted shared Node suites for
architecture scenes, preview APIs, guide placement, and inference status passed
27 checks. The existing 19 TypeScript errors and two market-research guide-test
failures remain outside this feature's changes.

Browser verification used an isolated API with a copy of a saved Visa scan that
had recorded 15 model calls. It exercised building evidence, denying an invalid
citation, preparing a confirmed event, copying its JSON, and downloading five
unique HEC envelopes. Both declared security goals reproduced on the independent
HTTP testbed. Switching architecture tabs preserved the run, events, and session
counts. Refreshing the browser and restarting the API restored the same four
operations, five event identities, and evidence artifact hash. The new evidence
and publication operations each reported zero model calls.

All six vulnerability architecture source excerpts were regenerated with
`npm run map:sources -- --prefix=vulnerability.` and resolved through the source
inspection API. Full-repo source regeneration currently encounters a pre-existing
stale `brahe.galileo.call` range; the targeted vulnerability capture succeeds.

This check used local policy enforcement. Hosted Agent Control decisions have SDK
failure-path tests; live hosted enforcement needs the four registered policies in
the configured tenant. HEC remains a local outbox with zero events sent and unknown
indexing. The browser check made no new paid model calls or hosted policy changes.
