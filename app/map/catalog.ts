import type { Catalog } from "./journey.ts";
import type { Mode } from "./scene-model.ts";
import { enableContinuousCatalog } from "./generic-system.ts";
import { vulnerability } from "../../demos/code-vulnerability/architecture/catalog.ts";
import { brahe } from "../../demos/brahe-bank/architecture/catalog.ts";
import { fraud } from "../../demos/fraud-modeling/architecture/catalog.ts";
import { briefing } from "../../demos/company-briefing/architecture/catalog.ts";
import { research } from "../../demos/market-research/architecture/catalog.ts";
import { advisory } from "../../demos/client-advisory/architecture/catalog.ts";
import { kyc } from "../../demos/kyc-processing/architecture/catalog.ts";
import { sar } from "../../demos/sar-support/architecture/catalog.ts";
import { transactions } from "../../demos/transaction-llm/architecture/catalog.ts";
import { interbank } from "../../demos/interbank-a2a/architecture/catalog.ts";

export type { Catalog } from "./journey.ts";

const rawCatalogs: Record<string, Catalog> = {
  "code-vulnerability": vulnerability,
  "brahe-bank": brahe,
  "fraud-modeling": fraud,
  "company-briefing": briefing,
  "market-research": research,
  "client-advisory": advisory,
  "kyc-processing": kyc,
  "sar-support": sar,
  "transaction-llm": transactions,
  "interbank-a2a": interbank,
};

export const catalogs: Record<string, Catalog> = Object.fromEntries(
  Object.entries(rawCatalogs).map(([id, catalog]) => [id, enableContinuousCatalog(catalog)]),
);

export function resolveScene(catalog: Catalog, sceneId: string, mode: Mode) {
  return catalog.resolveScene?.(sceneId, mode) ?? sceneId;
}
