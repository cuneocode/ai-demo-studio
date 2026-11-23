import type { CaseMap } from "./types.ts";
import { vulnerability } from "../../demos/code-vulnerability/architecture/case-map.ts";
import { brahe } from "../../demos/brahe-bank/architecture/case-map.ts";
import { fraud } from "../../demos/fraud-modeling/architecture/case-map.ts";
import { briefing } from "../../demos/company-briefing/architecture/case-map.ts";
import { research } from "../../demos/market-research/architecture/case-map.ts";
import { advisory } from "../../demos/client-advisory/architecture/case-map.ts";
import { kyc } from "../../demos/kyc-processing/architecture/case-map.ts";
import { sar } from "../../demos/sar-support/architecture/case-map.ts";
import { transactions } from "../../demos/transaction-llm/architecture/case-map.ts";

export const caseMaps: Record<string, CaseMap> = {
  "code-vulnerability": vulnerability,
  "brahe-bank": brahe,
  "fraud-modeling": fraud,
  "company-briefing": briefing,
  "market-research": research,
  "client-advisory": advisory,
  "kyc-processing": kyc,
  "sar-support": sar,
  "transaction-llm": transactions,
};
