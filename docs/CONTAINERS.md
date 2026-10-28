# Use-case container packages

## Industry app and demo package ownership

Read [AI Demo Studio platform](AI_DEMO_STUDIO.md) for the current source map,
scoped host API contract, compatibility paths, and app-aware CLI. Author new
workflows in `demos/<demo-id>/`, then register membership in
`verticals/<app-id>/app.ts`. Existing `services/` symlinks and `use-cases/`
forwarding files support previous commands; canonical UI and deployment files
live in each demo package. The shared Wealth engine and upstream Interbank
blueprint retain their declared implementation boundaries.

Studio is a trusted local operator. It owns credentials, model routing, dashboard
navigation, and Compose lifecycle commands. Each executable use case owns a Compose
project, its application containers, and persistent data. KYC and Transaction
Intelligence are registered as illustrative packages with no executable backend.

## Package registry

`demos/<demo-id>/definition.ts` declares public identity, mode, and optional
`runtimeId`; `config/demos.ts` indexes it. Industry manifests declare membership.
`config/use-cases.ts` joins those definitions to explicit `runtimeDefinitions`.
Each `RuntimeSpec` declares source, Dockerfile, image/build identity, Compose file
and service, API/upstream prefixes, host port, health route, timeout, model-route
ID, environment allowlist, shared bindings, storage, optional components, and an
explicit control-registration command when supported. The operator and both
development and production proxies consume the resulting registry.
Market Research and Advisor Prep reuse the Wealth image in independent projects.
Their public prefixes are `/api/research` and `/api/advisory`; the adapter's internal
API remains `/api/wealth`. The original `/api/wealth` proxy remains available for
source development and existing research integrations.

## Build and lifecycle

`npm run studio:install` builds all enabled executable packages, currently eight.
It prepares local configuration, installs frozen dependencies into images, and
performs no hosted control registration. A selected stack can be built on demand
from Services.
The operator queues container operations and limits Compose parallelism to one.
Dependency installs use bounded concurrency and discard package-download caches.
Each Python package's Dockerfile follows the shared pattern: install its frozen
lockfile, embed shared run/model libraries, and run as uid 10001. Runtime source
is packaged in the image.
The host needs Node and Docker; Python environments are optional developer tools.

Start builds and brings up the selected project, waits for container health, then
checks its application API. A successful process start can still show blocked
integration readiness. Stop includes optional component profiles and preserves
containers' persistent volumes. Restart recreates the selected stack. Closing the
Studio process leaves stacks running. Failed operations expose bounded, redacted
logs and can be retried. Docker operations target only registered project names.
External processes on an occupied API port are preserved and reported as conflicts.

Named data volumes use the installation namespace and runtime. The ignored
`.studio/installation.json` adopts the previous checkout namespace and preserves
it when the installation moves. Retain that file and existing image/project/data
identities during upgrades. Existing source-mode caches remain untouched. To
bring old saved data into a container deployment, stop both runtimes and
explicitly copy the selected data into its named volume. The
operator performs no automatic cache migration or volume deletion.

Shared run journals include run metadata and result snapshots. Completed runs
retain identity, events, results, and provenance after container restart.
Interrupted runs are marked failed on recovery. Banking conversations retain their
existing process-local lifetime; explicit committed recordings remain available
through Studio with all application stacks stopped.

## Configuration and networking

Root `.env` remains the canonical credential file. The operator writes a scoped
0600 environment file for each runtime under `.studio/runtime`. Compose uses raw
format so dollar signs and hashes in keys retain their values. These files are
ignored and excluded from build contexts. The browser receives configuration
status and never receives credential values.

Shared model routes are mirrored into a dedicated read-only directory mount.
Atomic updates are visible to running containers. Provider keys are supplied only
to runtimes whose environment contract permits them. Saving credentials requires
Apply or Restart; changing model routes applies on the next request.

Inside containers, host-loopback endpoints resolve through `host.docker.internal`.
Linux Compose files provide the host-gateway mapping. Each application binds
internally to `0.0.0.0:8000`, with its host API port published on loopback. Interbank
retains its private per-bank networks and gateway-mediated A2A paths. Shared LLM
hosting can stay remote or run as a separate optional platform stack.

System trust roots and optional `EXTRA_CA_FILE` are provided as public CA material.
BuildKit mounts the CA during dependency installation. Runtime containers receive
it read-only. Model credentials are never build arguments or image layers.

## Optional components

Fraud includes the existing NVIDIA scorer definition under the `gnn` profile. Its
Services row exposes component Start and Stop. It needs compatible NVIDIA hardware,
the Container Toolkit, and prepared graph/model artifacts. CPU Studio operation
uses its configured remote scorer or labelled recorded/sample scores. Training
remains an explicit separate operation described in the Fraud guide.

Interbank preparation runs in a one-off helper container. It creates local PKI and
scoped vendor configuration. Its explicit hosted-control action creates/binds the
configured tenant policies. Ordinary Start and Build do not perform that action.
For existing lab installations, the former `http://localhost:8000` Agent Control
placeholder retains the lab's hosted fallback. Set the intended tenant endpoint
explicitly in Studio settings. Other loopback endpoints use the standard container
translation.

## Upgrade an existing Interbank lab

The earlier lab used the fixed Compose project `interbank-a2a`. Verify that its
Compose working directory belongs to this checkout before retiring it. Stop and
remove that old project without deleting volumes, then start Interbank from Studio.
Keep `services/interbank/.runtime/` and `evidence/`; the new project uses them.

```sh
docker inspect interbank-a2a-demo-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker compose --project-name interbank-a2a --file services/interbank/compose.yaml down
npm run studio:containers -- start interbank
```

Docker can exhaust its default subnet pools when retired projects retain networks.
Remove only unused networks from the verified retired project. Saved-data volumes
remain separate from network cleanup. Current Stop preserves containers, networks,
and data for the next session.

## Add a blueprint or use case

Follow the [use-case authoring guide](ADDING_USE_CASES.md) for UI registration,
shared visual design, stories, architecture, and acceptance checks. This section
covers the runtime package.

1. Create `demos/<demo-id>/backend/` with its source, tests, pinned dependencies,
   and `uv.lock` for a Python backend. Pin upstream revisions/images and retain
   notices. A declared shared engine or upstream multi-container blueprint can
   retain its existing implementation boundary.
2. Add `deploy/Dockerfile` and `deploy/compose.yaml` to the package. Start from
   [SAR's Dockerfile](../demos/sar-support/deploy/Dockerfile) and
   [Compose file](../demos/sar-support/deploy/compose.yaml) for a dedicated Python
   service, or [Interbank's adapter](../demos/interbank-a2a/deploy/compose.yaml)
   for an upstream stack. Apply the path and identity rules below.
3. Index the public demo definition in `config/demos.ts`, add industry membership,
   and register its `RuntimeSpec` in `runtimeDefinitions` in `config/use-cases.ts`.
   The definition's `runtimeId` must resolve to it. UI adapters have their own
   registration in `app/studio/workspaces.tsx`.
4. Add a Studio UI/adapter using shared workspaces, stats, timelines, and
   provenance. Map upstream execution events into the shared run schema. Implement
   cancellation, failures, recovery, and saved-run restoration for long operations.
5. Route model calls through Studio configuration and enforce the chosen egress
   policy. Map AI Defense and telemetry configuration to supported upstream SDKs;
   report actual inspection and delivery status.
6. Add the shared story, presenter notes, guided tour, and draw.io architecture.
   Show its current container placement and configured inference endpoint separately
   from proposed Cisco deployment options.
7. Verify isolated Start/Stop/Restart, readiness failures, another stack remaining
   available, data persistence, browser flows, and real integration delivery.

An upstream blueprint can keep its own framework and supporting containers. Its
adapter defines the stable boundary Studio consumes. Additional embedding,
reranking, retrieval, or GPU services belong in its explicit component contract.

### Paths and identities to verify

| Field | Requirement |
| --- | --- |
| Demo/model identity | Use the stable demo ID for `modelUseCase`, Python model selection, narratives, tours, architecture, and saved-run references. A different runtime ID is permitted. |
| `source`, `dockerfile`, `compose` | Registry paths are repository-relative. A dedicated backend uses `demos/<demo-id>/backend`; deployment files live under that package's `deploy/`. |
| Compose build context | From `deploy/compose.yaml`, `context: ../../..` reaches the repo root. `dockerfile` is relative to that context. Set the Dockerfile's `SOURCE_DIR` to the canonical backend path. |
| `directory` and `SERVICE` | The Python image pattern uses `/app/services/<SERVICE>` inside the container. Match imports, working directory, commands, and persistent mounts to that path. This container path requires no host-side `services/<SERVICE>` symlink for a new demo. |
| `buildIdentity` and Compose `image` | They must match. Shared images need an intentional shared identity; independent demos use distinct image names. Preserve existing `fsi-studio/*` identities. |
| `id`, `service`, ports and prefixes | Choose an unused runtime ID, loopback host port, and public API prefix. `service` names the Compose application service. `upstreamPrefix` and `health` match the actual backend paths, including prefix rewrites. |
| Environment | Reuse scoped raw `env_file`, read-only models mount, CA mount, and host-gateway mapping from the reference. `STUDIO_USE_CASE` identifies the runtime; model calls use the demo's `modelUseCase`. Exact variable names and prefixes ending in `_` form the allowlist. Limit it to supported settings and keep credentials outside images. |
| `sharedBindings` | Declare only supported model, AI Defense, observability, or control capabilities. Implement their clients, enforcement, exporters, and health reporting in the backend. |
| `storage` and volumes | List the actual named volumes or declared persistent paths. Match Compose mounts and retain journals/results across Stop, Restart, and recreation. Keep internal databases/workers on package networks. |
| `components` and `controls` | Optional services need explicit profiles, requirements, and lifecycle controls. Hosted registration belongs in a separate documented action. |

When copying a reference, replace every demo/runtime identity, source path,
Dockerfile argument, port, API prefix, health check, image name, environment
prefix, and cache mount. Keep shared runtime mounts parameterized with
`${STUDIO_RUNTIME_DIR:-../../../.studio/runtime}`. Declare build-time CA secrets
as in the reference. Keep model hosting shared unless the demo requires an
explicit additional endpoint.

Add backend install/test commands when needed. Optional source-development
scripts and `studio:doctor --source` currently follow the existing `services/`
layout; extend those adapters to the new canonical path if source mode is offered.
Validate both API proxies, app-scoped access, doctor checks, preview blocking,
dependency isolation, and an actual browser run after the image is built.
