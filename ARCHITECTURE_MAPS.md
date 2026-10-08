# Architecture maps

The local studio uses `app/architecture-model.ts` for explicit nodes, labeled
edges and boundaries, rendered by `app/ArchitectureMap.tsx`. Do not replace these
relationships with responsive card grids or hide edges at small breakpoints.

## Truth boundary

- Brahe's **Implemented system** is a code-derived topology, not a live health
  dashboard. Its source is `services/banking/server.py` and the local agent/tool
  modules. Provider availability and credentials are not asserted by the map.
- Fraud scoring's **Implemented system** is likewise code-derived from
  `services/fraud/server.py`. The default backend is a fixture/cache scorer.
  Triton, production HTTP, and narratives are configured alternatives. The score
  is not a fraud flag. AI Defense applies only to optional narratives.
- Company briefing's **Implemented system** is code-derived from
  `services/briefing/server.py` and the Deep Agent modules. Ingest is EDGAR or
  upload; navigation is a filing TOC plus node files, not a vector index. Metrics
  come from SEC companyfacts or verbatim tables. Cisco AI Defense inspects model
  hops only. EDGAR, upload, PDF extract, TOC, XBRL, and the grounding verifier
  never enter the Inspection API. The map does not assert live SEC or OpenAI
  availability. The presenter accept-gate is required before studio context is
  stored. Fail-closed: unknown/ambiguous issuer, no annual report, empty PDF,
  inspection deny, ungrounded-only themes, or model/tool error.
- Interbank settlement investigation's **Implemented system** is code-derived from
  `services/interbank` (compose, gateway YAML, agents, policy, collector). Only the
  two gateways cross between banks. Cisco AI Defense runs as an ExtProc on every
  gateway listener (request and response, fail closed: 403 on violation, 503 when
  inspection is unavailable). Splunk Agent Control evaluates each outbound A2A
  message inside the agent before it reaches the gateway. Agents export spans with
  `SplunkAOSpanProcessor`; gateways export through a per-bank collector; W3C
  context crosses every hop, so one investigation is one trace and one session.
  Agents are read-only and people approve remediation. **Trust & data preparation**
  is offline (`labctl up`); the lab's certificates are self-signed for local use.
  Nodes with `code` open the real file in the source viewer
  (`services/interbank/demo/sources.py`). The map does not assert that OpenAI,
  AI Defense, or Splunk are reachable.
- The other architectures, and the **Proposed Cisco deployment** views, are design
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
`npm run lint`, `npm run build`, `npm run banking:test`, and `npm run fraud:test`.

Browser QA covers all nine use cases and all four proposed perspectives,
implemented banking execution/retrieval, implemented fraud scoring/backends,
implemented briefing agent execution/filing retrieval, implemented interbank
agent-to-agent execution/trust preparation and its source viewer, readable node and edge labels, selection,
pan/zoom, full-screen Escape/focus restoration, and narrow-view page overflow.
Diagrams intentionally scroll at 100%; do not auto-fit text into illegibility.

The repository-wide `tsc --noEmit` check has pre-existing missing Cloudflare worker
types (`cloudflare:workers`, `Fetcher`, `D1Database`), unrelated to these maps.
