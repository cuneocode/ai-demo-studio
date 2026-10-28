# Adding a use case

## Start with the platform contracts

Read [AGENTS.md](../AGENTS.md), [README.md](../README.md), and
[CONTRIBUTING.md](../CONTRIBUTING.md) first. Use
[AI Demo Studio platform](AI_DEMO_STUDIO.md) for routes, app-scoped APIs, shared
settings, persistence, and compatibility. This guide applies to coding agents
and engineers extending a fresh fork.

Industry manifests own categories and library membership. Each demo owns its
domain files under `demos/<demo-id>/`. The installation owns the shared shell,
model endpoints, credentials, integration defaults, and container operator.
Adding a demo requires several explicit registrations. There is currently no
scaffolder or directory auto-discovery.

```text
demos/<demo-id>/
  definition.ts             DemoDefinition metadata
  workspace.ts              UseCaseFrame copy and workflow framing
  narrative.ts              DemoNarrative content and references
  presenter-notes.ts         Presenter guidance
  tours.ts                  Guided walkthrough, when applicable
  README.md                 Workflow, prerequisites, package ownership
  ui/
    Workspace.tsx           Default-exported adapter using WorkspaceProps
    <Component>.tsx         Domain interaction
    <styles>.css            Scoped styles, imported by the component
  backend/                  Dedicated live backend
    pyproject.toml
    uv.lock
    server.py
    tests/
    data/                   Curated synthetic inputs and reviewed recordings
  deploy/                   Live deployment
    Dockerfile
    compose.yaml
```

Illustrative demos have no runtime, backend, or Compose stack. Research and
Advisory explicitly reuse `services/wealth/`; Interbank retains its upstream
multi-container implementation in `services/interbank/`. Existing `app/` demo
exports, `services/` symlinks, and `use-cases/` Compose forwarding files preserve
older integrations. New packages need no compatibility wrappers.

## Choose a reference and target industry

Inspect a reference's adapter, component, backend, narrative, architecture, and
browser tests before implementing. Adapt its workflow and shared structures.

| Workflow | Reference implementation | What to follow |
| --- | --- | --- |
| Case review with source records, findings, and human decisions | [SAR package](../demos/sar-support/README.md), [adapter](../demos/sar-support/ui/Workspace.tsx), [UI](../demos/sar-support/ui/SarInvestigation.tsx), [backend](../demos/sar-support/backend/server.py), [browser flow](../tests/sar.spec.ts) | `OperatorWorkspace`, source inputs, background runs, approvals, stats, recorded fallback |
| Conversational assistant | [Banking package](../demos/brahe-bank/README.md), [adapter](../demos/brahe-bank/ui/Workspace.tsx), [UI](../demos/brahe-bank/ui/BankingDemo.tsx), [backend](../demos/brahe-bank/backend/server.py), [browser flow](../tests/banking.spec.ts) | Embedded chat, sessions, tool evidence, control verdicts, measured turn stats |
| Agents across service boundaries | [Interbank package](../demos/interbank-a2a/README.md), [UI](../demos/interbank-a2a/ui/InterbankDemo.tsx), [backend guide](../services/interbank/README.md), [browser flow](../tests/interbank.spec.ts) | Multiple containers, A2A timeline, shared trace identity, gateway boundaries |

Choose `fsi`, `healthcare`, `manufacturing`, `retail`, or `public-sector` as the
owning app. Adding a demo to these apps uses the existing generic routes.
Introducing another industry requires extending `APP_IDS` in
[app-contract.ts](../config/app-contract.ts), adding its manifest/import to
[config/apps.ts](../config/apps.ts), and updating route, enablement, and catalog
tests.

Write down the intended user, synthetic starting evidence, agent actions, human
decisions, result, external integrations, and provenance. Choose stable kebab-case
demo and runtime IDs and a workspace key. For example, SAR's demo/model-route ID
is `sar-support`; its runtime and workspace key are `sar`. Preserve released IDs
because saved runs, routes, tours, and planner drafts use them.

Choose `live` or `illustrative` in `definition.ts`. A live definition currently
requires a runtime, workspace key, and model metadata. Its UI reports missing
dependencies and offers a labelled recording only when one exists. An
illustrative definition omits runtime/model/workspace fields, sets `assets.ui` to
`null`, and retains its story, workspace framing, architecture, and presenter
notes. Planned outputs and proposed integrations remain explicitly labelled.

## Register the demo

Author the package files, then wire the following indexes. Public metadata must
remain free of secrets, Node APIs, SDK imports, and executable React components.
The `assets` paths describe ownership; they do not dynamically import files.

| Area | Required edits |
| --- | --- |
| Definition | Export `definition` satisfying `DemoDefinition` from `demos/<demo-id>/definition.ts`. Import it into `demoDefinitions` in [config/demos.ts](../config/demos.ts). Reuse an `iconKey` from [studio/catalog.ts](../app/studio/catalog.ts), or add its Lucide import/map entry. |
| Industry membership | In `verticals/<app-id>/app.ts`, add the category and `{ demoId, categoryId }` catalog entry. Category IDs must exist in that manifest. Every `defaultStory` ID must belong to its library. Keep `context: null` and `storyId: null` for apps using the generic overview and story builder. FSI's company context and lifecycle are app-specific. |
| Workspace framing | Export `workspace` satisfying `UseCaseFrame` from the package's `workspace.ts`. Import and index it by demo ID in [app/studio/frames.ts](../app/studio/frames.ts). Every demo needs this copy, including illustrative demos. |
| Live workspace adapter | Add the key to `WorkspaceKey` in [demo-contract.ts](../config/demo-contract.ts) and `UseCaseFrame.liveExperience` in [frames.ts](../app/studio/frames.ts). Set the package frame's `liveExperience`. Default-export the package's `ui/Workspace.tsx` using [WorkspaceProps](../app/studio/workspace-contract.ts); add its lazy import to [workspaces.tsx](../app/studio/workspaces.tsx). |
| Runtime | Add a `RuntimeSpec` to `runtimeDefinitions` in [config/use-cases.ts](../config/use-cases.ts) and set the definition's `runtimeId`. Declare source, Dockerfile, image/build identity, Compose file/service, unique loopback port and API prefix, upstream prefix, health route, timeout, model-route ID, narrow environment allowlist, supported shared bindings, storage, and optional components/controls. Follow [CONTAINERS.md](CONTAINERS.md). |
| Model routing and policy | Set `definition.model` with the actual callers, when changes apply, and `clientData` when appropriate. [MODEL_USE_CASES](../app/studio-models.ts) is derived from definitions with model metadata and a workspace key. All callers, including judges, use [shared Python routing](../services/llm/studio_models.py). Align client-data policy with `CLIENT_DATA_POLICY` there and any defaults in [studio-models.default.json](../config/studio-models.default.json). Local provider choices stay in ignored `.studio/models.json`. |
| Settings and readiness | Add the readiness entry and supported fields in [app/studio-settings.ts](../app/studio-settings.ts). Allow needed variables in the runtime contract and add credential-free examples to [.env.example](../.env.example). [studio-status-api.ts](../scripts/studio-status-api.ts) reads registered runtimes; extend its health adapter when the backend reports a different shape. |
| Audience story | Export the package narrative using `DemoNarrative`, then import/index it in `authoredNarratives` in [app/demo-narratives.ts](../app/demo-narratives.ts). Preserve stakeholder need, workflow change with human ownership, and operational outcome in that order. Include Cisco contributions, proposed deployment options, and evidence-backed references. |
| Presenter guidance | Author package `presenter-notes.ts`, then import/index its notes in [app/presenter-notes.ts](../app/presenter-notes.ts). Align the problem, AI workflow, Cisco contributions, and handoffs with actual execution. |
| Guided tour | Author package `tours.ts`, import its tours into `ALL` in [app/guide/tours/index.ts](../app/guide/tours/index.ts), and declare [anchors](../app/guide/anchors.ts). Extend service/action/condition types and handlers when introducing a new runtime or interaction. Existing `LIVE_RUNS` rewriting is specific to existing replay steps; inspect it before reusing those semantics. |
| Architecture | Author the catalog/scenes in [app/map/catalog.ts](../app/map/catalog.ts) and the reference's supporting definitions, including [architecture-zoom.ts](../app/architecture-zoom.ts) where used. Declare platform paths in [platform-connections.ts](../app/map/drawio/platform-connections.ts), model callers in [implementation-views.ts](../app/map/drawio/implementation-views.ts), and source evidence in [evidence.ts](../app/map/evidence.ts). [drawio/registry.ts](../app/map/drawio/registry.ts) composes the catalog into the shared viewer. Follow [ARCHITECTURE_MAPS.md](../ARCHITECTURE_MAPS.md). |
| Offline inputs and recordings | Register explicit canonical directories/paths in `RECORDINGS` and `EXAMPLES` in [scripts/studio-api.ts](../scripts/studio-api.ts). Update example ownership checks for the new runtime. The existing recording-service URL matcher accepts letters only; extend and test it if the runtime ID includes other characters. Preserve app scope, reviewed provenance, and curated synthetic data. Verify access with the live stack stopped. |
| Tests and documentation | Add package/backend guides, backend tests and test command, and meaningful browser flows. Register a new browser filename in [playwright.config.ts](../playwright.config.ts). Update affected catalog/count/empty-library assertions and the root README demo table. Preserve the original FSI compatibility baseline. |

`useCasePackages`, service discovery, container operations, proxies, and model
settings derive from these definitions. `app/page.tsx` is a route wrapper; the
persistent platform shell is [StudioApplication.tsx](../app/studio/StudioApplication.tsx).
A new package should load through the workspace registry. Shared platform changes
belong in shared code when the workflow requires a reusable capability.

For the standard generic architecture, add the demo to both `catalogs` in
`app/map/catalog.ts` and `zoomMaps` in `app/architecture-zoom.ts`. Add its system
summary in `app/map/drawio/generic-pages.ts` and runtime description in
`app/map/drawio/platform-views.ts`. Register concrete `modelConsumers` and
`callSources` in `implementation-views.ts`, plus the inspection, control, and
telemetry callers required by its platform contract. These mappings refer to
actual scope/cell identities. Copying a catalog ID without the corresponding
topology and caller mappings leaves the generated architecture incomplete.

## Example: add a Manufacturing workflow

This registration example uses demo ID `maintenance-triage`, runtime/workspace
key `maintenance`, and the existing Manufacturing app. First extend the two
workspace-key unions and create the package files from the selected reference.
Then add `demos/maintenance-triage/definition.ts`:

```ts
import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  id: "maintenance-triage",
  title: "Maintenance triage",
  description: "Review synthetic equipment alerts and prepare a maintenance recommendation.",
  outcome: "A maintenance planner approves a recommendation backed by source records.",
  iconKey: "Factory",
  accent: "blue",
  solutions: ["AI Defense", "Splunk Observability", "AI Infrastructure"],
  signal: "Equipment evidence and human approval",
  stage: "In development",
  mode: "live",
  architectureId: "maintenance-triage",
  runtimeId: "maintenance",
  workspaceKey: "maintenance",
  model: {
    calls: "Maintenance triage agent",
    applies: "Next investigation",
  },
  assets: {
    ui: "demos/maintenance-triage/ui/Workspace.tsx",
    narrative: "demos/maintenance-triage/narrative.ts",
    presenter: "demos/maintenance-triage/presenter-notes.ts",
  },
} satisfies DemoDefinition;
```

Import this definition into `config/demos.ts` and append it to `demoDefinitions`.
In `verticals/manufacturing/app.ts`, retain the existing app identity and set:

```ts
categories: [{ id: "operations", label: "Operations", iconKey: "Factory" }],
catalog: [{ demoId: "maintenance-triage", categoryId: "operations", featured: true }],
defaultStory: [],
context: null,
storyId: null,
```

An empty `defaultStory` lets users compose their own sequence. Set it to
`["maintenance-triage"]` only if this workflow should be preselected. `storyId`
refers to an authored industry story; the existing `lifecycle` story belongs to FSI.
The first demo needs no company-briefing prerequisite or FSI handoff state.

Use `liveExperience: "maintenance"` in package `workspace.ts`, register its frame
by `maintenance-triage`, and add this entry to the lazy workspace map:

```ts
maintenance: lazy(() => import("../../demos/maintenance-triage/ui/Workspace")),
```

Register runtime `maintenance` with `modelUseCase: "maintenance-triage"`, a free
loopback port, and a unique API prefix such as `/api/maintenance`. Its Compose
image must match `buildIdentity`. Complete the remaining story, tour, readiness,
architecture, and test registrations above. The library entry and definition
alone do not provide an executable workflow.

Open `/apps/manufacturing/library`, then
`/apps/manufacturing/demos/maintenance-triage`. Verify that FSI retains its own
library and that the new runtime is rejected from unrelated app-scoped APIs.
A demo intentionally listed in several industries shares its model-route and
runtime identity. Use distinct demo IDs and runtime/storage contracts when the
industries need different data, policies, or lifecycle.

## Build the shared experience

Studio owns the app header, sidebar, use-case heading, story panel and the three
tabs declared in [studio-nav.ts](../app/studio-nav.ts): **Use case demo**,
**Architecture**, **Capacity planning**. Render the demo inside that shell. Use
the existing embedded mode when adapting a component with standalone navigation.

For a case or document workflow, use
[OperatorWorkspace](../app/OperatorWorkspace.tsx). Its work area presents source
records and inputs, findings and the result, then the relevant human decision.
Its optional inbox selects cases. Its execution area holds the shared summary,
timeline, control evidence and live stats. Keep long documents and evidence
bounded and scrollable. Chat and multi-agent demos can retain their established
interaction layout while sharing the shell, stats and provenance components.

Reuse [SourceInputs](../app/SourceInputs.tsx),
[DemoWorkflow](../app/DemoWorkflow.tsx),
[RunTimeline](../app/run/RunTimeline.tsx),
[RunStats](../app/RunStats.tsx),
[ProvenanceBadge](../app/run/ProvenanceBadge.tsx) and
[ReplayPicker](../app/run/ReplayPicker.tsx) where applicable. Extend a shared
component when the new capability should work across demos.

Show useful empty and loading states, clear next actions, recovery after a
failure, and cancellation for long operations. Label inputs and icon buttons.
Keep keyboard focus visible, expose progress and errors accessibly, and include
text alongside status colors. Human approvals must retain their identity and
evidence across refreshes and saved-run restoration.

### App scope and retained execution

Read the owning app/demo from [useStudioNav](../app/studio-nav.ts). Studio retains
each workspace by app and demo while users visit other apps. Keep requests and
run references tied to that owner. Use `active` for visible-surface effects such
as focus and guide anchors while execution continues in the retained workspace.

Pass the stable demo ID to `useRun`; `useRunLedger()` reads its owner from the
workspace navigation context. Use
`appStorageKey(appId, name, demoId)` and the shared read/write/remove helpers in
[storage.ts](../app/studio/storage.ts) for additional persisted state. Avoid new
legacy `fsi-*` keys or unscoped singleton run references. FSI company profiles,
research notes, advisory briefs, and lifecycle handoffs stay in their owning app.

Scope host API requests with the owning `?app=<app-id>` for settings, status,
model overrides, runtime actions, recordings, and examples. Verify membership
rejection for unrelated and disabled apps. Membership also controls lifecycle
selection; adding an app card alone grants no runtime access. Keep the shared
homepage return and industry-local sidebar working.

## Preserve the visual design

[app/globals.css](../app/globals.css) contains the visual contract and semantic
tokens. [operator-workspace.css](../app/operator-workspace.css), shared component
styles and the chosen reference define layout, spacing and control treatment.

- Use `--bg`, `--surface`, `--surface-2`, `--border`, `--text` and `--muted` for
  surfaces and text. Use existing blue/violet accents and semantic success,
  warning and danger colors. Preserve the ink/navy/slate theme and restrained
  surface hierarchy. Avoid cyan and neon treatments.
- Use shared `primary-button` and `secondary-button` classes and existing panel,
  badge and form patterns. Use Lucide icons for application UI. Architecture uses
  the shared Carbon component symbols.
- New metadata, body text and controls use `--font-meta` (14px), `--font-body`
  (15px) and `--font-control` (16px). Keep text readable during screen sharing.
  Reflow long labels, tables and diagrams or provide scrolling when needed.
- Scope service-specific CSS beneath the demo's component classes. Keep shell
  layout and shared controls in their shared stylesheets. Avoid global element
  selectors in a use-case stylesheet. Package styles belong under
  `demos/<demo-id>/ui/`, which the light-theme transform includes.
- Author dark styles as the source. The build's
  [light-theme transform](../scripts/postcss-light-theme.mjs) derives light styles;
  [theme-light.css](../app/theme-light.css) holds necessary exceptions. Verify
  contrast, focus, disabled states and long content in both themes.

Compare the new demo beside its reference at presenter laptop and narrow widths.
Keep its headings, panel hierarchy, spacing and evidence density consistent.

## Connect execution and configuration

Use [services/common/runs.py](../services/common/runs.py) and the shared
[event contract](../app/run/events.ts) for background operations, or adapt an
upstream stream to that contract. Use [useRun](../app/run/useRun.ts) to follow and
replay events. Preserve run IDs, event IDs, ordering and trace correlation. Actual
cancellation must stop the operation as well as its UI polling.

Feed `useRunLedger` and `RunStats` from reported execution: model/tool calls,
provider token totals, elapsed time, control decisions and trace delivery. Retain
unknown values as unknown and explicit zero as zero. Preserve provenance for
live runs, recordings, cached results and synthetic samples. Restore results and
their measurements together; deduplicate repeated events and polling updates.

Use [shared model routing](../services/llm/README.md) and the engineer's saved
settings. Model callers must use the selected provider URL, key variable and
capabilities. Verify the intended tool-calling workflow with that provider.
Keep credentials server-side and respect the configured hosted-model policy.
Declare extra services, rerankers, embedding endpoints and GPU needs in the
runtime contract. Forks must work without access to the author's workstation,
private checkout, model host or tenant.

Reuse the installation's shared endpoints and integration credentials. Select
per-demo models through route overrides in Studio settings. Rebuild cached SDK
clients or agent graphs when the selected backend's `signature` changes; the
next request must use the updated route. Keep Python dependencies and `uv.lock`
isolated in the package backend. Additional application services belong in the
demo's Compose stack, with explicit readiness and persistence.

`sharedBindings` declares supported capabilities. Implement actual AI Defense
inspection and verdict enforcement at the calling application or gateway, and
instrument each agent with the supported observability SDK/export path. Shared
credentials do not establish either integration. Test the inspected/blocked
path and confirm telemetry delivery with trace/run correlation.

Health and readiness should distinguish a running API, a usable model, required
control availability and configured telemetry. Check effective integration URLs
and the intended project/stream before concluding policies are missing. A model
listing or HTTP 200 health check alone does not verify an agent run. Hosted policy
registration remains an explicit administrative command.

## Inherit Capacity planning

The shell supplies [CapacityPlanning](../app/CapacityPlanning.tsx) for every use
case. Its stable ID, title and outcome initialize the assessment; shared
`RunStats` supplies the latest available observation through
[PlanningRunContext](../app/planning-evidence.ts). New assessments use the
editable GLM 5.3 planning default independently of the demo's inference model.

Keep observations separate from production demand. Follow
[planner configuration](CONFIGURATION.md#capacity-planning) and the existing
[initialization mapper](../app/planner-integration.ts). Additional workload
mapping belongs in shared code when required. Studio builds independently of the
private planner repository; consuming its configured public browser artifact
requires no private package or planner credentials.

## Finish and verify

Register the use case in
[platform-connections.ts](../app/map/drawio/platform-connections.ts). Read the
runtime inspection, policy and telemetry code before declaring its paths. Record
the inspection caller, the component enforcing the verdict, each instrumented
agent or gateway, and its exporter, collector and destination. Use Security
control edges for policy evaluation and Observability telemetry edges for export.
Supply allowlisted source evidence for implemented paths. Illustrative use cases
declare proposed paths; unavailable integrations retain an explicit disabled state.

Platform edges use concrete cross-scope terminals and project to owning groups
when collapsed. Verify the real endpoints after expansion and the summary after
collapse. Extend `tests/platform-connections.test.mjs` and the affected draw.io
browser flow when introducing a new transport or enforcement pattern. The registry
rejects a use case without a platform connection contract.

- Update the initial-release assumptions in
  [studio-apps.test.mjs](../tests/studio-apps.test.mjs): total demo/runtime/model
  counts, FSI-only catalog equality, CLI scope selections, and empty libraries.
  Iterate the frozen [FSI baseline](../tests/fixtures/fsi-compatibility.json) when
  asserting existing identities and add separate assertions for new demos.
  Keep the original baseline intact. In
  [vertical-apps.spec.ts](../tests/vertical-apps.spec.ts), replace the populated
  app's empty-library expectation with its actual library/workspace flow and
  retain empty-state coverage for apps that remain empty. Inspect other explicit
  lists in guide, rendered HTML, container, and architecture tests.
- Confirm matching IDs, catalog entries, readiness, model routing, story, tour
  and architecture. Confirm all three shared tabs and all three architecture
  layers work for the new use case.
- Verify launcher to industry library to demo and back to the homepage, plus
  direct deep links and browser Back/Forward. Confirm unrelated libraries and
  scoped APIs exclude the new demo unless membership explicitly includes it.
  Check `npm run studio:doctor -- --live --app <app-id>` and scoped CLI selection.
- Verify the success path and a relevant blocked/failure path, cancellation when
  applicable, tab switching during execution, refresh, saved-run restoration and
  accurate live stats. Verify recorded/illustrative behavior with live services
  stopped and preview blocking with `npm run studio:preview`.
- Check both themes, desktop and narrow layouts, long content, keyboard access,
  focus, accessible labels and status/error text against the reference demo.
- Verify isolated Start/Stop/Restart and saved data after recreation. Keep another
  running package available. Check model and credential changes through Studio.
- Run affected service tests, `npm test`, `npm run typecheck`, `npm run lint` and
  affected browser flows as described in [CONTRIBUTING.md](../CONTRIBUTING.md).
  Use `STUDIO_URL` when Studio uses a different port. Include
  `tests/shell.spec.ts`, `tests/stats.spec.ts` and `tests/planner.spec.ts` when
  changing the shared workspace or measurement mapping.
- When architecture or linked sources change, regenerate with
  `npm run map:drawio` and/or `npm run map:sources`, then run the affected
  architecture checks. Commit the required generated diagram/evidence assets.
- Exercise a real run with the configured model and integrations. Report mocked
  coverage, actual execution and confirmed trace/control delivery separately.
  Use the running development server for the affected workflow and the production
  server for proxy/preview behavior. A startup or health smoke check covers only
  availability. Identify unavailable dependencies directly.
- Review the diff for credentials, workstation paths, private imports and raw
  customer data. Keep local config, saved runs and test artifacts ignored. Retain
  curated synthetic fixtures, lockfiles and upstream notices.

Record the chosen reference, files changed, commands run, results and any remaining
integration dependency in the completion report.
