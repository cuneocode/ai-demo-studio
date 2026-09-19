# Architecture maps

The local studio uses `app/architecture-model.ts` for explicit nodes, labeled
edges and boundaries, rendered by `app/ArchitectureMap.tsx`. Do not replace these
relationships with responsive card grids or hide edges at small breakpoints.

## Truth boundary

- Brahe's **Implemented system** is a code-derived topology, not a live health
  dashboard. Its source is `services/banking/server.py` and the local agent/tool
  modules. Provider availability and credentials are not asserted by the map.
- The other architectures, and Brahe's **Proposed Cisco deployment**, are design
  proposals. Brahe now has application-enforced AI Defense and conditional Splunk
  instrumentation/export; consult runtime health and per-request evidence rather
  than infer delivery from the diagram. Authentication and private model serving
  remain proposed. Do not show fabricated protection/latency proof.
- Proposed inspection uses an application-enforced Inspection API verdict. Its
  fail-closed policy is an explicit design decision. Source authorization and
  business approval are separate responsibilities.
- References support component patterns, not a certified combined design. The
  baseline private-inference view is not a sized or validated bill of materials.
  Model fit, CPU/GPU benchmarks, storage, residency, HA and compatibility remain
  deployment decisions. A training fabric is not mandatory for inference.

## Extension contract

Preserve the ink/slate/cobalt/violet theme and readable 14px metadata / 16px node
titles. Frontend and backend implementations may change independently of that
theme. Add use-case-specific execution relationships rather than swapping names
inside a supposedly universal architecture. Reuse service/deployment patterns
only where the design explicitly shares those patterns.

Every component must have a responsibility and at least one labeled relationship.
Distinguish data, control, telemetry and placement. Include error branches and
human authority. State which preparation is offline and how its data is consumed
online. Keep conditional integrations clearly separate from running components.

## Verification

Run `node --test tests/architecture.test.mjs` (Node with TypeScript stripping),
`npm run lint`, `npm run build`, and `npm run banking:test`.

Browser QA covers all seven use cases and all four proposed perspectives,
implemented banking execution/retrieval, readable node and edge labels, selection,
pan/zoom, full-screen Escape/focus restoration, and narrow-view page overflow.
Diagrams intentionally scroll at 100%; do not auto-fit text into illegibility.

The repository-wide `tsc --noEmit` check has pre-existing missing Cloudflare worker
types (`cloudflare:workers`, `Fetcher`, `D1Database`), unrelated to these maps.
