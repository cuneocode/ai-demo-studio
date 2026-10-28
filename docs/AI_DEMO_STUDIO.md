# AI Demo Studio platform

## Application model

See [validation results](AI_DEMO_STUDIO_QA.md) for browser coverage, observed live
execution, image builds, and planner integration validation.

The installation owns model providers, credentials, shared integration defaults,
and the host operator. Industry apps own catalog membership, categories, optional
business context, and stories. A demo owns its workflow and runtime package.
Healthcare, Manufacturing, Retail, and Public Sector intentionally start with
empty libraries. Add a reviewed workflow with synthetic evidence to populate one.

| Area | Authoritative location |
| --- | --- |
| Industry apps and membership | `verticals/<app>/app.ts`, indexed by `config/apps.ts` |
| FSI lifecycle and handoffs | `verticals/fsi/stories.ts` and `verticals/fsi/tours.ts` |
| Demo metadata | `demos/<demo>/definition.ts`, indexed by `config/demos.ts` |
| Workspace implementation and styles | `demos/<demo>/ui/` |
| Workspace adapter registration | `app/studio/workspaces.tsx` |
| Domain story, presenter notes, tour, workspace copy | Files in `demos/<demo>/` |
| Backend, locked dependencies, tests, recordings | `demos/<demo>/backend/` |
| Dockerfile and Compose package | `demos/<demo>/deploy/` |
| Runtime identity, environment allowlist, bindings and storage | `config/use-cases.ts` |
| Shared browser shell and retained workspace sessions | `app/studio/` |
| Shared Python run handling and model routing | `services/common/`, `services/llm/` |
| Shared architecture rendering and source registration | `app/map/` |

Market Research and Advisor Prep declare the shared `services/wealth` engine and
image. Each has its own adapter, Compose package, port, model route, and data
volume. Interbank's package includes its upstream multi-container Compose
blueprint from `services/interbank`; its PKI, evidence, gateways, policies, and
collectors retain their existing paths and ownership. Illustrative demos have
no backend or Compose stack.

Compatibility exports in `app/`, service directory symlinks, and forwarding
Compose files in `use-cases/` preserve existing imports and source-development
commands. Maintain the canonical package files. Keep compatibility entries until
existing integrations have moved to their canonical paths. Preserve symlinks when
copying the checkout; Git clones retain them on supported development systems.

## URLs and navigation

| URL | Purpose |
| --- | --- |
| `/` or `/apps` | Industry app launcher |
| `/apps/<app>` | App overview |
| `/apps/<app>/library` | App use-case library |
| `/apps/<app>/stories` | App story builder |
| `/apps/<app>/demos/<demo>` | Demo workspace |
| Demo URL with `?tab=architecture` or `?tab=capacity` | Persistent workspace tab |
| `/apps/<app>/settings`, `/controls`, `/telemetry` | Scoped app views |
| `/settings`, `/controls`, `/telemetry` | Shared platform views |

Inside an industry app, the sidebar contains that app's workspace and domain
navigation. Select **All industry apps** at the top of the sidebar to return to
the Studio homepage. The AI Demo Studio logo also opens that homepage. Switch
industries through the app launcher or the homepage cards.

Demo navigation retains mounted execution, forms, and transports. Inactive
workspace DOM is detached to keep guide anchors, tab IDs, and planner elements
unique in the document. Returning restores the same React workspace. Refresh
reconnects journal-backed Fraud, SAR, Research, Advisory, Interbank, and
Vulnerability runs using saved references. Event IDs prevent duplicate events;
ledger IDs retain measured stats. Banking restores its browser conversation;
a backend session reset remains an explicit service response. A page reload
while a synchronous banking reply is pending offers a retry.

Legacy `/?guide=...&step=...&source=...` links resolve to FSI. Existing tour,
demo, model-route, architecture, API, and runtime IDs remain stable.

## Shared settings and app overrides

Edit provider definitions, default model chains, API keys, and integration
credentials in platform settings. App settings show the shared model chain and
allow route/policy overrides for demos in that app. Model routes apply on the
next request. Credential changes require Apply or Restart for selected stacks.

Model saves include the registry revision. App saves use PATCH and merge only
changed routes into the full registry; resetting an override sends null. A stale
revision returns 409 and leaves the file intact. Reload models and reapply the
changes. Platform PUT saves also require a revision. Keys remain write-only.

Host APIs accept a request-local `?app=<id>` scope. Runtime IDs, model-route
patches, recordings, and examples are validated against membership before an
operation is queued. A mixed valid/invalid runtime selection is rejected as a
whole. App Apply sends explicit runtime IDs. Status caches and browser polling
are scoped, and empty apps return no unrelated run prompts or readiness rows.

Set `STUDIO_ENABLED_APPS=fsi,healthcare` in the launching environment or root
`.env` to restrict the enabled catalog. Omission enables all five apps. The host
blocks disabled runtime APIs, including the legacy Wealth alias, recordings,
examples, and lifecycle operations. This is an organizational boundary within a
trusted local installation. Hosted tenant isolation requires deployment access
controls and independent credentials/storage boundaries.

## Preparing presentations

Select runtimes in app or platform Settings and choose **Prepare selected demos**.
Preparation runs sequentially. Healthy managed stacks remain running. Stopped
selected stacks start with their scoped configuration; shared image builds are
reused within the operation. App changes and demo navigation issue no Start,
Stop, Build, or Apply requests. Stop preserves saved data. Hosted policy
registration remains a separate explicit action.

Equivalent CLI selections:

```sh
npm run studio:containers -- prepare --app fsi
npm run studio:containers -- prepare sar research advisory
npm run studio:containers -- status --app healthcare
npm run studio:containers -- build --all
npm run studio:doctor -- --live --app fsi
```

`studio:install` continues to build every enabled runtime sequentially. Use
`--app <id>` to narrow it. The operator checks free disk before image operations
and keeps optional GPU components behind their registered action/profile.

## Upgrade and rollback state

`.studio/installation.json` adopts the previous `fsi-<checkout hash>` namespace.
Keep this ignored file with the installation when moving the checkout so Docker
project and volume names remain unchanged. Its absence on a new clone creates a
new installation namespace. Invalid metadata blocks container operations.

Browser keys use `ai-demo-studio.v1:global:*` for appearance and
`ai-demo-studio.v1:apps:<app>:*` for app state. Existing FSI context, handoffs,
guide preferences/position, planner assessment references, and vulnerability run
references are copied once. Compatible FSI updates are also written to legacy
keys. Migration markers prevent cleared values from being imported again.
Story drafts and run references are scoped by app and demo.

This release adds no model-route IDs or database migrations. Previous model
registries remain compatible. Preserve `.env`, `.studio`, named volumes,
Interbank evidence/PKI, and the checkout namespace during rollback. Compatibility
paths keep existing service commands available.

## Adding an industry demo

Follow [Adding use cases](ADDING_USE_CASES.md), select a reference workflow, and
keep domain content inside its demo package. Register public metadata, its lazy
workspace adapter, optional runtime, model policy, architecture, tours, narrative,
and app membership. Keep public manifests free of secrets, Node APIs, and
executable component imports. Register shared services through the runtime
contract. Domain-specific SDKs and Python dependencies remain isolated.

Run catalog/contract tests, affected backend tests, live browser workflows,
source evidence generation, and production checks. Verify failure and blocked
outcomes, decisions, cancellation, app/tab navigation, refresh restoration,
measured stats, both themes, and narrow widths. Distinguish mocked UI coverage
from real model execution and confirmed integration delivery in validation notes.
