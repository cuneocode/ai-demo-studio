import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "brahe-bank",
  "title": "Brahe Bank assistant",
  "description": "Explore product questions and credit eligibility with a supervisor and specialist agents.",
  "outcome": "See retrieval, agent handoffs, and evaluation in a working conversation.",
  "iconKey": "Landmark",
  "accent": "blue",
  "solutions": [
    "AI Defense",
    "Splunk OTLP (optional)",
    "Galileo"
  ],
  "signal": "Interactive banking",
  "stage": "Interactive",
  "mode": "live",
  "architectureId": "brahe-bank",
  "runtimeId": "banking",
  "workspaceKey": "banking",
  "model": {
    "calls": "Supervisor, both specialists, and the quality judge",
    "applies": "Next message; open conversations restart"
  },
  "assets": {
    "ui": "demos/brahe-bank/ui/Workspace.tsx",
    "narrative": "demos/brahe-bank/narrative.ts",
    "presenter": "demos/brahe-bank/presenter-notes.ts"
  }
} satisfies DemoDefinition;
