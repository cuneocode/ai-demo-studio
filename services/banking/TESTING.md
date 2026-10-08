# Functional verification — 2026-09-07

Verified with the project root `.env`, configured `gpt-5.6-luna`, local document search, and Galileo callbacks.

- Mock score: live supervisor delegated to the score agent; tool returned 550.
- Product comparison: live retrieval returned Orbit $0 and Celestial $99 annual fees, with source documents.
- Multi-turn eligibility: retained score 550 and correctly distinguished Orbit's over-500 criterion from Celestial's over-600 criterion.
- Unrelated weather question: declined to answer.
- Galileo: final proxy request returned `recorded` after acknowledged trace upload.
- Four isolated pytest tests passed, covering validation, missing service, session reuse/isolation, unknown sessions, error redaction, local document retrieval, score tool, and execution/source capture.
- Browser: use-case navigation, real credit-score response, loading state, Add to story, system view, and 390px layout checked. No page overflow at 390px or 1200px. Stale font cache paths from the folder move were repaired.
- Frontend build and ESLint passed.

Pinecone was not live-tested: its `.env` value is empty. Local retrieval uses the eight supplied Markdown files and is labeled as lexical document search, not vector search. This dated verification predates the later AI Defense and Agent Control integration; use current source, configuration health, and captured-run evidence for their status rather than inferring it from this historical note.

The separate repository-wide `tsc --noEmit` check reports existing Cloudflare worker typing gaps (`cloudflare:workers`, `Fetcher`, `D1Database`). No banking TypeScript errors were reported. The old root `npm test` suite targets the discarded starter skeleton; use `npm run banking:test` for this integration.
