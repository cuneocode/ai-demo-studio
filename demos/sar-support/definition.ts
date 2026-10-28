import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "sar-support",
  "title": "SAR investigation",
  "description": "Assemble the case, match typologies, and draft a cited SAR narrative for investigator and QA approval.",
  "outcome": "A reviewable, cited draft in minutes; people decide and QA approves.",
  "iconKey": "FileSearch",
  "accent": "violet",
  "solutions": [
    "AI Defense",
    "Splunk Observability",
    "AI Infrastructure"
  ],
  "signal": "Investigation agent + cited narrative",
  "stage": "In development",
  "mode": "live",
  "architectureId": "sar-support",
  "runtimeId": "sar",
  "workspaceKey": "sar",
  "model": {
    "calls": "Investigation Deep Agent and narrative draft",
    "applies": "Next investigation",
    "clientData": true
  },
  "assets": {
    "ui": "demos/sar-support/ui/Workspace.tsx",
    "narrative": "demos/sar-support/narrative.ts",
    "presenter": "demos/sar-support/presenter-notes.ts"
  }
} satisfies DemoDefinition;
