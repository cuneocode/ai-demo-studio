import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "market-research",
  "title": "Market research",
  "description": "Review earnings, recent news and competitors. Get a cited outlook and Buy, Hold or Sell recommendation.",
  "outcome": "See the facts behind the recommendation and the article AI Defense excluded.",
  "iconKey": "Landmark",
  "accent": "blue",
  "solutions": [
    "AI Defense",
    "Splunk Observability"
  ],
  "signal": "Market analysis · screened news · cited drivers",
  "stage": "In development",
  "mode": "live",
  "architectureId": "market-research",
  "runtimeId": "research",
  "workspaceKey": "research",
  "model": {
    "calls": "Evidence-packet assessment and verified-fact recommendation",
    "applies": "Next run"
  },
  "assets": {
    "ui": "demos/market-research/ui/Workspace.tsx",
    "narrative": "demos/market-research/narrative.ts",
    "presenter": "demos/market-research/presenter-notes.ts"
  }
} satisfies DemoDefinition;
