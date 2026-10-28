import { presenter_notes as code_vulnerability } from "../demos/code-vulnerability/presenter-notes.ts";
import { presenter_notes as kyc_processing } from "../demos/kyc-processing/presenter-notes.ts";
import { presenter_notes as fraud_modeling } from "../demos/fraud-modeling/presenter-notes.ts";
import { presenter_notes as sar_support } from "../demos/sar-support/presenter-notes.ts";
import { presenter_notes as client_advisory } from "../demos/client-advisory/presenter-notes.ts";
import { presenter_notes as market_research } from "../demos/market-research/presenter-notes.ts";
import { presenter_notes as company_briefing } from "../demos/company-briefing/presenter-notes.ts";
import { presenter_notes as brahe_bank } from "../demos/brahe-bank/presenter-notes.ts";
import { presenter_notes as transaction_llm } from "../demos/transaction-llm/presenter-notes.ts";
import { presenter_notes as interbank_a2a } from "../demos/interbank-a2a/presenter-notes.ts";
/**
 * Present-mode talk track per use case, in three acts: the business problem, what AI changes, and where Cisco
 * adds value. Presenter-only; never rendered to the audience outside Present mode. Claims match what is built:
 * "proposed" means not running in this demo.
 */
export type PresenterNote = { problem: string; ai: string; cisco: string; lifecycle?: string };

export const presenterNotes: Record<string, PresenterNote> = {
  "code-vulnerability": code_vulnerability,
  "kyc-processing": kyc_processing,
  "fraud-modeling": fraud_modeling,
  "sar-support": sar_support,
  "client-advisory": client_advisory,
  "market-research": market_research,
  "company-briefing": company_briefing,
  "brahe-bank": brahe_bank,
  "transaction-llm": transaction_llm,
  "interbank-a2a": interbank_a2a,
};
