# Repository development

These instructions apply to this repository and its forks. Read [README.md](README.md)
for setup and [CONTRIBUTING.md](CONTRIBUTING.md) for validation and change conventions.

## Working in this checkout

- Inspect `git status` before edits. Preserve unrelated changes, saved runs, and local configuration. Keep changes focused on the requested work.
- Use Node 24 (minimum 22.18), npm with `package-lock.json`, and uv with each service's `uv.lock`. The root `.python-version` selects Python 3.12. Keep Python environments isolated because services pin different SDK versions.
- Install with `npm ci` and `npm run studio:install`. Use `npm run dev:studio` for the integrated runtime on port 4200. `npm run dev` starts the frontend alone; `npm run studio:preview` disables live demo APIs.
- Use a descriptive branch. Agent-created branches default to `codex/`. Forks must work with the engineer's own model endpoints, credentials, and tenant resources.
- Keep credentials in ignored root `.env` and local model routes in `.studio/`. Update `.env.example` with credential-free examples when configuration changes. Avoid personal filesystem paths, SSH aliases, and implicit access to another checkout.
- Preserve lockfiles, curated synthetic fixtures, recordings, and upstream license notices. Keep virtual environments, caches, browser output, training data, and model weights out of commits.
- Keep hosted policy registration and infrastructure changes behind explicit commands. Dependency installation and routine tests must not create tenant resources.

## Source map

- `app/`: Studio UI, shared workspace and run components, stories, settings, and guides.
- `app/map/`: shared architecture scenes, layout, catalogs, source evidence, and navigation.
- `services/`: Python sidecars, interbank Docker lab, `common/` run handling, and `llm/` model routing.
- `scripts/`: local orchestration, settings/status APIs, doctor checks, and evidence generation.
- `config/`: committed non-secret defaults. `fixtures/`: curated synthetic demo inputs.
- `tests/`: Node tests and Playwright browser flows. Each service owns its Python tests.
- `worker/`, `build/`, `.openai/`, `db/`, and `drizzle/`: vinext/Cloudflare support and storage scaffolding. Preserve build support when cleaning generated output.

## Implementation and checks

- Route models through shared Studio configuration and `services/llm/studio_models.py`. Keep host configuration and process management in the Node layer, outside browser code and the worker runtime.
- When adding a service, update install scripts, service management, dev and production proxies, doctor checks, preview API blocking, and setup docs together.
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

- Reuse `OperatorWorkspace`, `RunStats`, `RunTimeline`, provenance badges, and shared controls where applicable. Extend shared components when a capability belongs across demos.
- Every live agent use case includes the shared Live run stats panel. Update model calls, tool calls, provider tokens, latency, control decisions, and trace delivery during execution. Leave unreported measurements unknown.
- Keep loading, running, completed, blocked, failed, and cancelled states consistent. Support cancellation for long operations and recovery from errors. Preserve run identity, provenance, and measured stats across tab switches, refreshes, and saved-run history without double counting.
- Use supported agent SDKs and shared Studio model routing. Integrate shared settings, health reporting, service management, run events, and guide anchors.
- Report actual integration state and delivery evidence. Identify live execution, recordings, synthetic data, local policy checks, and hosted enforcement accurately.

## Architecture design

- Use the shared architecture explorer, scene models, catalogs, layout, and evidence components. Follow the established hierarchy: business journey, system boundaries, then component detail.
- Keep typography, semantic colors, node and edge styles, spacing, legends, and labels consistent across use cases. Reuse shared layout and interaction behavior.
- Place agents, tools, SDKs, application judges, and infrastructure inside their owning boundaries. Distinguish data flow, control flow, telemetry, and deployment placement. Show relevant approval, denial, and stopped outcomes.
- Preserve stable entity and relationship identities across expansion, collapse, Back, platform focus, and source inspection. Maintain readable framing and connected, labelled routes.
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
