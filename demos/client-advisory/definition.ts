import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "client-advisory",
  "title": "Advisor meeting prep",
  "description": "AI reviews a client’s investments and notes, flags concerns, and prepares a meeting brief for human approval.",
  "outcome": "A clear meeting agenda and proposed actions, with people in control.",
  "iconKey": "WalletCards",
  "accent": "amber",
  "solutions": [
    "AI Defense",
    "Splunk Observability",
    "AI Infrastructure"
  ],
  "signal": "Meeting-prep Deep Agent · AI Defense on client data",
  "stage": "In development",
  "mode": "live",
  "architectureId": "client-advisory",
  "runtimeId": "advisory",
  "workspaceKey": "advisory",
  "model": {
    "calls": "Meeting-prep Deep Agent",
    "applies": "Next run",
    "clientData": true
  },
  "assets": {
    "ui": "demos/client-advisory/ui/Workspace.tsx",
    "narrative": "demos/client-advisory/narrative.ts",
    "presenter": "demos/client-advisory/presenter-notes.ts"
  }
} satisfies DemoDefinition;
