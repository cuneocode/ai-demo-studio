# Adding a use case

Read [AGENTS.md](../AGENTS.md), [README.md](../README.md), and
[CONTRIBUTING.md](../CONTRIBUTING.md) first. This guide applies to forks and agents
working from a fresh checkout. The current application uses several explicit
registries; adding a runtime entry alone does not complete a use case.

## Choose a reference

Inspect a reference's component, service, story, architecture and browser tests
before implementing. Reuse its shared structures and adapt the business workflow.

| Workflow | Reference implementation | What to follow |
| --- | --- | --- |
| Case review with source records, findings and human decisions | [SAR UI](../app/SarInvestigation.tsx), [service](../services/sar/server.py), [browser flow](../tests/sar.spec.ts) | `OperatorWorkspace`, source inputs, background run events, approvals, stats and recorded fallback |
| Conversational assistant | [Banking UI](../app/BankingDemo.tsx), [service](../services/banking/server.py), [browser flow](../tests/banking.spec.ts) | Embedded chat, session handling, tool evidence, control verdicts and measured turn stats |
| Agents across service boundaries | [Interbank UI](../app/InterbankDemo.tsx), [service guide](../services/interbank/README.md), [browser flow](../tests/interbank.spec.ts) | A multi-container package, A2A timeline, shared trace identity and gateway boundaries |

Use the smallest suitable reference. A new demo may use its own agent framework
and supporting services while following Studio's UI and runtime contracts.

## Define identity and behavior

Choose a stable kebab-case use-case ID and a separate runtime ID when needed.
For example, SAR uses `sar-support` as its use-case/model-route ID and `sar` as
its runtime ID. Use the same use-case identity in the library, narrative,
architecture, presenter notes, tour and model settings. Use the runtime identity
for Compose operations, API routing and service storage. Keep IDs stable after
release because saved runs, tours and planner drafts depend on them.

Write down the intended user, starting evidence, agent actions, human decisions,
result, external integrations and data provenance. Choose `live` or `illustrative`
in the package contract. An illustrative use case keeps its planned status and
uses explicitly labelled sample outputs. A live use case reports missing runtime
dependencies and offers a labelled recording only when one exists.

## Register the use case

These are the current authoring points. Inspect the named structures before
editing; several registrations are derived automatically from them.

| Area | Files and required change |
| --- | --- |
| Runtime package | [config/use-cases.ts](../config/use-cases.ts): add the package and, for a live demo, its `RuntimeSpec`. Include Compose file, service, unique loopback port, API prefix, upstream prefix, health path, `modelUseCase`, environment allowlist, storage through Compose, optional profiles and control command where applicable. Follow [CONTAINERS.md](CONTAINERS.md). |
| Library and workspace | [app/page.tsx](../app/page.tsx): add `useCaseCatalog` and `useCaseFrames` entries. For a new live experience, extend `UseCaseFrame.liveExperience`, import the component and add its rendering branch inside `UseCaseWorkspace`'s existing tab panel. |
| Model routes | [app/studio-models.ts](../app/studio-models.ts): add `MODEL_USE_CASES` metadata with the stable use-case ID. Call the shared routing library from every model caller, including judges and structured clients. For client-data workflows, align `clientData` with `CLIENT_DATA_POLICY` in [services/llm/studio_models.py](../services/llm/studio_models.py) and the policy defaults in [config/studio-models.default.json](../config/studio-models.default.json). Keep local provider choices in ignored `.studio/models.json`. |
| Settings and readiness | [app/studio-settings.ts](../app/studio-settings.ts): add the readiness entry and any supported setting fields. Allow new environment variables in the runtime contract and add credential-free examples to [.env.example](../.env.example). [studio-status-api.ts](../scripts/studio-status-api.ts) consumes registered runtimes; use its existing health fields or extend its adapter if the upstream health format differs. |
| Audience story | [app/demo-narratives.ts](../app/demo-narratives.ts): add the narrative using `DemoNarrative`. Keep the stakeholder need, workflow change with human ownership, and operational outcome in that sequence. Include relevant Cisco contributions, proposed deployment options and evidence-backed references. |
| Architecture | [app/map/catalog.ts](../app/map/catalog.ts), the reference's scene definitions and [app/architecture-zoom.ts](../app/architecture-zoom.ts) where applicable: author the journey and nested system detail. [drawio/registry.ts](../app/map/drawio/registry.ts) derives diagrams from catalogs. Follow [ARCHITECTURE_MAPS.md](../ARCHITECTURE_MAPS.md) for scope templates, layers, source evidence and generated assets. |
| Presenter guidance | [app/presenter-notes.ts](../app/presenter-notes.ts): add the problem, AI workflow, Cisco contribution and applicable handoffs. Keep claims aligned with the narrative and actual runtime. |
| Guided tour | Add a tour under [app/guide/tours/](../app/guide/tours/), register it in [index.ts](../app/guide/tours/index.ts), and declare anchors in [anchors.ts](../app/guide/anchors.ts). Extend service IDs in [types.ts](../app/guide/types.ts) and action/condition handling only when needed. |
| Offline evidence | When adding reviewed recordings or preview source inputs, register their explicit directories/paths in `RECORDINGS` and `EXAMPLES` in [scripts/studio-api.ts](../scripts/studio-api.ts). Keep recorded provenance and serve only curated synthetic files. Verify access with the live stack stopped. |
| Verification and setup | Add the service README and meaningful service/browser checks. Add npm scripts when required, register the browser spec in [playwright.config.ts](../playwright.config.ts), and update explicit catalog/count expectations in affected tests. Update the root README's demo table. |

The runtime registry already drives the operator, service discovery and both API
proxies. Verify the derived behavior before adding special-case routing. Shared
UI types and test fixtures still contain explicit lists that may need extending.

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
  selectors in a use-case stylesheet.
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

- Confirm matching IDs, catalog entries, readiness, model routing, story, tour
  and architecture. Confirm all three shared tabs and all three architecture
  layers work for the new use case.
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
  Identify unavailable dependencies directly.
- Review the diff for credentials, workstation paths, private imports and raw
  customer data. Keep local config, saved runs and test artifacts ignored. Retain
  curated synthetic fixtures, lockfiles and upstream notices.

Record the chosen reference, files changed, commands run, results and any remaining
integration dependency in the completion report.
