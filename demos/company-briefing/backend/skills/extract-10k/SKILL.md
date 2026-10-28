---
name: extract-10k
description: Navigate one annual report (EDGAR 10-K/20-F/40-F or an uploaded PDF/HTML/TXT) via its table of contents. Extract cited business objectives, material risks, regulatory obligations, AI initiatives, and XBRL metrics. Use when building a company briefing. Never browse the open web.
---

# Extract a company briefing from one filing

Content perimeter: the selected EDGAR accession or the uploaded file already mounted at `/filings/`. No Tavily, no IR-site scraping, no model-memory facts.

## Supervisor

1. Plan with `write_todos`.
2. Identity and ingest only: `resolve_company`, `fetch_annual_report` (auto path), `extract_pdf_text` (PDF upload), `build_filing_toc`, `get_company_facts`.
3. Never call `read_filing_node`. Never concatenate Item 1A.
4. `task` these specialists only: `objectives`, `risks`, `regulatory`, `ai_initiatives`, `metrics`.
5. Assemble `CompanyBriefing` from `/filings/notes/*.json` and XBRL tool output.

## Specialists

- `list_filing_toc` then at most eight `read_filing_node` calls.
- Every fact needs `text`, `item`, `node_id`, a verbatim `excerpt` that appears in that node, and `source_url`.
- If the excerpt would not appear in the node, drop the fact.
- `ai_initiatives` abstains when the filing never mentions AI.
- `metrics` uses `get_company_facts` only. No arithmetic.

## Paths

- Auto: "No file. Resolve {query} and fetch the latest annual report."
- Upload: "Filing already at /filings/source.pdf…" — do not call `fetch_annual_report`.
