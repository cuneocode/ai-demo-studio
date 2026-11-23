import { proposed } from "../../../app/map/case-helpers.ts";

export const transactions = proposed("transaction-llm", "Proposed process", "A proposed enrichment path. Authorization stays on the existing pipeline, which has no LLM.", [
  ["ingest", "Ingest payments", "Existing pipeline, no model", "service"],
  ["enrich", "Propose fields", "A model would suggest fields for exceptions only.", "ai"],
  ["review", "Operations accepts fields", "People accept or reject suggestions.", "decision"],
  ["stop", "Authorization unchanged", "The payment path would not wait on a model.", "outcome"],
]);
