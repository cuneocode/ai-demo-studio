# Continuous Brahe map implementation

The former replacement boundary was `Explorer.tsx → enterScene() → NavState.sceneId → braheScenes.scenes[destination]`. Each Explore action committed another scene and reframed its standalone authored layout.

Brahe now uses one root projection:

- `brahe-system.ts` projects stable occurrences and relationships from the existing `braheScenes` entities, bindings, source actions, and canonical relationship IDs.
- `NavState.expandedGroupIds` and `interactionHistory` are the expansion authority. `sceneId` remains `brahe.journey`.
- `Explorer.tsx` routes Brahe Expand/Collapse/Back to projection updates. Other use cases retain the legacy scene adapter.
- `nodes.tsx` renders stable summary/expanded group occurrences through React Flow `parentId`.
- `scene-model.ts` resolves parent-relative positions for routing, bounds, and collision checks.
- Platform focus and source selection remain independent presentation/evidence state and never enter the projection/layout key.

The reference hierarchy is:

`Bank assistant → Check question → Request inspection`, with scope evaluation/control/decision visible inside Check. Build, hosting, Return, and answer inspection use the same projection contract.

## Stabilization contract

- Authored width is the representation constraint. Browser measurement cannot promote an expanded wrapper width into a collapsed summary.
- Collapse projects the requested expansion set and reuses the cached viewport for that set when available; it does not invoke Back or pop interaction history.
- Deep control framing uses compact sibling summaries and includes input, selected interaction, decision, continuation, and stopped outcome.
- Source and Environment details share one bounded panel host. Open-state framing uses the unobscured canvas; source facets do not move the camera; close restores the saved viewport.
- Source menus are occurrence-explicit. Canonical platform bindings do not automatically become evidence choices for descendant workload nodes.
- Expanded groups reserve a 44px header and derive their minimum bounds from current direct children plus a 16px content gap.
- Request and answer inspection refine their inbound relationship to the internal call. Inspection and policy/scope deny paths connect explicitly to the shared stopped outcome.
- Route validation checks every non-attachment edge segment and label against meaningful node boxes.
- Custom measurement updates are deferred and batched. Animated framing does not publish target zoom into React state; `onMoveEnd` publishes settled zoom. React Flow handlers are memoized so camera updates do not rewrite tracked props during resize delivery.
