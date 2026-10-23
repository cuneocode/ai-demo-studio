# Contributing to the Demo Studio

Read [AGENTS.md](AGENTS.md) and follow the [README setup](README.md). Use a branch
such as `codex/document-setup` for agent changes and a descriptive branch for other
work. Forks use their own credentials, model endpoints, and integration tenants.

## Development workflow

1. Check `git status` and preserve existing work. Inspect an established demo
   before changing or adding a workflow.
2. Install with `npm ci` and `npm run studio:install`. Commit `package-lock.json`
   and affected service `uv.lock` files when dependencies change. Keep service
   environments separate because SDK versions differ.
3. Run `npm run dev:studio`. For frontend work using manually started sidecars,
   `npm run dev` starts only the frontend. Use `npm run studio:preview` to inspect
   recordings without live dependencies.
4. Reuse shared workspaces, live stats, run events, model routing, narratives,
   architecture scenes, and guide anchors. Describe runtime changes in the relevant
   service guide and audience materials.
5. Run the checks relevant to the change and include commands and results in the
   change description. Identify mocked browser coverage and actual live execution.

## Validation commands

| Command | Coverage |
| --- | --- |
| `npm test` | Production build and all Node `.test.mjs` tests |
| `npm run test:unit` | Node tests only; build first when rendered HTML coverage needs `dist/server/index.js` |
| `npm run typecheck` | TypeScript checking without emitting JavaScript |
| `npm run lint` | ESLint across the repo |
| `npm run <service>:test` | Python tests for banking, fraud, briefing, wealth, SAR, or vulnerability |
| `npm run platform:test` | Shared Python run handling and model routing, using the wealth environment |
| `npm run map:drawio` | Regenerate editable draw.io architecture diagrams from the shared page definitions |
| `npm run map:sources` | Regenerate highlighted architecture source evidence after source changes |
| `npm run studio:doctor -- --live` | Check Node, npm dependencies, uv, and the six supported Python environments |

Run browser tests against a running Studio in a second terminal:

```sh
npx playwright install chromium
npm run test:browser
# Select a specific flow:
npm run test:browser -- tests/settings.spec.ts
```

The default browser is Playwright's bundled Chromium. Set `CHROME_PATH` only to use
a different executable. Set `STUDIO_URL` if the server uses another origin:

```sh
STUDIO_URL=http://127.0.0.1:4300 npm run test:browser -- tests/shell.spec.ts
```

The suite does not start the Studio automatically. Many demo tests intercept API
responses for repeatable UI coverage. A browser pass alone does not establish live
model execution, policy enforcement, or trace delivery. For runtime changes, also
exercise the real demo, cancellation or failure, tab switching, and saved runs.
Record missing credentials or unavailable services in your validation results.

Interbank's Python tests use a separate environment:

```sh
cd services/interbank
uv sync --frozen
uv run --frozen pytest tests -q
```

`interbank:verify -- <run-id>` checks the exported trace of a real lab investigation.
It requires a running, configured lab and access to Agent Observability.

See [setup verification](docs/SETUP_VERIFICATION.md) for the tested environment
and current checkout failures.

## Adding or changing a demo

Register a live Python service with the host service manager and proxies in
`scripts/studio-services.ts`, `scripts/start-studio.mjs`, and `vite.config.ts`.
Update install scripts, doctor checks, preview API blocking, and the README's demo
table when service availability changes. Preview must disable every live API.

Use `services/llm/studio_models.py` and the Studio model settings for model routing.
Keep lifecycle and persisted run behavior aligned with `services/common/runs.py`
and existing demos. Wire health reporting into `/api/studio/status` and retain
measured provenance across refreshes. Use the existing story, architecture, guide,
and presenter-note structures. See [ARCHITECTURE_MAPS.md](ARCHITECTURE_MAPS.md).

Each service guide should state its port, prerequisites, root configuration,
startup and shutdown commands, health check, policy setup, fallback behavior,
storage, and tests. Update that guide when behavior changes.

## Configuration and generated files

Keep credentials in ignored `.env` files and local provider choices in `.studio/`.
Change `.env.example` when adding a user-facing setting and use empty credentials
or commented examples. Leave shared defaults usable by a fresh fork.

Keep virtual environments, build output, browser artifacts, telemetry captures,
model weights, raw training data, and transient caches out of commits. Preserve
curated synthetic fixtures and recordings used by the UI. Review recordings for
credentials and customer information before adding new ones.

Do not register policies, deploy infrastructure, or change hosted tenant resources
as a side effect of dependency installation or routine tests. Those operations
belong in explicit commands documented by the relevant service.

Retain upstream notices and pinned source revisions. The repository owner controls
the root license decision. Keep pull requests focused and describe the user-visible
result, the relevant checks, and any runtime prerequisite that remains unmet.
