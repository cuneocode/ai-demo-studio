# market-research package

`definition.ts` declares stable demo identity and rendering metadata. `ui/Workspace.tsx` adapts the workflow to the shared Studio shell.

Edit the native workspace, story, presenter notes, and tour in this package.
`architecture/` owns the diagram, topology, and source evidence. Register
changes through the shared indexes in the [use-case authoring guide](../../docs/ADDING_USE_CASES.md).
For alternate presentation copy or review steps, [bind a JSON content pack](../../docs/CONTENT_PACKAGES.md#native-bindings-and-rich-content)
to this installed demo.

This package declares the existing `services/wealth` implementation as its
shared engine. Its dependency locks and upstream notices remain there.

`deploy/compose.yaml` is the registered runtime package. The runtime ID remains
`research`; project namespace, API mapping, ports, and data mounts remain stable.
Use the dashboard or `npm run studio:containers -- prepare research`.
Hosted control registration remains an explicit separate action.
