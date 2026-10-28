# interbank-a2a package

`definition.ts` declares stable demo identity and rendering metadata. `ui/Workspace.tsx` adapts the workflow to the shared Studio shell.

The package owns its narrative, presenter notes, tour (when available), and
workspace copy. Architecture rendering and evidence registration remain in the
shared `app/map/` system with stable diagram IDs.

This package declares the existing `services/interbank` implementation as its
shared engine. Its dependency locks and upstream notices remain there.

`deploy/compose.yaml` is the registered runtime package. The runtime ID remains
`interbank`; project namespace, API mapping, ports, and data mounts remain stable.
Use the dashboard or `npm run studio:containers -- prepare interbank`.
Hosted control registration remains an explicit separate action.
