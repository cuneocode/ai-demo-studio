# Use-case container packages

Studio is a trusted local operator. It owns credentials, model routing, dashboard
navigation, and Compose lifecycle commands. Each executable use case owns a Compose
project, its application containers, and persistent data. KYC and Transaction
Intelligence are registered as illustrative packages with no executable backend.

## Package registry

`config/use-cases.ts` declares each package's use-case id, runtime id, Compose file,
API prefix, upstream prefix, host port, health route, environment allowlist,
optional component profiles, and explicit control-registration command. The
operator and both development and production proxies consume this registry.
Market Research and Advisor Prep reuse the Wealth image in independent projects.
Their public prefixes are `/api/research` and `/api/advisory`; the adapter's internal
API remains `/api/wealth`. The original `/api/wealth` proxy remains available for
source development and existing research integrations.

## Build and lifecycle

`npm run studio:install` builds eight executable packages. It prepares local
configuration, installs frozen dependencies into images, and performs no hosted
control registration. A selected stack can be built on demand from Services.
The operator queues container operations and limits Compose parallelism to one.
Dependency installs use bounded concurrency and discard package-download caches.
The common Python Dockerfile uses each service's lockfile, embeds shared run and
model libraries, and runs as uid 10001. Runtime source is packaged in the image.
The host needs Node and Docker; Python environments are optional developer tools.

Start builds and brings up the selected project, waits for container health, then
checks its application API. A successful process start can still show blocked
integration readiness. Stop includes optional component profiles and preserves
containers' persistent volumes. Restart recreates the selected stack. Closing the
Studio process leaves stacks running. Failed operations expose bounded, redacted
logs and can be retried. Docker operations target only registered project names.
External processes on an occupied API port are preserved and reported as conflicts.

Named data volumes are scoped to each checkout and runtime. Existing source-mode
caches remain untouched. To bring old saved data into a container deployment, stop
both runtimes and explicitly copy the selected data into its named volume. The
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

1. Pin the upstream source revision and image versions; retain its license notices.
2. Add its Dockerfile and Compose definition. Existing upstream images and multiple
   containers are supported. Keep internal databases and workers on package networks.
3. Register the runtime and its UI package in `config/use-cases.ts`. Declare unique
   API paths, ports, health routes, required environment names, optional profiles,
   hardware requirements, and persistent storage.
4. Add a small Studio UI/adapter using shared workspaces, stats, timelines, and
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
