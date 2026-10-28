import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "kyc-processing",
  "title": "KYC processing",
  "description": "Review documents, verify entities, and route exceptions through a governed AI workflow.",
  "outcome": "Faster onboarding with reviewable decisions.",
  "iconKey": "Fingerprint",
  "accent": "blue",
  "solutions": [
    "AI Defense",
    "AI Infrastructure"
  ],
  "signal": "Document intake",
  "stage": "Planned",
  "mode": "illustrative",
  "architectureId": "kyc-processing",
  "assets": {
    "ui": null,
    "narrative": "demos/kyc-processing/narrative.ts",
    "presenter": "demos/kyc-processing/presenter-notes.ts"
  }
} satisfies DemoDefinition;
