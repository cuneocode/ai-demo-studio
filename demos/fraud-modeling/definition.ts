import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "fraud-modeling",
  "title": "Card fraud triage",
  "description": "Triage a post-authorization alert queue with a graph model that sees merchant compromise, then decide and hand off.",
  "outcome": "Rules vs graph model, plain-English reasons, and an analyst-approved disposition.",
  "iconKey": "CircleGauge",
  "accent": "mint",
  "solutions": [
    "AI Infrastructure",
    "Splunk Observability",
    "AI Defense"
  ],
  "signal": "Graph model + triage agent",
  "stage": "In development",
  "mode": "live",
  "architectureId": "fraud-modeling",
  "runtimeId": "fraud",
  "workspaceKey": "fraud",
  "model": {
    "calls": "Triage Deep Agent and analyst summary (the score never uses an LLM)",
    "applies": "Next triage run"
  },
  "assets": {
    "ui": "demos/fraud-modeling/ui/Workspace.tsx",
    "narrative": "demos/fraud-modeling/narrative.ts",
    "presenter": "demos/fraud-modeling/presenter-notes.ts"
  }
} satisfies DemoDefinition;
