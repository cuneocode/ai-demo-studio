# interbank-a2a package

`definition.ts` declares stable demo identity and rendering metadata. `ui/Workspace.tsx` adapts the workflow to the shared Studio shell.

The package owns its narrative, presenter notes, tour (when available), and
workspace copy. Architecture rendering and evidence registration remain in the
shared `app/map/` system with stable diagram IDs.

The package’s `backend/` owns the upstream multi-container stack, dependency
locks, recordings and notices. Installed PKI and evidence remain at their
existing paths under `services/interbank/`.

`deploy/compose.yaml` is the registered runtime package. The runtime ID remains
`interbank`; project namespace, API mapping, ports, and data mounts remain stable.
Use the dashboard or `npm run studio:containers -- prepare interbank`.
Hosted control registration remains an explicit separate action.
