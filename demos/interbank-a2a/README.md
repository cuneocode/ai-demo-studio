# interbank-a2a package

`definition.ts` declares stable demo identity and rendering metadata. `ui/Workspace.tsx` adapts the workflow to the shared Studio shell.

Edit the native workspace, story, presenter notes, and tour in this package.
`architecture/` owns the diagram, topology, and source evidence. Register
changes through the shared indexes in the [use-case authoring guide](../../docs/ADDING_USE_CASES.md).
For alternate presentation copy or review steps, [bind a JSON content pack](../../docs/CONTENT_PACKAGES.md#native-bindings-and-rich-content)
to this installed demo.

The package’s `backend/` owns the upstream multi-container stack, dependency
locks, recordings, and notices. The same backend directory holds ignored
`.runtime/` for generated credentials and PKI, and `evidence/` for runs and
telemetry.

`deploy/compose.yaml` is the registered runtime package. The runtime ID remains
`interbank`; Studio manages the project namespace, API mapping, and ports.
Use the dashboard or `npm run studio:containers -- prepare interbank`.
Hosted control registration remains an explicit separate action.
