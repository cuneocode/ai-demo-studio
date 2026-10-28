import type { DemoDefinition } from "../../config/demo-contract.ts";

export const definition = {
  "id": "transaction-llm",
  "title": "Transaction intelligence",
  "description": "Turn high-volume transaction data into searchable context for operations and risk teams.",
  "outcome": "Clearer payment activity and faster action.",
  "iconKey": "ReceiptText",
  "accent": "violet",
  "solutions": [
    "AI Infrastructure",
    "Splunk Observability"
  ],
  "signal": "Data enrichment",
  "stage": "Planned",
  "mode": "illustrative",
  "architectureId": "transaction-llm",
  "assets": {
    "ui": null,
    "narrative": "demos/transaction-llm/narrative.ts",
    "presenter": "demos/transaction-llm/presenter-notes.ts"
  }
} satisfies DemoDefinition;
