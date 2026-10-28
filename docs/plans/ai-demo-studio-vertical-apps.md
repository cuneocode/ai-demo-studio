# AI Demo Studio vertical apps impact analysis and implementation plan

Planning baseline: October 27, 2026.

Delivery model confirmed October 28, 2026: one AI Demo Studio with five vertical
apps and a shared installation.

Architecture clarified October 28, 2026: follow Cisco Cloud Control's common
platform and integrated-product navigation pattern. Vertical apps own their
libraries. Use cases own cohesive application/runtime packages and consume shared
model, AI Defense, and Splunk Agent Observability services. Selected demos remain
ready for back-to-back presentation.

Rebrand the platform as **AI Demo Studio** and introduce **Financial Services
(FSI), Healthcare, Manufacturing, Retail, and Public Sector** as five vertical
apps in the existing application. Each app owns its demo library, categories,
stories, and business context. They share the shell, visual design, settings
infrastructure, run components, architecture viewer, and container operator.

Use one repository, one npm package, one lockfile, and one local installation for
the first release. Implement the change through the dependency-ordered steps
below. Each step defines its code changes, compatibility behavior, risk controls,
and completion checks. Separate vertical deployments are outside this
implementation's scope.

## Product scope and release boundaries

The visual baseline is the current ink/navy/slate design, cobalt and violet
accents, typography, spacing, controls, and dark/light themes. Vertical identity
comes from names, icons, content, and navigation within that design.

| Surface | Proposed behavior |
| --- | --- |
| Studio home at `/` | AI Demo Studio launcher with five vertical app cards, accurate demo counts, and availability labels. |
| Financial Services at `/apps/fsi` | Existing ten catalog entries, current stories, customer context, and runtime behavior. |
| Healthcare at `/apps/healthcare` | A separately curated healthcare library and its own context and stories. |
| Manufacturing at `/apps/manufacturing` | A separately curated manufacturing library and its own context and stories. |
| Retail at `/apps/retail` | A separately curated retail library and its own context and stories. |
| Public Sector at `/apps/public-sector` | A separately curated public sector library and its own context and stories. |
| Demo workspace | Stable URL such as `/apps/fsi/demos/sar-support`, with the existing three tabs and story panel. |
| App switching | Available in the shared header. Show the active vertical separately from company or customer context. |
| Shared configuration | Installation-wide provider credentials and integrations, with relevant demo routes and services shown within each app. |

The restructuring delivers five app libraries and preserves the current FSI
content. New verticals initially have useful empty states and accurate counts.
Authoring additional industry demos is a separate content workstream. Planned
entries remain explicitly illustrative or unavailable until implemented.

The baseline retains the trusted local operator model. Independent deployments,
independent tenant credentials, hosted accounts, authorization, and production
customer data require additional design and delivery scope.

## Common platform experience and ownership

Cisco Cloud Control documents a persistent top navigation bar, an app/product
launcher, shared platform-service access, and common controls across integrated
products. Use that interaction pattern for AI Demo Studio while retaining this
repository's visual tokens and shared components. See the
[Cisco Cloud Control overview](https://www.cisco.com/c/en/us/td/docs/ai/cisco-cloud-control/articles/cisco-cloud-control-overview.html).

The Studio header remains visible across all verticals and demos. It provides
platform home, app switching, platform settings, relevant service readiness, help,
and theme controls. The vertical app supplies its secondary navigation, library,
categories, stories, and business context. Individual use cases open in the shared
workspace with Use case demo, Architecture, and Capacity planning tabs.

Keep platform services and vertical apps distinct in the launcher. Show FSI,
Healthcare, Manufacturing, Retail, and Public Sector as apps. Show Models,
AI Defense, Observability, and Runtime management as shared platform capabilities.
Global views aggregate relevant status; app views filter the same registered
services and evidence. Shared platform health remains visible during app changes.

| Owner | Responsibilities |
| --- | --- |
| AI Demo Studio platform | Persistent shell, app launcher, visual system, shared settings, model routing, integration defaults, runtime orchestration, run contracts, provenance, architecture viewer, guide engine, planner, and preparation of selected demos. |
| Vertical app | Catalog membership, categories, featured use cases, stories, app context, and domain navigation. |
| Use-case package | UI, application/agent code, locked runtime dependencies, Dockerfile/build definition, Compose package, fixtures, tools, tests, human decisions, narrative, tours, and architecture evidence. |
| Shared infrastructure | Configured model endpoints, AI Defense API, Agent Observability tenant/destinations, and explicitly configured optional inference/collector services. |

## Shared services and presentation readiness

Model endpoints, AI Defense, and observability are platform bindings. An individual
demo declares which bindings it consumes and any supported per-demo overrides.
Keep credentials in the existing ignored settings and scoped runtime files.
Use-case packages reference binding names and credential variable names.

| Binding | Shared default | Per-use-case flexibility and constraints |
| --- | --- | --- |
| Models | One configured provider/endpoint registry and ordered default chain. Existing remote or local inference can serve several demos. | Explicit use-case route overrides select another configured provider/model. Declare tool-calling and protocol requirements. Keep the existing egress policy floor. |
| AI Defense | Shared inspection endpoint/region and credentials, supplied through each runtime's integration adapter. | Preserve supported mode settings and mandatory enforcement for protected flows. A demo without inspection support remains explicitly unsupported. |
| Agent Observability | Shared tenant connection and credentials with platform defaults for destinations. | Retain per-demo service/run identity and supported project/stream overrides, including existing Interbank bindings. Preserve current native SDK/export paths. |
| Optional OTLP collector | One configured shared destination where the service supports that export path. | Native Agent Observability export retains its own transport. Declare the actual path in source-backed architecture evidence. |
| Demo data services | Explicit runtime-owned databases, caches, vector stores, workers, and scorers. | Reuse requires an intentional contract. Keep demo state and approvals scoped even when endpoints or images are shared. |

Model selection precedence remains the explicit use-case route followed by the
platform default chain. Keep app-level model defaults out of the initial change.
Different agent SDK versions can use the same endpoint through compatible adapters;
each demo retains its own dependency lockfile.

Sharing a remote API or inference endpoint requires no additional local container.
Where local shared inference or collection is wanted, manage it as an explicit
platform dependency with its own lifecycle. Demo Stop/Restart never stops that
shared dependency. Preserve Interbank's gateway and private network boundaries.
Use the existing host/container endpoint translation unless a declared shared
network is required for an optional local platform service.

Add **Prepare selected demos** to Runtime management. It accepts demo references
across verticals and resolves their runtime/dependency union. It checks shared
endpoints once, verifies required capabilities and available dependencies,
builds missing images, and starts only selected stopped runtimes. Build reuse is
keyed by the declared source/build configuration, including arguments and revision.
Runtime state, volumes, and readiness remain independent when an image is reused.

Keep prepared runtimes running while the presenter changes app or use case.
Navigation performs no build, start, stop, model-host reload, or infrastructure
registration. A failed readiness check identifies the affected dependency and
demo. Reuse the existing bounded build queue and disk checks; expose capacity
limitations for the chosen set. Preparation creates no hosted tenant resources
and runs no demo workflow automatically.

Verify this behavior with at least two existing live demos: prepare both, run the
first, navigate to the second, run it, and inspect operation history. Shared
endpoints and containers retain identity, required traces retain separate demo/run
identities, and navigation causes no infrastructure lifecycle operations.

## Findings in the current repository

The repository has useful shared foundations and several explicit registration
points. The [authoring guide](../ADDING_USE_CASES.md) already describes these
registrations and the common experience contract.

| Area | Current implementation and implication |
| --- | --- |
| Demo inventory | [config/use-cases.ts](../../config/use-cases.ts) registers ten use cases: eight live packages and two illustrative entries. Preserve all ten in FSI. |
| Main application | [app/page.tsx](../../app/page.tsx) is 1,521 lines and owns catalog data, frame data, navigation, search, stories, customer context, the header, and workspace rendering. Extracting these responsibilities is the main frontend dependency. |
| Navigation | Overview, selected demo, and other views currently use React state. Guided tours have query-string links. App and demo routes need a new URL contract. |
| Domain assumptions | Categories, the four-moment client lifecycle, default story items, company briefing access, and the customer switcher are authored for FSI. Each needs an app-owned definition or capability. |
| Branding | [layout.tsx](../../app/layout.tsx), [page.tsx](../../app/page.tsx), [StudioShell.tsx](../../app/StudioShell.tsx), and [StudioSettings.tsx](../../app/StudioSettings.tsx) contain FSI branding. [public/og.png](../../public/og.png) also contains FSI artwork and financial-services copy. |
| Configuration | [studio-env.ts](../../scripts/studio-env.ts) and [studio-models-api.ts](../../scripts/studio-models-api.ts) use one root `.env` and one `.studio/models.json`. Global provider changes affect every app using that provider. Model saves replace the complete model registry. |
| Status and operations | [studio-status-api.ts](../../scripts/studio-status-api.ts) probes the registered services and Interbank. [StudioShell.tsx](../../app/StudioShell.tsx) derives Controls and Telemetry rows from the complete live model catalog. These views need an explicit app scope. |
| Browser state | Theme, sidebar, guide position/preferences, company profile, research notes, advisory briefs, handoffs, planner assessment references, and the vulnerability last-run reference use several FSI storage key formats. |
| Container identity | [studio-services.ts](../../scripts/studio-services.ts) uses `fsi-<checkout path hash>-<runtime id>` for Compose project names. Changing the prefix or checkout path changes ownership and default named-volume identity. |
| Runtime reuse | [research](../../use-cases/research/compose.yaml) and [advisory](../../use-cases/advisory/compose.yaml) share the Wealth image while keeping separate runtime IDs, ports, and volumes. This is an existing pattern for code reuse with independent state. |
| Runtime exceptions | Interbank has a multi-container contract, separate readiness fields, PKI, and bind-mounted evidence. [Banking conversations](../CONTAINERS.md) have a process-local lifetime. Preserve these distinctions. |
| Architecture and evidence | [draw.io registration](../../app/map/drawio/registry.ts), [platform connections](../../app/map/drawio/platform-connections.ts), and [source capture](../../scripts/highlight-evidence.ts) depend on stable IDs, paths, and excerpts. File moves have generated-asset consequences. |
| Offline access | [studio-api.ts](../../scripts/studio-api.ts) serves recordings and synthetic examples through separate allowlists. Runtime registration alone does not register offline evidence. |
| Tests and build | [playwright.config.ts](../../playwright.config.ts) explicitly lists browser specs. Tests include fixed catalogs/counts and the FSI page title. Both [Vite](../../vite.config.ts) and the [production proxy](../../scripts/start-studio.mjs) consume runtime mappings. |

Two existing gaps should be addressed while touching their owning surfaces:

- The Help drawer still describes an older Node/uv/source-service startup flow
  that differs from the current container-based README instructions.
- The architecture source route contains a workstation-specific fallback checkout
  path. Replace it with portable repository discovery when updating source paths.

## Architecture and repository decision

| Organization option | Benefits | Cost and fit |
| --- | --- | --- |
| One shared application with vertical manifests | Consistent UI, one installation, existing runtime reuse, and one shared validation pipeline. | Recommended baseline. Requires clear catalog and context boundaries. |
| Several frontend deployables in one workspace | Separate release schedules, dependencies, and deployment configuration. | Consider when a vertical requires its own distribution or deployment boundary. Adds build, configuration, and release work. |
| A repository or long-lived branch per vertical | Independent ownership and release control. | Duplicates platform fixes and increases visual and behavioral drift. Best reserved for a concrete ownership or distribution requirement. |

Keep the current root application and toolchain. Organize the domain content by
vertical and the demo implementation by stable use-case identity. Extract shared
engines as reusable modules inside this package. Introduce npm workspaces if a
second independently built consumer creates a clear package boundary.

### Proposed repository layout

This is a target layout. Move files incrementally and preserve compatibility
exports until their consumers have migrated.

```text
app/
  layout.tsx                       Shared fonts, styles, theme boot, base metadata
  providers.tsx                    Shared status and active-run coordination
  page.tsx                         AI Demo Studio app launcher
  settings/page.tsx                Installation-wide configuration
  apps/page.tsx                    Launcher during migration, retained alias
  apps/[appId]/
    layout.tsx                     App validation, metadata, shared shell
    page.tsx                       App overview
    library/page.tsx
    stories/page.tsx
    controls/page.tsx
    telemetry/page.tsx
    settings/page.tsx              App demo routes and service controls
    demos/[demoId]/page.tsx         Shared workspace adapter
  studio/                          Shell, app switcher, catalog UI, app scope
  components/                      Shared workspace and input components
  run/                             Shared events, stats, history, provenance
  guide/                           Shared tour engine and anchor contracts
  map/                             Shared draw.io, catalogs, layout, evidence
verticals/
  fsi/{app.ts,stories.ts,README.md}
  healthcare/{app.ts,stories.ts,README.md}
  manufacturing/{app.ts,stories.ts,README.md}
  retail/{app.ts,stories.ts,README.md}
  public-sector/{app.ts,stories.ts,README.md}
demos/
  brahe-bank/
    definition.ts                  Public metadata and component key
    ui/                            Workspace, demo styles, UI adapters
    backend/                       Application source and isolated dependencies
      pyproject.toml
      uv.lock
      tests/
    deploy/
      Dockerfile
      compose.yaml
    fixtures/
    narrative.ts
    presenter-notes.ts
    tours.ts
    architecture/                  Domain definitions and evidence references
  sar-support/...
  ...
config/
  apps.ts                          Pure app manifest index and selectors
  demos.ts                         Pure demo definition index and selectors
  use-cases.ts                     Runtime contract and compatibility adapters
  studio-models.default.json
services/                          Shared common/model code and declared shared engines
use-cases/                         Legacy Compose locations during package migration
fixtures/                          Shared reviewed inputs; demo inputs move by package
public/diagrams/                   Generated assets with stable names
public/vendor/drawio/              Shared local viewer, symbols, and licenses
scripts/                           Host APIs, operator, generators, doctor
tests/                             Shared contract and browser suites
docs/                              Setup, authoring, validation, plans
worker/ build/ .openai/ db/ drizzle/ Existing build and hosting support
```

Keep domain-specific architecture definitions near their demos as they are
extracted; `app/map/` continues to own their shared registration and rendering.
Use cases become cohesive packages through controlled moves after registry and
runtime compatibility work. Declare source, build, and Compose paths in the
package contract. Keep internal container paths, project names, and volume/mount
identities stable while changing repository source paths.

Each package owns a build definition and its locked runtime environment. Shared
build helpers/base layers can reduce duplication. The Studio frontend remains one
build with shared React/UI dependencies. A Node backend or separate upstream app
can keep its own package manifest and lockfile within its package.

Allow explicitly declared shared implementations/images. Market Research and
Advisor Prep can retain their shared Wealth implementation and separate runtime
packages. Preserve an upstream multi-container blueprint through an adapter.
Interbank's package/source migration must leave its existing PKI and evidence
mounts reachable. Avoid creating independent copies of shared implementation code.

### Manifest contracts and dependency direction

| Contract | Owns | Required validation |
| --- | --- | --- |
| App manifest | Stable app ID, display name, icon key, category definitions, ordered catalog memberships, featured demos, story references, optional context capability, availability. | Unique app IDs; every catalog demo exists; categories belong to this app; featured demos and story steps belong to its library. |
| Demo definition | Existing use-case ID, title, summary, mode, workspace component key, narrative, tour/presenter references, architecture ID, model-route metadata, optional runtime ID. | Unique demo IDs; complete rendering/content references; live entries resolve to registered runtimes; illustrative entries retain explicit provenance. |
| Runtime contract | Runtime ID, source/build/Compose paths, service, port, API mapping, model-use-case ID, shared-service bindings, supported overrides, environment allowlist, health route, storage declaration, optional components, control command. | Unique runtime IDs, non-conflicting ports and prefixes, valid model identity, compatible shared bindings, and explicit build/storage/lifecycle ownership. |
| Story definition | Story identity, title, ordered demo references, guide references, valid handoffs. | Every step resolves within the app; each handoff has a supported source, recipient, and data contract. |

App manifests reference demos; demo definitions reference runtime IDs. UI adapters
resolve component keys through explicit lazy imports. Host code resolves runtime
IDs through the runtime registry. Public metadata modules stay free of Node APIs,
credentials, filesystem operations, and React component imports.

Keep one authoritative declaration for each fact. Derive model-setting rows,
status mappings, library cards, and authoring checks from those declarations.
Special health adapters and security checks remain explicit where services differ.
Provide compatibility exports for current `useCasePackages`, `MODEL_USE_CASES`,
and other consumers during extraction.

## Required changes and impact

| Workstream | Required work | Relative impact |
| --- | --- | --- |
| Brand and assets | Centralize product name and descriptions; update header, breadcrumbs, metadata, share image, package name and matching lockfile metadata, current setup docs, and applicable service copy. Preserve historical references and upstream identities. | Low to medium |
| Catalog extraction | Move catalog/frame data from `page.tsx`; introduce app membership and per-app categories; replace explicit list duplication with selectors and validation. | High |
| Shell and routes | Extract the header, sidebar, workspace, overview, and library; add launcher/app switcher; implement app/demo URLs, tabs in URL state, history, refresh, unknown routes, and metadata. Verify nested routes through vinext in development and production. | High |
| Search and navigation | Scope library search, command launcher, shortcuts, featured cards, counts, and next/back actions. The global launcher can find vertical apps; app-level demo results follow catalog membership. | Medium |
| Stories and business context | Move the FSI lifecycle and default sequence into FSI; configure each app's story and optional company/customer context; keep the existing fraud/SAR/advisory handoff rules within FSI. | High |
| Shared configuration | Separate installation-wide settings from app demo overrides; show scope before Apply/Restart; preserve unseen overrides during saves; handle concurrent settings edits. | High |
| Status and lifecycle | Scope service bell, readiness, Controls, Telemetry, recent runs, and Start/Stop/Build/Apply to relevant runtimes. Validate requested IDs on the host. Include optional components and hosted-control actions. | High |
| Browser persistence | Introduce versioned global and per-app keys; migrate current data to FSI; preserve planner assessment references and guide links; isolate context and last-run references. | High |
| Run continuity | Keep active run handles outside transient route components or reconnect by saved run ID. Preserve cancellation, event deduplication, stats, result snapshots, and planner observations. | High |
| Runtime compatibility | Retain API prefixes, ports, use-case/model IDs, Compose ownership, volumes, image reuse, Interbank evidence/PKI, `.env`, and `.studio` locations. Add app-aware CLI selection. | Medium |
| Offline and preview | Associate recordings/examples with demo definitions and app membership; preserve reviewed allowlists and read-only behavior; keep live APIs and lifecycle actions blocked in preview. | Medium |
| Architecture and planning | Retain draw.io IDs and asset URLs; register new demos' platform paths; update source references after moves; preserve all layers, source drawer behavior, and capacity-planning inputs. | Medium to high |
| Demo loading | Load workspace implementations on demand so the launcher and one vertical do not eagerly load every industry's demo code. Keep shared CSS scoped and check chunk-loading failures. | Medium |
| Package ownership and shared services | Cohere each demo's UI/backend/dependencies/build/Compose/assets; declare shared platform bindings; retain existing runtime identities while moving source paths. | High |
| Presentation readiness | Prepare selected demos across apps, resolve shared dependencies once, retain ready runtimes, and verify navigation performs no infrastructure operations. | Medium |
| New vertical content | Select workflows; provide synthetic evidence, domain terminology, human decisions, demo narrative, references, tours, architecture, runtime contracts, and acceptance criteria. | Separate per-demo scope |
| Documentation and validation | Update README, authoring/container/configuration guides, Help, service material, tour registration, fixtures, title/count assertions, browser test selection, and fresh-fork instructions. | Medium |

## Identity and state migration

Separate product branding from operational identity throughout the migration.

- Keep existing demo IDs such as `sar-support`, runtime IDs such as `sar`, and
  their model-routing keys stable. New IDs should be descriptive and independent
  of the product name.
- Preserve current Compose project names. Adopt their existing namespace into
  ignored `.studio/installation.json` before changing operator identity handling.
  Seed it from the current checkout calculation so existing names remain exactly
  the same. Keep the checkout location stable through upgrade/rollback checks.
  Existing image tags remain compatible through the visual rebrand.
- Keep theme, sidebar, and other visual preferences global. Scope company/customer
  context, story drafts, handoffs, guide position, last-run references, and planner
  assessment references by app and demo where applicable.
- Use versioned keys such as `ai-demo-studio.v1:apps:fsi:company-profile`. Import
  legacy FSI values once with a migration marker. Keep legacy values available for
  rollback, temporarily dual-write compatible FSI updates, and ensure clearing a
  migrated value cannot import it again.
- Preserve the planner's existing assessment IDs. Its embedded component owns the
  assessment contents; Studio stores a reference. A new Studio namespace must
  retain that reference to keep the existing draft reachable.
- Handle old `/?guide=<tour>&step=...&source=...` links before rendering the new
  launcher. Resolve the owning app, preserve guide parameters, and open its demo
  or story. Keep current FSI tour IDs and source selection compatible.
- Preserve backend run and trace identities. Add app/demo labels through adapters
  and new metadata without rewriting old journals or recorded events.

Catalog membership permits reuse of the same demo in multiple apps when its
workflow, data, policy, and runtime state are intentionally shared. A different
scenario, independent data, or a different model/security policy requires a new
demo identity and an appropriate runtime/storage boundary. A title override alone
cannot convert the payments vulnerability fixture or banking-focused briefing
prompts into a validated healthcare or public sector demo.

## Configuration and runtime boundaries

Use installation-wide credentials, provider definitions, and integration defaults
for the baseline. Per-demo model routes continue to override the shared default.
Defer app-level model defaults until precedence for a demo in several apps is
specified. Keep hosted-model policy enforcement aligned between TypeScript and
`services/llm/studio_models.py` for every new model-calling use case.

App-level settings should show relevant overrides and runtime operations, with a
clear link to global settings. Scoped saves use server-side patches and revision
conflict checks against the complete registry. The implementation contract is
specified in Step 6 below.

Resolve the app per request and intersect requested demo/runtime IDs with that
app's membership and the installation's enabled apps. Keep the selection local to
the request so two tabs can operate different verticals safely. Scope status
caches by the effective request scope, or filter a canonical snapshot before
responding. Avoid returning unrelated run excerpts and prompts in app responses.

App switching leaves containers and backend runs running. It preserves a handle
for returning to an active run and provides the existing cancellation action.
Banking retains its current process-local conversation lifetime; preserve its
conversation reference during navigation and report a backend reset accurately.
Keep status and active-run coordination above the changing app route. Tab URL
updates must retain mounted demo panels and the existing architecture camera,
source drawer, keyboard behavior, and planner observation state.

Add an explicit `--app <id>` selector for build, doctor, status, and container
operations. Resolve memberships to unique runtime IDs so shared images and demos
do not cause duplicate operations. Keep an explicit all-app operation. Document
the default for `studio:install`, which currently builds every registered runtime.

Catalog scoping is an organization boundary inside one trusted installation.
Separate security or tenant boundaries require independent credentials, process
and storage controls, authorization, and checks on direct backend access. A
deployment restricted to one vertical must enforce its enabled catalog on the
host, proxies, recordings, examples, source access, settings, and lifecycle APIs.

## Risks and prevention

| Priority | Failure mode | Prevention and verification |
| --- | --- | --- |
| High | An existing demo disappears because one registry was missed. | Derive app catalogs from validated definitions; assert FSI retains exactly its current ten IDs and eight live runtime mappings. |
| High | Saved data appears lost after a repository folder or Compose rename. | Adopt the exact existing Compose namespace into local installation metadata; preserve project/volume mappings; verify saved runs after restart and rollback. |
| High | Saving one app's model settings deletes another app's overrides. | Merge scoped changes into the full registry; reject conflicting revisions; test two-app and two-tab saves. |
| High | A handoff, company profile, or planner draft appears in the wrong vertical. | Scope state and events; import old values only into FSI; test switching, fresh tabs, reloads, and clearing migrated values. |
| High | Navigating to another app loses the UI's active run or double-counts stats. | Persist/reconnect run handles; preserve event IDs; test navigation while running, cancellation, completion, and restoration. |
| High | Hidden demos remain executable in a restricted deployment. | Enforce enabled memberships on every host/API entry point; test direct requests, legacy aliases, recordings, and lifecycle actions. |
| High | A new client-data demo inherits permissive hosted-model behavior. | Declare its data policy and enforce it in shared TypeScript/Python routing and the calling service; test unavailable inspection and hosted egress. |
| High | An older build rejects new demo IDs in the model registry during rollback. | Export a registry limited to the previous build's supported routes and validate it with that build; preserve a pre-upgrade snapshot and archive the full newer configuration. |
| High | Five branded apps ship with weak or misleading domain content. | Require a reviewed workflow and acceptance criteria for each delivered demo; keep release labels tied to actual capability. |
| Medium | Healthcare displays FSI lifecycle stories, domain filters, or unrelated Interbank alerts. | Put story/category/context capabilities in app manifests; scope platform summaries and recent runs; test empty libraries. |
| Medium | New URLs break refresh, browser history, guides, or production proxying. | Test direct app/demo URLs, invalid membership, Back/Forward, old guide queries, and both server modes. |
| Medium | Preview accidentally invokes a live API or container action. | Keep shared preview guards ahead of proxies; cover new routes, methods, aliases, and optional components. |
| Medium | File moves invalidate source excerpts, diagram assets, imports, or tour anchors. | Migrate small groups of files; retain adapters; regenerate source/diagram outputs when affected; verify expanded/collapsed platform endpoints. |
| Medium | A shared-runtime stop or credential change interrupts another app. | Show the affected demos/apps before the action; deduplicate runtime selection; keep global scope explicit. |
| Medium | Every vertical's code loads on startup and slows presentations. | Lazy-load demo workspaces; compare launcher and FSI bundle/loading behavior before and after migration. |
| Medium | FSI integration histories become disconnected after telemetry renaming. | Keep current service names, inspection source IDs, hosted policy names, and tenant resources stable; add app metadata separately. |
| Medium | New demo dependencies exhaust disk, conflict on ports, or build together. | Validate unique ports; build selected app runtimes sequentially; retain free-disk checks and independent stop/persistence. |
| Medium | A package rebuilds or stops shared infrastructure when switching demos. | Declare dependency ownership; prepare a deduplicated selected set; keep shared-service lifecycle separate; assert zero infrastructure operations on navigation. |
| Medium | Shared telemetry loses per-demo attribution or a collector is inserted into an unsupported export path. | Preserve native transports and existing destination identities; add app/demo/run labels through verified adapters and test real delivery. |
| Medium | Shared navigation becomes unreadable or inaccessible as labels grow. | Verify both themes, desktop/narrow widths, keyboard access, focus restoration, screen reader labels, and long content. |

## Detailed implementation sequence

Implement Steps 1 through 9 in order. Step 10 finalizes physical file moves after
the new structure works. Step 11 completes integration and release checks. Keep
each change reviewable and add its checks with the behavior it introduces.

### Step 1 Establish the FSI compatibility baseline

Create a credential-free compatibility fixture containing the current ten demo
IDs, runtime/model mappings, API aliases, tour IDs, architecture asset names, and
legacy storage keys. Include the four-moment FSI story and its permitted handoffs.
Record current check results before editing shared code so existing failures have
a known baseline. Preserve the pending draw.io/platform-connection work.

Keep all existing demo IDs, runtime IDs, ports, API prefixes, model-route keys,
hosted policy names, telemetry source IDs, and recorded-run identities. Record
local Compose projects and volume associations without committing workstation
details. Configuration and saved-data backups stay local and ignored.

Completion: the compatibility fixture independently identifies the existing FSI
library and runtime contract. Later steps have assertions that detect accidental
renaming, missing catalog entries, changed handoffs, or disconnected saved data.

### Step 2 Introduce app and demo definitions

Add pure TypeScript contracts and indexes in `config/apps.ts` and
`config/demos.ts`. App manifests live under `verticals/<appId>/app.ts`; each demo
has a definition under `demos/<demoId>/definition.ts`. Keep IDs compatible with
the current runtime registry.

An app manifest declares its ID, name, icon key, categories, ordered catalog
memberships, featured demos, stories, and optional business-context adapter key.
Use catalog entries shaped as `{ demoId, categoryId, featured }` so categories
can differ by vertical without copying demo implementations.

A demo definition declares its identity, descriptive metadata, live/illustrative
mode, component key, narrative/presenter/tour references, architecture identity,
model metadata, and optional runtime ID. UI code resolves components through an
explicit loader map. Node tooling consumes pure metadata and runtime contracts.

Populate the FSI manifest with the exact current ten demos. Create the other four
manifests with empty catalogs initially. Derive counts and availability from
their contents. Preserve compatibility exports for existing model/status/operator
consumers while moving them to the new selectors.

Add `tests/app-catalog.test.mjs` to reject missing demo references, duplicate IDs,
unknown categories, stories outside their app, incomplete required demo assets,
missing live runtimes, and conflicting runtime prefixes/ports. Test the explicit
legacy `/api/wealth` alias as an allowed mapping.

Completion: FSI renders from the new catalog with its existing behavior. The other
apps have valid definitions. An incomplete demo produces a named validation error.

### Step 3 Extract the shared shell and workspace

Split `app/page.tsx` into reusable shell, overview, library, story-builder, and
workspace modules under `app/studio/`. Keep the current CSS classes, tokens,
layout hierarchy, shared controls, guide anchors, and tab ordering.

Make the shell consume an app definition and a scoped catalog. Move FSI category
labels, lifecycle defaults, hero story, and customer/company context out of the
shared shell. Resolve business context through the app's adapter. An app without
context or a default story omits those controls and receives a useful empty state.

Keep demo rendering behind the loader map. Share the existing `OperatorWorkspace`,
RunStats, timeline, provenance, story renderer, draw.io explorer, and planner.
Load demo code on demand. Loading or chunk failures offer a retry and retain the
current app selection.

Completion: existing FSI shell, header, guide, stats, and planner flows still work.
Both themes and narrow layouts retain the current hierarchy. The launcher and an
empty vertical do not mount FSI demo workspaces or initiate demo API requests.

### Step 4 Add branding and URL navigation

Add a product metadata module for AI Demo Studio. Update the header, breadcrumbs,
page titles, descriptions, share artwork, package/lockfile display metadata, and
current setup material. Preserve FSI terminology within its demos and stories.

Make `/` the five-app launcher. Introduce `/apps/<appId>` and its library, stories,
Controls, Telemetry, and app settings routes. Demo routes use
`/apps/<appId>/demos/<demoId>?tab=demo|architecture|capacity`.
During implementation, expose the launcher at `/apps` and keep `/` on the FSI
compatibility entry. Cut over the root only after the state, settings, scope, and
runtime gates pass. Both entries use the same extracted components.

Resolve the URL to a validated app/demo before rendering. Unknown apps/demos and
invalid membership return an explicit unavailable/not-found view. Keep the tab
component identity stable when the query changes so panels and the architecture
camera remain mounted. Browser Back/Forward restores the matching app, view, and
tab. Focus and scroll restoration follow the existing workspace behavior.

Handle legacy `/?guide=` URLs before the launcher. Map current tour IDs to FSI,
preserve `step` and `source`, then let the guide engine resume normally. Navigation
requested by a demo resolves within its active app; a destination in another app
requires an explicit app destination. Search results follow the same membership
rules. The app switcher remains separate from the company-context switcher.
The URL owns the active app in each browser tab. A last-used-app preference may
offer a shortcut; storage events never change another tab's selected app. Save
and end the current guided overlay when changing apps, keeping its resume position
inside the originating app.

Completion: direct entry, reload, Back/Forward, old guide links, invalid routes,
and keyboard navigation pass in development and the production local server.
App switching alone starts no containers and executes no demo.

### Step 5 Migrate browser state and preserve active runs

Introduce a shared storage adapter with versioned key construction and separate
global, app, and app/demo scopes. Global scope owns theme, sidebar, narrative
preference, and guide display preferences. App scope owns company/customer context,
story drafts, and handoffs. App/demo scope owns last-run references, planner
assessment references, and view state. Preserve each value's current localStorage
or sessionStorage lifetime; guide resume retains its expiry.

For legacy FSI keys, validate and copy a value only when no new value or migration
marker exists. Write the marker only after a successful copy. Keep the legacy
value for rollback. A cleared value retains migration state so it stays cleared.
Corrupt or unavailable browser storage falls back safely to session memory.
Storage events and custom events include app scope so other verticals do not
consume FSI updates.
During the compatibility period, dual-write schema-compatible FSI context and
preference changes to their legacy keys. Clear both values together while retaining
the migration marker. New verticals never write those legacy FSI keys. Theme boot
reads the new global preference with a legacy fallback before first paint.

Place status and active-run coordination in `app/providers.tsx`, above changing
app routes. Track a run by runtime ID and run ID, with app/demo associations.
Persist only the reference, mode, and provenance needed to reconnect. Backend
journals remain the source for events, results, and completed measurements.

Switching apps leaves the job running. Returning reattaches to it. Deduplicate
events by their stable IDs and publish each measured observation once. Preserve
unknown measurements. Cancellation requires the demo's actual cancel action;
route cleanup stops subscriptions without issuing a job cancellation. Keep
recorded/replay state separate from a live run and preserve replay position.
Inventory each demo's transport and adapt the vulnerability poller, Banking
conversation, briefing request/upload,
and shared event-based runs explicitly. In-flight transport ownership stays in
the session adapter during navigation. Reattachment never repeats a start,
approval, upload, or other consequential request.

Keep draft text and selections with their app/demo session. Browser file objects
can remain in session memory during navigation; a page reload requests file
reselection unless the service already supplies a saved upload reference. Pending
human decisions restore their waiting state and require the person's action.

Keep the current Banking conversation reference and transcript in its session
adapter during navigation. If its backend process resets, show that reset and
offer a new conversation. Preserve existing planner assessment IDs so the
embedded planner can restore its own draft.

Add state-migration and active-run coverage for copy-once behavior, corrupt/full
storage, clear-without-reimport, multiple tabs, two verticals, mid-run switching,
refresh, cancellation, replay, stats deduplication, and planner draft continuity.

Completion: an FSI investigation can start, leave for another app, return with the
same run identity, and finish with consistent results and stats. Its context and
last-run reference never appear in a different vertical.

### Step 6 Make settings updates preserve the whole installation

Keep global provider definitions, credentials, and integration defaults in the
existing files. App settings show relevant per-demo routes and services, with a
link to installation-wide settings. Avoid introducing app-level model defaults;
existing per-demo overrides continue to take precedence over the global chain.

Add the scoped model-route mutation `PATCH /api/studio/models`, carrying
`appId`, the last-read registry revision, and only changed per-demo overrides.
Validate app membership and provider references, load the complete registry,
compare revisions, merge changes, validate the complete result, and atomically
replace the file. Explicit reset removes only the requested override. Preserve
known overrides for disabled apps on disk.

Serialize updates per settings file. A stale revision returns a conflict without
writing; the UI retains the user's draft for reload/reconciliation. Global
provider/default-chain saves also check the revision. Successful writes refresh
the container model mirror and invalidate affected health/readiness snapshots.
Credential writes retain the existing named set/clear behavior and write-only
secret handling.

Separate `Apply to this app's running services` from the installation-wide action.
Resolve and display the affected runtimes before the operator clicks. Shared
provider changes identify the apps/demos using that provider.

Completion: concurrent FSI and Healthcare edits cannot silently replace each
other. Saving one route preserves other apps' providers and overrides. Updating a
credential starts no stopped stack and leaves credential values server-side.
Older builds reject model overrides for unknown new demo IDs. Preserve a
pre-upgrade compatible registry snapshot. Add a rollback export that retains
current providers/defaults and the previous build's supported FSI overrides, then
validate that export with the previous build. Archive the complete newer registry
separately so new vertical settings remain recoverable. Use the pre-upgrade
snapshot if the compatible export fails validation.

### Step 7 Apply app scope consistently to host APIs and status

Create one host scope resolver that returns the selected app's valid demos,
unique runtimes, tours, recordings/examples, and source references. Accept explicit
`appId` on scoped Studio reads and mutations. Validate every requested runtime
before queuing any work. Empty or invalid scope never expands to all runtimes.

Retain existing demo API prefixes. Validate their runtime against the
installation's enabled catalog in both proxies. Legacy requests resolve through
their existing canonical mapping. If a restricted installation is introduced, its
enabled-app filter applies to both current and legacy entry points.

Use the scope resolver for readiness, service bell, Controls, Telemetry, recent
runs, Logs, Build, Start, Stop, Restart, Apply, optional components, and explicit
hosted-control registration. Cache scoped responses by scope and configuration
revision. Run platform-wide summaries through an explicit global scope. Keep one
shared status subscription per effective scope in the frontend.

Associate offline recordings and examples with demo metadata while retaining the
filesystem allowlists. Check source IDs against the active demo's declared
evidence. Preview denial executes before proxy forwarding; app context cannot
bypass the existing live-API and lifecycle blocks.

Add `tests/app-scope.test.mjs` for out-of-app mutations, invalid IDs, aliases,
recordings/examples/source access, preview methods, scoped cache results, and
rejected requests that queue no partial work. Keep the local trusted-operator
boundary explicit; app scope supplies catalog organization and operation scope.

Completion: Healthcare receives its own status and actions. An unrelated FSI
service being stopped creates no Healthcare readiness warning. Requests cannot
expand a scoped operation into an installation-wide action.

### Step 8 Stabilize runtime ownership and add app-aware commands

Add local installation metadata under ignored `.studio/installation.json`. On
the first managed operation, adopt the exact namespace produced by the legacy
`fsi-<checkout hash>` calculation. All project names therefore remain unchanged.
Read the persisted namespace for later operations. Keep read-only status/doctor
behavior able to calculate and verify the legacy mapping before adoption.

Check existing Compose labels and project/volume associations before adoption.
Conflicting ownership produces an actionable doctor failure. A fresh checkout
creates its own namespace; copying installation metadata into a distinct checkout
must be detected before operating on another checkout's projects. Store the known
checkout binding with the namespace in ignored installation metadata. A changed
binding requires an explicit verified adoption or fresh-install choice. Preserve image
tags, ports, mounts, runtime directories, and Interbank PKI/evidence locations.

Add `--app <id>` to container build/status/operations and doctor. Resolve catalog
membership into a unique runtime set. Keep `studio:install`'s existing all-runtime
default for compatibility and provide explicit app and all-app selectors. App
selection builds the required packages; no new always-on container is introduced
for a vertical's shell. Preserve sequential builds, disk checks, redacted logs,
optional components, and explicit hosted-control setup.

Completion: the same projects and saved runs remain visible after the upgrade and
restart. App-scoped operations affect only the resolved runtimes. Stop preserves
volumes, and another app's running stack remains available.

### Step 9 Prove package ownership and shared runtime reuse

Use SAR as the first cohesive-package migration. Move its UI, backend dependency
files, source, build/Compose definitions, tests, and demo assets through declared
paths. Preserve the runtime ID, API, model route, container paths, volumes, saved
runs, and actual model/security/telemetry adapters. Keep all three shared tabs.

Declare its platform bindings and verify the existing model/AI Defense/observability
configuration can serve it together with another existing demo. Implement Prepare
selected demos and inspect its selected runtime/dependency set before execution.

Test the shared-image case with Market Research and Advisor Prep, then the
multi-container case with Interbank. Shared image reuse must retain separate
state. Interbank must retain its security boundaries and actual export paths.
New industry workflows are follow-on content work and do not gate restructuring.

Completion: existing demos run back-to-back through common endpoints and platform
configuration, preserve independent state, and require no infrastructure lifecycle
action on app/demo navigation. Package registration validates every dependency.

### Step 10 Complete file organization and authoring checks

Apply the proven package migration to the remaining FSI demos in small batches.
Move UI, backend source/dependency manifests, deployment definitions, fixtures,
narrative, presenter notes, and tours into each `demos/<id>/` package as applicable.
Update declared paths and direct imports; retain compatibility adapters until
consumers migrate. Keep shared engines in `app/run/`, `app/guide/`, and `app/map/`.
Retain explicit shared backend implementations where several demos reuse them.

For each source/deployment move, update Docker build contexts, COPY paths, entry
points, test commands, fixture lookup, and relative Compose paths. Keep container
filesystem paths and existing named-volume identities stable. Verify Compose
labels and source-path ownership through the migration adapter before operating.
Retain existing bind-mounted evidence/PKI paths until their migration is verified.
Update the recording/example allowlists for moved curated assets. Extend the
service-specific `.gitignore` rules to the new package locations and verify the
existing recursive `.dockerignore` rules still exclude credentials, environments,
caches, runtime state, and generated telemetry. Preserve committed synthetic
fixtures, reviewed recordings, lockfiles, and upstream notices.

Update architecture evidence paths/ranges after source moves and regenerate the
affected captures and diagrams. Preserve asset URLs, entity/relationship IDs,
collapsible scopes, platform connections, source drawer behavior, and licenses.
Replace the workstation-specific source fallback with portable discovery.

Update the authoring guide with exact app/demo/runtime registration steps. Have
validation name any missing narrative, tour, presenter note, architecture/platform
contract, model metadata, offline evidence registration, or browser coverage.
Register new browser suites in `playwright.config.ts`.

Completion: every moved demo remains reachable through the same stable identity,
its source drawer opens valid evidence, and a contributor can add a demo without
editing central shell rendering branches.

### Step 11 Verify the complete migration and release

Run the shared build, Node, type, and lint checks, affected browser suites, and
affected Python/platform checks. Exercise development, production local server,
and recording preview. Verify both themes, narrow/desktop layouts, and keyboard
behavior. Fix new failures against the Step 1 baseline.

Rehearse an upgrade with existing FSI browser state, model overrides, saved runs,
and managed containers. Verify all ten catalog entries, the FSI lifecycle,
approvals/handoffs, live stats, architecture layers, planner references, and
independent runtime restart/persistence. Verify app switching during execution.

Rehearse rollback on the same origin and checkout using preserved local config,
legacy browser values, and unchanged runtime data. Retain compatibility readers,
aliases, and exports until these checks pass. Keep later runtime renames and
destructive storage changes separate.
Retain the FSI compatibility entry as a navigation fallback. For a full code
rollback, use the validated compatible registry export or the pre-upgrade
snapshot and keep the complete newer registry archived. Verify FSI browser updates
and saved runs remain available, and keep newer vertical data for forward recovery. After
these gates pass, switch `/` to the launcher and retain `/apps` as an alias.

Run the back-to-back presentation check with prepared existing demos. Confirm
shared endpoint identity, per-demo model override behavior, actual inspection and
trace attribution, and zero build/start/stop operations during navigation. Verify
that stopping a demo leaves its shared dependencies and another prepared demo
available. Keep absent or unsupported integrations accurately labelled.

Completion: the migration preserves current FSI behavior, all five app libraries
work, and existing demos have cohesive package ownership and verified shared-service
bindings. Back-to-back presentation reuses prepared runtimes and endpoints. New
vertical libraries accurately reflect their currently available content.

## New vertical demo delivery

These are candidate follow-on workflows for populating new vertical libraries.
Select their detailed scope and acceptance examples during separate demo authoring.
They are outside the platform restructuring's required implementation.

| Vertical | Initial workflow | Input and agent work | Human decision and integration boundary |
| --- | --- | --- | --- |
| Healthcare | Referral coordination review | Synthetic referral packet and intake checklist; extract evidence, identify missing administrative information, and draft a coordination handoff. | Coordinator reviews the handoff; no EHR write or clinical decision. |
| Manufacturing | Maintenance exception review | Synthetic equipment readings, maintenance history, and manuals; identify an exception and prepare a cited work-order recommendation. | Supervisor reviews the draft; no equipment control or live maintenance-system write. |
| Retail | Inventory exception review | Synthetic stock, sales, and supplier records; investigate a discrepancy and prepare replenishment options. | Planner approves a draft recommendation; no purchase order is submitted. |
| Public Sector | Procurement packet review | Synthetic solicitation, supplier documents, and a review checklist; cite missing evidence and prepare a review summary. | Procurement reviewer owns the outcome; no award, publication, or external submission. |

For each selected demo, specify the stakeholder, business outcome, starting data,
agent/tool actions, human decisions, failure states, required integrations,
security/data-egress policy, and measurable runtime behavior. Supply reviewed
synthetic inputs and a domain-specific narrative. Confirm applicable references
and obligations with the content owner before external use.

Deliver each demo through the shared workspace, RunStats, three tabs, draw.io
layers/platform paths, model routing, readiness, independent Compose lifecycle
where live, tour, presenter notes, service documentation, and relevant tests.
Reviewed recordings are explicit deliverables when offline replay is promised.

Trial the authoring model with the first non-FSI demo before committing the rest
of the backlog. Its integration should reveal missing contracts without forcing
changes into every existing demo.

## Validation and rollout

Add meaningful contract coverage for manifest integrity, app/demo membership,
runtime selection, unavailable content, route parsing, state migrations, legacy
guide links, settings merge/conflict behavior, and restricted-deployment API
requests. Extend the explicit browser spec list for any new suites.

Run `npm test`, `npm run typecheck`, and `npm run lint` for implementation changes.
Run affected service tests and `npm run platform:test` when shared Python routing
or run handling changes. Regenerate architecture artifacts with
`npm run map:drawio` and source excerpts with `npm run map:sources` when their
definitions or referenced source paths/excerpts change.

Browser coverage should include the app launcher/switcher, shell, header,
settings, models, containers, stats, planner, lifecycle, guides, architecture, and
affected demo flows. Exercise both themes and desktop/narrow layouts. Cover
empty and unavailable apps, direct URLs, Back/Forward, refresh, active runs during
switching, blocked/failure/cancelled states, saved-run restoration, and preview.

Verify a real FSI run through the configured model and integrations after the
shared migration. Exercise Start/Stop/Restart and persistence while another stack
remains available. Report mocked UI coverage, runtime readiness, actual execution,
and confirmed trace/control delivery separately. Record unavailable dependencies
against their affected acceptance gates.

Release through an upgrade rehearsal in the existing checkout location. Preserve
the ignored local configuration, browser state on its existing origin, and saved
data. Keep legacy API aliases, tour IDs, storage bridges, and registry adapters
through the compatibility period. Rehearse the FSI navigation fallback and the
full code rollback with its compatible configuration export or snapshot. Defer
destructive schema migrations and runtime renames to separately scoped changes.

## Separate deployment expansion

If each vertical later needs its own deployed app, reuse the manifests and demo
definitions. Add a deployment profile that selects enabled apps and their runtime
dependencies, then apply the selection consistently across routes, APIs, assets,
recordings, examples, sources, settings, doctor, installation, and tests.

Size this work separately for host/API authentication, authorization, credential
and tenant separation, storage namespaces, ports/origins, upload controls,
telemetry destinations, packaging, CI/release pipelines, and operational support.
Several installations on one machine also require a port allocation strategy and
explicitly separate operator configuration and Compose ownership. Frontend
workspaces become useful if these apps gain independent dependencies or releases.

## Scope decisions to carry into implementation

| Decision | Planning baseline | Effect of changing it |
| --- | --- | --- |
| Meaning of vertical app | Confirmed October 28: five vertical apps with separate routes, libraries, content, and context inside one shared AI Demo Studio installation. | Separate deployments require a later scope decision. |
| Configuration ownership | Global providers/credentials and integration defaults; per-demo routes. | Per-vertical tenants need credential resolution and runtime isolation work. |
| Catalog launch target | Deliver platform restructuring, migrate existing FSI packages, and establish four correctly labelled new app libraries. Additional industry demo authoring follows separately. | A simultaneous populated launch adds selected domain demos to the release dependency chain. |
| Shared demo reuse | Explicit memberships only after domain/content review; shared state is intentional. | Independent workflows or policies require their own identities and storage boundary. |
| Repository rename | Adopt the existing Compose namespace; retain checkout location through upgrade/rollback checks. | A later move retains namespace metadata and requires ownership checks, port checks, and renewed rollback validation. |
| Release ownership | One platform release with vertical content owners. | Independent release schedules can justify frontend workspace packages later. |
