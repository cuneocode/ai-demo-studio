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
- Wealth research and client advisory share one **Implemented system** derived
  from `services/wealth/server.py`. Analyze always uses an allowlisted Yahoo
  Finance fetch or a write-through cache hit; FRED is an allowlisted named tool
  and is absent without `FRED_API_KEY`. LangChain talks to the local NIM on
  `127.0.0.1:8003`, not hosted OpenAI. Cisco AI Defense inspects model hops only.
  Fetch, cache, FRED, CPU tools, structured conflicts, suitability rules, and
  grounding never enter Inspection. Indicator rows and holding metrics still
  release if the note or meeting brief is omitted. Two accept-gates write
  separate localStorage keys. Demo recommendation / demo brief — not advice.
  The map does not assert live Yahoo, FRED, or NIM availability. No vector
  index, no Tavily, no FRAA import, and no committed market snapshot pack.
  Optional Galileo / Splunk Agent Observability is configuration-only telemetry,
  not a local topic judge. Briefing's EDGAR + upload perimeter is unchanged.
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
`npm run lint`, `npm run build`, `npm run banking:test`, `npm run fraud:test`,
and `npm run wealth:test`.

Browser QA covers all eight use cases, the process home, a zoom into core blocks,
a zoom into one block, Escape back out, the implemented/proposed switch on live use cases,
and readable 16px titles. Do not auto-fit text into illegibility.

The studio map is one SVG. All three altitudes are already drawn in that scene.
Only the current layer is visible. The next layer fades in as the camera arrives,
and fades out on the way back. Zoom out, Escape, and the breadcrumb drive that
same camera. Altitude 0 is the business process. Altitude 1 is
that use case's system boundaries, not a fixed set of platforms. Altitude 2 is
the inside of the block you opened. Tools, SDKs, judges, and guardrail models
appear only there. A system that is not part of the use case is absent.
Optional side paths stay marked optional and are not drawn on paths they do not touch.

The repository-wide `tsc --noEmit` check has pre-existing missing Cloudflare worker
types (`cloudflare:workers`, `Fetcher`, `D1Database`), unrelated to these maps.
