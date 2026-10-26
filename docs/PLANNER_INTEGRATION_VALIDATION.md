# Planner integration validation

## Production connection

Validated on October 26, 2026 with browser contract v1 and planner bundle 1.0.0.
Studio runs at `http://127.0.0.1:4318` and loads
`https://www.ai-infrastructure-planner.com/embed/1.0.0/planner.js`, with
`https://www.ai-infrastructure-planner.com` as its API base. The production bundle,
infrastructure catalog and GLM 5.3 metadata return HTTP 200. API responses allow
Studio's exact origin. Local planner services were stopped throughout this check.
Only the two planner URLs in ignored root `.env` changed for the connection.

## Confirmed behavior

- The real custom element mounts in Capacity planning, with its CSS and module
  chunks loaded from the versioned artifact directory. Studio has no private
  planner imports or package dependency.
- Studio supplies use-case identity, assessment name and business objective. Each
  new workload uses the use-case name and defaults to `zai-org/GLM-5.3` for planning.
  The user can select another model, and that selection survives remounting.
  Studio's demo model configuration is independent of the planning choice. A
  committed SAR recording supplied 9 calls, 34,783 input tokens and 1,284 output
  tokens with reported provenance. Planning token lengths round sample averages up
  to whole tokens, yielding 3,865 input and 143 output tokens. The original totals
  remain unchanged. Omitted production demand uses the planner's editable defaults.
- Studio section controls open Requirements, Design / BOM, Topology, Racks,
  Costs / TCO and Review without changing the host URL. GLM 5.3 loads and
  calculates. The BOM, on-premises and cloud cost estimates, and deployment review
  are available from the production component.
  Theme changes reach the element; imported evidence meets 4.5:1 contrast in light
  theme. An edited assessment name survives
  removing the element and reopening the use case under the same assessment ID.
- Embedded business-event collection is disabled. The real browser test observed
  no requests to `/api/business-events`.
- All five planner browser checks pass: three use a mocked planner and two use
  the production bundle and API. The production checks cover recorded evidence,
  the planning workflow, themes, editable model selection, draft restoration and
  migration of generated defaults. Typecheck and lint pass. Studio recording data
  supplies the observations; no new demo model run was executed. Sharing, PDF
  delivery and business metrics were outside this check. Nothing was deployed.

## Earlier local validation

On October 25, the same integration passed with the bundle at
`http://localhost:4173` and API at `http://localhost:3101`. Studio's production
build, 235 Node tests, typecheck and lint passed. The private planner's 22 focused
integration tests, typecheck and browser-artifact build passed. Mocked shell,
stats and planner tests covered all ten use cases, run preservation, initialization,
draft isolation and connection/error recovery.

The private planner initializer now names a single imported workload from the
supplied assessment name and rounds imported planning token lengths up to whole
tokens. Its strict initialization contract is unchanged. The embed content sets
its inherited foreground from the active theme, resolving the light-theme evidence
contrast issue. These changes remain in the private planner repository:
`lib/integration/initialize.ts`, `embed/styles.css`, `embed/workspace.tsx`,
`context/InfrastructurePlanContext.tsx`, `infrastructure/planner/plan.ts`,
`tests/planner-embed.test.ts`, and `docs/demo-studio-integration.md`.

Studio's GLM 5.3 default removes the earlier dependency on the lab's Nemotron
metadata lookup. GLM 5.3 and a user-selected Llama 3.2 1B both load successfully
through both the local and production planner APIs. Revision 2 restores older generated names and
untouched model defaults from Studio's current initialization, scoped to matching
assessment and workload IDs. Edited names, selected models and numeric inputs
continue to take precedence. The existing Code vulnerability analysis draft was
reopened: its generated name became the use-case name, while its saved Kimi-K3
selection, 10,066 concurrency and 200,000 input/output token lengths stayed intact.

The open **Current planning inputs** panel shows the active model, concurrency,
token lengths, schedule, GPU and topology. The original import is retained under
the collapsed **Demo observations** section. This avoids presenting a previous
imported model as the current sizing selection.

Screenshots are generated under ignored `artifacts/explorer/` as
`planner-native-dark.png`, `planner-native-light.png`, `planner-native-bom.png`
and `planner-native-tco.png`.
Saved-draft regression screenshots are `planner-restored-defaults.png` and
`planner-restored-name.png`.

## Studio files changed

- Component and data mapping: `app/CapacityPlanning.tsx`,
  `app/planner-integration.ts`, `app/planning-evidence.ts`, `app/RunStats.tsx`.
- Workspace and tabs: `app/page.tsx`, `app/studio-nav.ts`, `app/globals.css`,
  `app/guide/anchors.ts`, `app/guide/types.ts`.
- Local connection: `scripts/studio-planner-api.ts`, `scripts/studio-api.ts`,
  `.env.example`. Ignored root `.env` contains the two production planner URLs.
- Tests: `tests/planner.test.mjs`, `tests/planner.spec.ts`,
  `tests/planner-fixture.ts`, `tests/shell.spec.ts`, `tests/stats.spec.ts`,
  `playwright.config.ts`.
- Documentation: `README.md`, `docs/CONFIGURATION.md`, and this validation report.

## Reproduce

Configure the two production URLs described in
[Studio configuration](CONFIGURATION.md#capacity-planning). Build Studio, then run:

```sh
STUDIO_PORT=4318 npm run start:preview
# In another terminal:
STUDIO_URL=http://127.0.0.1:4318 STUDIO_PLANNER_LIVE=1 npm run test:browser -- tests/planner.spec.ts
```

Without `STUDIO_PLANNER_LIVE=1`, the suite skips the configured planner service checks
and runs the mocked integration tests.
