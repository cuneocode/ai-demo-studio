import { platform as codeVulnerability } from "../../../demos/code-vulnerability/architecture/platform.ts";
import { platform as braheBank } from "../../../demos/brahe-bank/architecture/platform.ts";
import { platform as fraudModeling } from "../../../demos/fraud-modeling/architecture/platform.ts";
import { platform as companyBriefing } from "../../../demos/company-briefing/architecture/platform.ts";
import { platform as marketResearch } from "../../../demos/market-research/architecture/platform.ts";
import { platform as clientAdvisory } from "../../../demos/client-advisory/architecture/platform.ts";
import { platform as sarSupport } from "../../../demos/sar-support/architecture/platform.ts";
import { platform as kycProcessing } from "../../../demos/kyc-processing/architecture/platform.ts";
import { platform as transactionLlm } from "../../../demos/transaction-llm/architecture/platform.ts";
import { platform as interbankA2a } from "../../../demos/interbank-a2a/architecture/platform.ts";
import type { PlatformDefinition } from "./platform-contract.ts";

export const platformDefinitions: Record<string, PlatformDefinition> = {
  "code-vulnerability": codeVulnerability,
  "brahe-bank": braheBank,
  "fraud-modeling": fraudModeling,
  "company-briefing": companyBriefing,
  "market-research": marketResearch,
  "client-advisory": clientAdvisory,
  "sar-support": sarSupport,
  "kyc-processing": kycProcessing,
  "transaction-llm": transactionLlm,
  "interbank-a2a": interbankA2a,
};
