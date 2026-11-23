import braheBank from "../../demos/brahe-bank/architecture/source-artifacts.json" with { type: "json" };
import fraudModeling from "../../demos/fraud-modeling/architecture/source-artifacts.json" with { type: "json" };
import companyBriefing from "../../demos/company-briefing/architecture/source-artifacts.json" with { type: "json" };
import marketResearch from "../../demos/market-research/architecture/source-artifacts.json" with { type: "json" };
import clientAdvisory from "../../demos/client-advisory/architecture/source-artifacts.json" with { type: "json" };
import sarSupport from "../../demos/sar-support/architecture/source-artifacts.json" with { type: "json" };
import interbankA2a from "../../demos/interbank-a2a/architecture/source-artifacts.json" with { type: "json" };
import codeVulnerability from "../../demos/code-vulnerability/architecture/source-artifacts.json" with { type: "json" };
import wealth from "../../verticals/fsi/wealth/source-artifacts.json" with { type: "json" };
import studio from "./source-artifacts.json" with { type: "json" };

export type Artifact = {
  id: string;
  path: string;
  symbol: string;
  revision: string;
  start: number;
  end: number;
  hash: string;
  highlightLines: number[];
  html: string;
  proves: string;
};

export const artifacts: Record<string, Artifact> = {
  ...braheBank.artifacts,
  ...fraudModeling.artifacts,
  ...companyBriefing.artifacts,
  ...marketResearch.artifacts,
  ...clientAdvisory.artifacts,
  ...sarSupport.artifacts,
  ...interbankA2a.artifacts,
  ...codeVulnerability.artifacts,
  ...wealth.artifacts,
  ...studio.artifacts,
};
