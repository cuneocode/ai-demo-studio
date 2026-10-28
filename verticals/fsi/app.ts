import { lifecycleStory } from "./stories.ts";
import type { AppDefinition } from "../../config/app-contract.ts";

export const app = {
  "id": "fsi",
  "name": "Financial Services",
  "shortName": "FSI",
  "description": "Explore financial services workflows with governed agents, human decisions, and execution evidence.",
  "iconKey": "Landmark",
  "categories": [
    {
      "id": "risk-compliance",
      "label": "Risk & compliance",
      "iconKey": "LockKeyhole"
    },
    {
      "id": "wealth-advisory",
      "label": "Wealth & advisory",
      "iconKey": "Landmark"
    },
    {
      "id": "operations",
      "label": "Operations",
      "iconKey": "Boxes"
    }
  ],
  "catalog": [
    {
      "demoId": "code-vulnerability",
      "categoryId": "risk-compliance"
    },
    {
      "demoId": "brahe-bank",
      "categoryId": "operations"
    },
    {
      "demoId": "fraud-modeling",
      "categoryId": "risk-compliance"
    },
    {
      "demoId": "company-briefing",
      "categoryId": "operations"
    },
    {
      "demoId": "market-research",
      "categoryId": "wealth-advisory"
    },
    {
      "demoId": "client-advisory",
      "categoryId": "wealth-advisory"
    },
    {
      "demoId": "kyc-processing",
      "categoryId": "risk-compliance"
    },
    {
      "demoId": "sar-support",
      "categoryId": "risk-compliance"
    },
    {
      "demoId": "transaction-llm",
      "categoryId": "operations"
    },
    {
      "demoId": "interbank-a2a",
      "categoryId": "operations"
    }
  ],
  "defaultStory": lifecycleStory.demos,
  "context": "company",
  "storyId": "lifecycle"
} satisfies AppDefinition;
