import { workspace as code_vulnerability } from "../../demos/code-vulnerability/workspace.ts";
import { workspace as brahe_bank } from "../../demos/brahe-bank/workspace.ts";
import { workspace as kyc_processing } from "../../demos/kyc-processing/workspace.ts";
import { workspace as sar_support } from "../../demos/sar-support/workspace.ts";
import { workspace as fraud_modeling } from "../../demos/fraud-modeling/workspace.ts";
import { workspace as client_advisory } from "../../demos/client-advisory/workspace.ts";
import { workspace as market_research } from "../../demos/market-research/workspace.ts";
import { workspace as transaction_llm } from "../../demos/transaction-llm/workspace.ts";
import { workspace as company_briefing } from "../../demos/company-briefing/workspace.ts";
import { workspace as interbank_a2a } from "../../demos/interbank-a2a/workspace.ts";
export type UseCaseFrame = {
  liveExperience?: "banking" | "fraud" | "briefing" | "research" | "advisory" | "interbank" | "sar" | "vulnerability";
  transformation: {
    friction: string;
    aiShift: string;
    humanControl: string;
  };
  architecture: {
    process: { title: string; detail: string }[];
    ai: { point: string; label: string; detail: string }[];
  };
  metrics: { label: string; value: string; detail: string }[];
  rows: { name: string; stage: string; signal: string; status: string; tone: "ready" | "review" | "pending" }[];
  workbenchLabel: string;
  workbenchTitle: string;
  workbenchSummary: string;
  evidence: string[];
  primaryAction: string;
};

export const useCaseFrames: Record<string, UseCaseFrame> = {
  "code-vulnerability": code_vulnerability,
  "brahe-bank": brahe_bank,
  "kyc-processing": kyc_processing,
  "sar-support": sar_support,
  "fraud-modeling": fraud_modeling,
  "client-advisory": client_advisory,
  "market-research": market_research,
  "transaction-llm": transaction_llm,
  "company-briefing": company_briefing,
  "interbank-a2a": interbank_a2a,
};
