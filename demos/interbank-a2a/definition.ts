import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "interbank-a2a",
  "title": "Interbank settlement investigation",
  "description": "Two banks' Deep Agents investigate a failed settlement together over A2A, through each bank's AI gateway.",
  "outcome": "A joint root-cause report without either bank opening its systems to the other.",
  "iconKey": "Network",
  "accent": "violet",
  "solutions": [
    "AI Defense",
    "Splunk Agent Observability",
    "Splunk Agent Control"
  ],
  "signal": "Agent-to-agent",
  "stage": "Interactive",
  "mode": "live",
  "architectureId": "interbank-a2a",
  "runtimeId": "interbank",
  "workspaceKey": "interbank",
  "model": {
    "calls": "Both banks' Deep Agents",
    "applies": "Next investigation"
  },
  "assets": {
    "ui": "demos/interbank-a2a/ui/Workspace.tsx",
    "narrative": "demos/interbank-a2a/narrative.ts",
    "presenter": "demos/interbank-a2a/presenter-notes.ts"
  }
} satisfies DemoDefinition;
