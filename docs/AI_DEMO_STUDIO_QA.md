# AI Demo Studio validation

Validation date: October 28, 2026. Node 24.11.1, npm 11.6.2, Docker Compose 2.36.

## Delivered behavior

The platform has five industry apps under one installation. Financial Services
retains its ten demos and eight runtimes. Healthcare, Manufacturing, Retail, and
Public Sector have separate empty libraries, app settings, controls, telemetry,
and story entry points. Their content can be registered without copying the
platform shell.

Demo packages own their UI, narratives, presenter notes, tours, and deployment
files. Five dedicated Python backends moved into their packages with dependencies,
fixtures, recordings, licenses, and tests. Research and Advisory retain the shared
Wealth engine; Interbank retains its upstream multi-container package.
Compatibility paths preserve existing development commands and API identities.

Models, integration credentials, and operator services remain shared. App model
edits merge scoped route changes with revision checks. Runtime selections are
validated before work is queued. Prepare retains healthy containers, and app
navigation preserves running workspace sessions. Browser state and planner
references retain the existing FSI migration path.

## Automated coverage

| Check | Result |
| --- | --- |
| Production build and Node contracts | 258 passed |
| TypeScript | Passed |
| ESLint | Passed with no warnings |
| Python service and shared-platform tests | 344 passed |
| Full development browser run | 149 passed initially; all 11 failing cases passed after corrections; both optional external planner cases subsequently passed |
| Production browser regression set | 34 passed, followed by 21 passed on the final build |
| Additional affected development workflows | 33 passed, including three new vulnerability lifecycle tests |
| Live external planner integration | Both tests passed after approval |
| Responsive header and final live-planner regression | Five tests passed |
| Industry sidebar and Studio home navigation | 40 development and 18 production browser tests passed |
| Temporary populated-app fixture | Passed |
| Compose resolution and image builds | All eight packages passed; Research and Advisory reused one image |
| App-scoped doctor commands | FSI and empty Healthcare prerequisites passed |
| Architecture source evidence | 113 excerpts regenerated |
| Whitespace/error checks | Passed |

Python coverage comprises Banking 34, Fraud 46, Briefing 50, Wealth 114, SAR 41,
Vulnerability 29, shared platform 25, and Interbank 5 tests. Tests with local HTTP
receivers ran with local network access enabled.

Browser coverage exercises app and demo URLs, history, refresh, app/tab switching,
active-run retention, stats deduplication, library search, filters, settings,
model ordering, container selection, human decisions, blocked actions, outages,
explicit recordings, handoffs, saved planner drafts, stories, keyboard access,
forced colors, reduced motion, and guided tours. All ten architecture canvases
were expanded and inspected, including security/observability layers and source
inspection. Visual checks covered dark and light themes at desktop and narrow
widths.

The registered suite now has 169 cases. All 169 passed across the full run and
targeted reruns, including the approved external planner tests, responsive header,
and industry navigation checks. The populated-app fixture is an additional isolated check.

Most browser service responses and planner bundles are deterministic fixtures or
reviewed recordings. They verify frontend behavior and contracts. The live
execution evidence below is separate.

An isolated development-server fixture temporarily registered an existing demo
in a second app. It verified a populated overview, independent workspace drafts,
app-specific story composition, and return to the original app's draft. The
fixture was restored immediately. The shipped Healthcare catalog remains empty.

## Observed live execution

### SAR investigation

Run `sar-20261028123307-78mvg3` completed through the rebuilt SAR image and the
configured shared model route. The workflow produced a cited draft, accepted an
investigator decision from Theo Marsh, blocked filing pending separate QA, and
accepted approval from Lena Ortiz. The final confirmation was
`SIM-BSA-4FB71B3BCB`. Filing was simulated.

Measured results:

| Observation | Value |
| --- | --- |
| Model calls | 5 |
| Tool calls | 8 |
| Input/output tokens | 21,454 / 1,515 |
| Time to draft | 27 seconds |
| AI Defense inspections | 23 |
| Blocked inspections / inspection errors | 0 / 0 |
| Agent Observability | SDK reported recorded |
| Additional OTLP export | Unconfigured |
| Agent Controls | Local checks |

The run continued across the Architecture tab and an industry app switch. Its
final decision, run identity, stats, and single-run session count survived refresh.
Returning after running Banking retained the completed investigation.

### Banking conversation

A real credit-score question completed after the SAR workflow using the existing
Banking stack and shared platform configuration. It returned the synthetic score
550. The UI reported four model calls, one tool call, one handoff, 14 AI Defense
inspections, three allowed control checks, no denials, and 23 seconds latency.
Agent Observability reported its trace recorded; additional OTLP was unconfigured.

Trace delivery here is the service's SDK upload acknowledgement. Independent
retrieval from the observability tenant was outside this validation. No hosted
control registration was performed.

### Warm preparation and storage

`prepare banking sar --app fsi` reported both stacks already ready. Docker
container IDs and creation timestamps were identical before and after the
operation. The adopted installation namespace remained `fsi-d0bf9ec0`.
All eight Compose configurations retained their existing projects and storage
identities. Saved-data volumes, Interbank PKI/evidence, and unrelated planner
containers were preserved.

## Corrections found during QA

- Register guide hosts and actions only for the active workspace. Hidden cached
  workspaces previously could claim a guide's tab switcher.
- Route shared integration settings links to platform settings and reveal their
  sections after settings load.
- Retain workspace sessions by app and demo, including when a neutral workflow
  is intentionally listed in multiple apps.
- Render populated industry overviews and generic story composition without FSI
  lifecycle content. Keep empty app states accurate.
- Preserve separate planner and vulnerability run references for each app while
  retaining legacy FSI references.
- Remove intermediate low-contrast card backgrounds during theme changes.
- Keep the company selector and app navigation separated at desktop widths;
  verify 1100, 1250, and 1440 pixel layouts.
- Update browser fixtures for canonical API routes, current live-only Research
  behavior, persistent demo URLs, explicit fallback selection, and guide readiness.

## Completed image and planner validation

The user approved the two previously blocked validation steps. Removing unused
Docker build cache older than 24 hours reclaimed 4.69 GB. Available disk increased
to about 17 GB, and all eight runtime packages completed their image build
commands. Research built the shared Wealth image; Advisory reused that image.
Interbank built its shared agent/demo image successfully.

The approved live planner tests loaded the configured browser bundle and API from
ai-infrastructure-planner.com. They verified imported recorded-run measurements,
model selection, sizing, BOM, topology, racks, costs, saved edits, both themes,
and restoration of older drafts. Both passed. No analytics events were sent.

A final screenshot review identified a crowded FSI header. The company selector
now retains space beside app navigation. The new layout regression and both
external planner tests passed again after that correction, alongside the desktop
and narrow-screen theme checks. The production build, all 258 Node tests,
TypeScript, and lint passed after the final change.

Banking and SAR container IDs and creation times remained unchanged. The running
Interbank stack and unrelated planner containers also remained running. Saved
data volumes and Interbank PKI/evidence were preserved.

No image-build or planner validation gates remain open.

## Industry navigation refinement

Inside an industry app, the sidebar now contains only its workspace and domain
navigation. **All industry apps** at the top returns to the Studio homepage; the
AI Demo Studio logo also links there. The launcher retains industry switching
and provides a searchable homepage entry.

Validation covered expanded and collapsed sidebars, the mobile drawer, both
themes, app switching, browser history, retained drafts, and in-progress demo
responses. The affected development browser set passed 40 tests, and the
production navigation/workspace set passed 18. Production build, all 258 Node
checks, TypeScript, lint, and whitespace checks passed after the change.
