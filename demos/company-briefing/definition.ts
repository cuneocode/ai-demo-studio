import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "company-briefing",
  "title": "Company briefing",
  "description": "Extract objectives, risks, obligations, AI initiatives, and XBRL metrics from an EDGAR filing or uploaded annual report.",
  "outcome": "Presenter-owned company context after a human accept-gate.",
  "iconKey": "Building2",
  "accent": "violet",
  "solutions": [
    "AI Defense",
    "Splunk Observability",
    "AI Infrastructure"
  ],
  "signal": "Filing extract",
  "stage": "In development",
  "mode": "live",
  "architectureId": "company-briefing",
  "runtimeId": "briefing",
  "workspaceKey": "briefing",
  "model": {
    "calls": "Deep Agent supervisor and theme subagents",
    "applies": "Next briefing"
  },
  "assets": {
    "ui": "demos/company-briefing/ui/Workspace.tsx",
    "narrative": "demos/company-briefing/narrative.ts",
    "presenter": "demos/company-briefing/presenter-notes.ts"
  }
} satisfies DemoDefinition;
