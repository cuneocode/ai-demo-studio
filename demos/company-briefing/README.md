# company-briefing package

`definition.ts` declares stable demo identity and rendering metadata. `ui/Workspace.tsx` adapts the workflow to the shared Studio shell.

The package owns its narrative, presenter notes, tour (when available), and
workspace copy. Architecture rendering and evidence registration remain in the
shared `app/map/` system with stable diagram IDs.

`backend/` owns application source, `pyproject.toml`, `uv.lock`, tests, and
recordings. Its legacy `services/` path is a compatibility symlink. Read
[backend setup](backend/README.md) for prerequisites and execution behavior.

`deploy/compose.yaml` is the registered runtime package. The runtime ID remains
`briefing`; project namespace, API mapping, ports, and data mounts remain stable.
Use the dashboard or `npm run studio:containers -- prepare briefing`.
Hosted control registration remains an explicit separate action.
