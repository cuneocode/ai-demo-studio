import { evidence as braheBank } from "../../demos/brahe-bank/architecture/evidence.ts";
import { evidence as fraudModeling } from "../../demos/fraud-modeling/architecture/evidence.ts";
import { evidence as companyBriefing } from "../../demos/company-briefing/architecture/evidence.ts";
import { evidence as marketResearch } from "../../demos/market-research/architecture/evidence.ts";
import { evidence as clientAdvisory } from "../../demos/client-advisory/architecture/evidence.ts";
import { evidence as sarSupport } from "../../demos/sar-support/architecture/evidence.ts";
import { evidence as interbankA2a } from "../../demos/interbank-a2a/architecture/evidence.ts";
import { evidence as codeVulnerability } from "../../demos/code-vulnerability/architecture/evidence.ts";
import { evidence as wealth } from "../../verticals/fsi/wealth/evidence.ts";
import { evidence as studio } from "./shared-evidence.ts";
import type { EvidenceRef } from "./types.ts";

/** Allowlisted excerpts by owner. Line ranges are 1-based and inclusive. */
export const evidenceGroups = [
  { directory: "demos/brahe-bank/architecture", evidence: braheBank },
  { directory: "demos/fraud-modeling/architecture", evidence: fraudModeling },
  { directory: "demos/company-briefing/architecture", evidence: companyBriefing },
  { directory: "demos/market-research/architecture", evidence: marketResearch },
  { directory: "demos/client-advisory/architecture", evidence: clientAdvisory },
  { directory: "demos/sar-support/architecture", evidence: sarSupport },
  { directory: "demos/interbank-a2a/architecture", evidence: interbankA2a },
  { directory: "demos/code-vulnerability/architecture", evidence: codeVulnerability },
  { directory: "verticals/fsi/wealth", evidence: wealth },
  { directory: "app/map", evidence: studio },
];

export const evidence: Record<string, EvidenceRef> = Object.assign({}, ...evidenceGroups.map(group => group.evidence));
