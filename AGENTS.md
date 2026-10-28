# Repository development

These instructions apply to this repository and its forks. Read [README.md](README.md)
for setup and [CONTRIBUTING.md](CONTRIBUTING.md) for validation and change conventions.
Before adding a use case, follow [Adding a use case](docs/ADDING_USE_CASES.md) for
reference implementations, registration points, UI conventions, and acceptance checks.

## Working in this checkout

- Inspect `git status` before edits. Preserve unrelated changes, saved runs, and local configuration. Keep changes focused on the requested work.
- Use Node 24 (minimum 22.18), npm with `package-lock.json`, and Docker Compose 2.30+. Live demos run in independent container stacks. Optional source development uses uv and each service's `uv.lock`; `.python-version` selects Python 3.12. Keep source environments isolated because SDK versions differ.
- Install Studio with `npm ci`. Use `npm run dev:studio` on port 4200 and start selected stacks in Settings. `npm run studio:install` prebuilds all images sequentially. Closing Studio leaves containers running; Stop preserves data. `npm run studio:preview` disables live demo APIs and container controls.
- Use a descriptive branch. Agent-created branches default to `codex/`. Forks must work with the engineer's own model endpoints, credentials, and tenant resources.
- Keep credentials in ignored root `.env` and local model routes in `.studio/`. Update `.env.example` with credential-free examples when configuration changes. Avoid personal filesystem paths, SSH aliases, and implicit access to another checkout.
- Preserve lockfiles, curated synthetic fixtures, recordings, and upstream license notices. Keep virtual environments, caches, browser output, training data, and model weights out of commits.
- Keep hosted policy registration and infrastructure changes behind explicit commands. Dependency installation and routine tests must not create tenant resources.

## Source map

- `verticals/<app-id>/app.ts`: industry identity, categories, demo membership, and default story. Indexed by `config/apps.ts`; FSI lifecycle content stays under `verticals/fsi/`.
- `demos/<demo-id>/`: canonical demo package. Owns `definition.ts`, `workspace.ts`, narrative, presenter notes, tours, `ui/`, and, for a dedicated live backend, `backend/` with its dependencies/tests and `deploy/` with Dockerfile/Compose.
- `config/demo-contract.ts`, `config/demos.ts`, and `config/use-cases.ts`: public demo contract, definition index, and explicit runtime specifications. Library membership belongs to the industry manifest.
- `app/studio/`: shared platform shell, routes, retained workspaces, app-scoped storage, workspace frames, and explicit lazy workspace registry. `app/page.tsx` is a route wrapper.
- `app/`: shared UI, run components, narrative/presenter indexes, settings, and guides. Demo-specific implementations belong in their packages.
- `app/map/`: shared architecture scenes, layout, catalogs, source evidence, and navigation.
- `services/common/` and `services/llm/`: shared run handling and model routing. `services/wealth/` is the declared shared Research/Advisory engine; `services/interbank/` retains its upstream multi-container implementation.
- Legacy `app/` demo exports, `services/` symlinks, and `use-cases/` Compose forwarding files preserve existing integrations. Edit canonical package files and preserve compatibility paths. New demos need no legacy wrappers.
- `scripts/`: local orchestration, settings/status APIs, doctor checks, and evidence generation.
- `config/`: committed non-secret defaults. `fixtures/`: curated synthetic demo inputs.
- `tests/`: Node tests and Playwright browser flows. Each backend owns its Python tests and lockfile.
- `worker/`, `build/`, `.openai/`, `db/`, and `drizzle/`: vinext/Cloudflare support and storage scaffolding. Preserve build support when cleaning generated output.

## Adding an industry demo

- Read [docs/ADDING_USE_CASES.md](docs/ADDING_USE_CASES.md) and follow its registration map. Establish the target industry, stable demo/runtime IDs, live or illustrative behavior, human decisions, synthetic inputs, and closest reference before implementation.
- Keep domain UI, SDK dependencies, fixtures, Dockerfile, and Compose in `demos/<demo-id>/`. Share model endpoints, integration configuration, and platform controls through the existing contracts. Keep domain-specific dependencies isolated from other backends.
- Register the definition in `config/demos.ts` and membership/category in `verticals/<app-id>/app.ts`. Register package workspace copy, narrative, presenter notes, tour, architecture, and live adapter in their explicit indexes. Asset paths in metadata do not load components or register stories.
- For a new live workspace, extend `WorkspaceKey`, the lazy adapter map, and `UseCaseFrame.liveExperience`. Register `RuntimeSpec` in `config/use-cases.ts`. `useCasePackages`, proxies, service discovery, and `MODEL_USE_CASES` derive from those definitions. The authoring guide lists the remaining readiness, recording, and guide adapters.
- Inherit the shared shell, tabs, model routes, credentials, AI Defense, and observability settings. Implement actual inspection, verdict enforcement, and telemetry in the calling runtime. Declaring `sharedBindings` alone establishes no integration.
- Scope browser state and run references by the owning app and demo through shared navigation/storage/run helpers. A retained workspace can run while another app is visible. Keep FSI company context and lifecycle handoffs within their declared app; new verticals can use `context: null`, `storyId: null`, and an empty `defaultStory`.
- Adding a demo to an existing app uses the generic routes. Adding an industry also requires extending `APP_IDS`, `config/apps.ts`, and app enablement/route tests. Verify enabled-app access, cross-app rejection, and the route `/apps/<app-id>/demos/<demo-id>`.
- Update catalog/count and empty-library test assumptions when populating a vertical. Preserve original identity assertions in `tests/fixtures/fsi-compatibility.json`; add coverage for the new demo. Register new browser filenames in `playwright.config.ts`.

## Implementation and checks

- Route models through shared Studio configuration and `services/llm/studio_models.py`. Keep host configuration and process management in the Node layer, outside browser code and the worker runtime.
- For a live runtime, follow [docs/CONTAINERS.md](docs/CONTAINERS.md). Declare source, Dockerfile, build identity, Compose service, API mapping, environment allowlist, health route, supported shared bindings, optional components, and storage in `config/use-cases.ts`. Match those fields to the package files. Preserve independent lifecycle and persistence, including the adopted `.studio/installation.json` namespace. Keep credentials outside images and retain upstream licenses. Verify both proxies, doctor checks, and preview blocking.
- Keep builds sequential and dependency concurrency bounded. Check free disk before image operations. Never prune saved-data volumes as routine cleanup.
- Add or update meaningful checks for changed behavior. Run `npm test` for the build and Node tests, `npm run typecheck`, `npm run lint`, and affected `npm run <service>:test` commands as appropriate. Shared Python changes use `npm run platform:test`.
- Run affected browser flows against a running Studio with `npm run test:browser -- tests/<flow>.spec.ts`. Install its browser with `npx playwright install chromium`. `CHROME_PATH` and `STUDIO_URL` are optional overrides; avoid workstation-specific defaults.
- Regenerate architecture evidence with `npm run map:sources` when linked source excerpts change. Update each affected service README and audience material when runtime behavior changes.
- Report checks performed and their results. Separate mocked UI tests, configured dependencies, observed live execution, and confirmed integration delivery. Identify remaining blockers directly.

# Writing

- Keep responses and project copy concise and direct.
- Do not use em dashes or negative parallelism such as "not X, but Y."
- Avoid repetitive caveats and defensive prose.
- Do not write paired or stacked slogan sentences and fragments such as "Find the flaw. Review the fix." or "Four use cases. One client journey." Avoid the same rhetorical structure with commas, semicolons, or line breaks.
- Use specific, descriptive headings and natural connected prose across the UI, narratives, walkthroughs, documentation, and responses. Short instructions and status messages should convey useful information without a manufactured slogan rhythm.

# Studio standards

These standards apply to new use cases and changes to existing ones. Inspect an established demo before implementation. Shared components and data models define the default experience.

## Use case experience

- Keep the shared shell, story panel, and `USE_CASE_TABS` order: Use case demo, Architecture, Capacity planning. Render the demo inside the existing workspace. Capacity planning is supplied by the shell and receives observations through shared `RunStats`.
- Reuse `OperatorWorkspace`, `RunStats`, `RunTimeline`, provenance badges, and shared controls where applicable. Extend shared components when a capability belongs across demos.
- Every live agent use case includes the shared Live run stats panel. Update model calls, tool calls, provider tokens, latency, control decisions, and trace delivery during execution. Leave unreported measurements unknown.
- Keep loading, running, completed, blocked, failed, and cancelled states consistent. Support cancellation for long operations and recovery from errors. Preserve run identity, provenance, and measured stats across tab switches, refreshes, and saved-run history without double counting.
- Use supported agent SDKs and shared Studio model routing. Integrate shared settings, health reporting, service management, run events, and guide anchors.
- Report actual integration state and delivery evidence. Identify live execution, recordings, synthetic data, local policy checks, and hosted enforcement accurately.

## Visual design

- Follow the visual contract and CSS tokens in `app/globals.css`. Preserve the ink/navy/slate surfaces, cobalt and violet accents, semantic status colors, typography, spacing, and shared button classes. Avoid cyan, neon styling, and new theme systems.
- Use the shared `--font-meta`, `--font-body`, and `--font-control` sizes for new metadata, body text, and controls. Keep content readable during screen sharing; reflow or scroll long content instead of shrinking it.
- Scope use-case CSS under its component. Dark styles are the source for generated light styles through `scripts/postcss-light-theme.mjs`; add only necessary exceptions to `app/theme-light.css`. Verify both themes.
- Use Lucide icons in application UI and the shared Carbon symbols in architecture diagrams. Keep labels, focus indicators, keyboard behavior, and status text accessible; color alone must not carry meaning.
- Compare the completed demo with its chosen reference at desktop and narrow widths. Preserve the reference's input, result, human-decision, and execution-evidence hierarchy.

## Architecture design

- Use draw.io for every architecture through the shared `DrawioExplorer` and `app/map/drawio/registry.ts`. Each use case has one persistent canvas with native nested, collapsible groups. Reveal business journey, system boundaries, and component detail through in-place expansion.
- Author nested scopes against shared catalogs, stable scene occurrences, and canonical relationships. Compose scopes into a single diagram with `canvas.ts`; preserve the same draw.io model while navigating. Run `npm run map:drawio` to regenerate the local editable `.drawio` assets. Keep the viewer and its license local in `public/vendor/drawio/`.
- Keep surrounding stages visible as compact groups, reflow local neighbours, and pan/zoom smoothly toward the expanded area. Back and Escape collapse one level and restore prior framing. Layer changes and source inspection preserve the camera.
- Keep the main workflow linear as groups expand. Use aligned workflow ports and separate lanes for records, supporting services, replies, and blocked outcomes. Fit expanded bounds with surrounding space instead of forcing a minimum zoom. Source code opens in a resizable right-side drawer; Escape closes it before collapsing architecture detail.
- Every demo exposes Security, Observability, and AI Infrastructure views through the shared layer controls, including from the journey. Each view contains connected components and source or design evidence. Show disabled and unconfigured capabilities explicitly. AI Infrastructure shows current runtime and model placement with proposed Cisco deployment options clearly labelled. Keep node labels short and reuse the shared navigation, source inspector, and themes.
- Give each inference service one canonical endpoint. Connect every model-calling agent, application judge, and structured client to that endpoint through its actual routing path. Reuse cross-scope connections as groups expand and collapse. Keep callers inside their application boundary; use the model symbol for the inference service. Distinct scoring services and proposed endpoints retain their own identities and modes. Verify these relationships against the calling code for every use case.
- Declare every use case's platform paths in `app/map/drawio/platform-connections.ts`. Verify inspection callers, verdict enforcement, instrumented components, exporters, collectors, and destinations against runtime source. Connect AI Defense through the gateway or application client that invokes inspection. Connect telemetry from each instrumented component through its actual export path. Keep Agent Control evaluations in the Security layer with control edges. Attach platform edges to concrete components using cross-scope terminals; collapsed groups summarize those same edges. Add source evidence and regression checks for expanded and collapsed endpoints. Keep disabled integrations and proposed designs explicit.
- Keep typography, semantic colors, node and edge styles, spacing, legends, and labels consistent across use cases. Reuse shared layout and interaction behavior.
- Use the shared component types and IBM Carbon symbols from draw.io's icon catalog. Pair each component icon with its type and a short name; keep explanations in detail panels. Distinguish autonomous agents, invocable tools, AI gateways, model inference/endpoints, and persistent databases through authored identities. Preserve these types across every view and embed icons in editable exports. Keep local SVG assets and license notices in `public/vendor/drawio/carbon/`.
- Place agents, tools, SDKs, application judges, and infrastructure inside their owning boundaries. Distinguish data flow, control flow, telemetry, and deployment placement. Show relevant approval, denial, and stopped outcomes.
- Preserve stable entity and relationship identities across expansion, collapse, layer changes, Back, mode changes, and source inspection. Maintain readable framing and connected, labelled routes.
- Separate implemented behavior from proposed deployment options. Connect implementation claims to verified source evidence and keep diagrams aligned with the running service.

## Story narratives

- Use the shared `DemoNarrative` structure and renderer, including its story panel, deployment options, and reference presentation.
- Follow the established three-part narrative: the stakeholder's need and business stakes; how the workflow changes, including human ownership and relevant Cisco contributions; the operational outcome and benefit to the customer or stakeholder.
- Keep this sequence, level of detail, and presentation consistent across demos. Use descriptive headings specific to each story.
- Explain security, observability, and infrastructure through their contribution to the workflow. Identify proposed capabilities and distinguish intended benefits from measured results.
- Use the shared references structure for applicable obligations and standards, with authoritative sources and specific supporting demo evidence. Keep the audience story, presenter notes, walkthrough, and architecture consistent.

## Completion checks

- For execution or UX changes, verify the affected browser flow, live stats, relevant failure or blocked states, tab switching, and saved-run restoration. Run the checks appropriate to the change.
- Verify real execution and integration delivery when introducing agent or observability features. Report configuration, runtime readiness, and confirmed delivery separately.
- Update architecture views, story narratives, presenter notes, guided tours, and service documentation when runtime behavior changes.
