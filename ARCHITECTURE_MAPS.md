# Architecture maps

Every Architecture tab uses one persistent draw.io canvas. The business journey
expands into system boundaries, then component detail. Expanding a group keeps
surrounding stages visible as compact groups. The camera pans and zooms toward
the expanded area while the shared layout makes room for its contents.

Select **+ Expand** or press Enter on a group to reveal its contents. Select its
**Collapse** header to fold it. Back and Escape collapse one level and restore the
previous framing. Breadcrumbs return to an ancestor. **Collapse all** restores
the journey. Selecting another stage collapses the previous branch within the
same model.

Drag the background to pan. Ctrl or Command with the wheel zooms, as do the zoom
buttons. **Fit focus** frames the expanded area, nearby stages, and enabled platform views. The overview
shows the wider architecture and fits the whole canvas when selected. Source and
environment panels preserve the diagram and camera. **Diagram components**
provides text controls, including a Details action for expandable groups.

Source code slides in from the right in a full-height, resizable drawer. Escape
closes the drawer and returns focus to the diagram. Opening source preserves the
camera. Automatic framing fits the expanded area with space around it.

## Layers and implementation modes

Every demo exposes Security, Observability, and AI Infrastructure controls. A
layer enabled from the journey opens the system and its connected platform view.
Layer changes within an expanded system preserve the camera and workflow positions.
Application checks, tools, agents, SDKs, and hosted services retain their owning
boundaries. Routes distinguish data, control, telemetry, and model placement.
Control detail includes relevant allowed, denied, and stopped outcomes.

`platform-views.ts` supplies shared runtime and model-placement views when a demo
has no authored infrastructure scope, and validates that every system declares
all three layers. Code vulnerability analysis has a Security view for scope,
review, evidence-publication, and model-egress controls. Its AI Defense inspection
remains explicitly disabled. The infrastructure view links local process and
shared model-routing evidence; proposed private Cisco placement is visible only
in Proposed mode. KYC and transaction intelligence retain their proposed status.

`implementation-views.ts` consolidates repeated provider views into one canonical
inference endpoint and connects each demo's actual callers to its routing path.
Visa DeepAgents remains an application agent runtime. Brahe's application judges
remain services that call the shared endpoint. Fraud scoring has a separate model
and scorer runtime. Agent Control emits telemetry from its security gates.
Cross-scope calls follow the same endpoint as its owning group expands or folds.

Supported modes come from the catalog. KYC and transaction intelligence open in
**Proposed** mode. Market research offers **Implemented** only. Brahe and Interbank
distinguish configured model endpoints from proposed private inference. Source
and design evidence belongs in the architecture; run stats and service health
report execution and delivery.

## Authoring and composition

Component symbols come from the Apache 2.0 IBM Carbon Icons library in draw.io's
[icon catalog](https://icons.diagrams.net/sets/carbon-icons). Use a robot for an
agent, tools for an invocable tool, gateway arrows for an AI gateway, a connected
model symbol for inference/endpoints, and a cylinder for a persistent database.
Controls, services, human review, workflows, data, telemetry, infrastructure, and
outcomes have corresponding symbols in the same family.

`component-types.ts` assigns types through authored identities. Override a cell's
`componentType` when needed. An inference endpoint is a model; a lookup operation is a tool;
documents and evidence remain data. `components.ts` defines the shared symbols,
type labels, and compact card labels. The viewer and exported diagrams use the
same labels. Keep explanations in the detail drawer. Exports embed the local
SVGs so icons travel with the `.drawio` file.

- `app/map/drawio/registry.ts` registers each catalog, authored scope templates,
  and editable asset. `ArchitectureMap.tsx` always uses `DrawioExplorer`.
- The templates in `brahe-pages.ts`, `interbank-pages.ts`, and `generic-pages.ts`
  describe nested scopes. The generator composes them into one draw.io diagram.
  Keep the running viewer on that single diagram throughout navigation.
- `canvas.ts` assigns each scope to an owning cell and resolves repeated context
  occurrences to ancestor cells. Explicit `owner` and `aliases` declarations
  handle deeper inspection groups and workflow continuations. Cross-links focus
  the existing group. Preserve canonical entity, relationship, and source IDs.
- Cross-scope edges use `fromScopeId` or `toScopeId` to reference existing cells.
  `visibleCanvasEdges` projects hidden endpoints onto their nearest visible owner
  and replaces summary routes with detailed calls as callers expand. Layer and
  mode filters apply to the complete ownership path. Shared platform routing
  avoids visible component cards, including evidence stores below a caller.
- `scripts/drawio-layout.ts` lays out automatic scope interiors with ELK. Complex
  interiors use authored coordinates and routes. `canvas-layout.ts` composes
  these interiors, grows containers, and moves intersecting local neighbours.
  The browser and generator use the same layout implementation.
- Keep automatic workflows left to right without wrapping. Use `flow` rows for
  explicit workflow columns and supporting functional lanes. Columns grow with
  expanded groups, and ports remain aligned along the main path. Route replies
  through a separate rail and place blocked outcomes below the main workflow.
- Keep labels concise and explanations in the shared detail panels. Expanded
  group headers and ownership labels need separate space. Keep SDKs, tools,
  application judges, hosted inspection, and policy services inside their owners.

Run `npm run map:drawio` after changing scope templates, composition, topology,
labels, or layout. Commit `public/diagrams/*.drawio` and the generated
`public/diagrams/canvas-layout.js` and `components.js` with the source changes. Each `.drawio` file
contains one diagram with native collapsible groups and alternate bounds.
**Editable diagram** downloads it for draw.io. Regeneration replaces direct
edits to an exported file; carry lasting changes into the scope definitions.

The pinned viewer, version, and license live in `public/vendor/drawio/`.
`public/diagrams/viewer.js` loads the model once, updates its existing cells,
animates geometry and camera movement, and handles native group visibility.
It respects reduced motion. Theme changes update styles in place. Diagram
rendering uses local assets.

When linked source excerpts change, run `npm run map:sources` and commit the
updated evidence artifacts.

## Verification

```sh
npm run map:drawio
node --test tests/drawio.test.mjs
npm run test:browser -- tests/drawio.spec.ts tests/explorer.spec.ts
npm test
npm run typecheck
npm run lint
```

Checks cover all ten use cases, every expansion, one-model identity, nested
containment, sibling spacing, canonical evidence, editable asset parity,
supported modes and layers, camera restoration, source panels, keyboard access,
interrupted navigation, reduced motion, themes, retry, and guided entry. Shell
checks verify that a mocked run continues while Architecture is open and survives
returning to the demo. Runtime changes require the affected service checks in
`CONTRIBUTING.md`.
