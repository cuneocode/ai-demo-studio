import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
    transformation: {
      friction: "Operations teams interpret inconsistent payment descriptions and fragmented records.",
      aiShift: "AI normalizes transaction context, resolves entities, and explains exceptions in plain language.",
      humanControl: "Operations and risk teams decide disposition for exceptions and sensitive actions.",
    },
    architecture: {
      process: [
        { title: "Ingest transactions", detail: "Payment records at volume" },
        { title: "Normalize and enrich", detail: "Entities, purpose, and codes" },
        { title: "Resolve exceptions", detail: "Review low-confidence records" },
        { title: "Publish downstream", detail: "Governed enriched data" },
      ],
      ai: [
        { point: "01 → 02", label: "Accelerated extraction", detail: "Proposed: GPU models parse payment text, resolve entities, and classify purpose at volume. Not built in this studio." },
        { point: "02 → 03", label: "RAG + context engineering", detail: "Ground exceptions in account, counterparty, policy, codes, and transaction history." },
        { point: "03 → 04", label: "Resolution agent", detail: "Propose normalized fields with evidence; low-confidence cases route to operations." },
      ],
    },
    metrics: [
      { label: "Transactions today", value: "184,203", detail: "Across 12 sources" },
      { label: "Exceptions", value: "42", detail: "0.02% of volume" },
      { label: "Median processing", value: "380 ms", detail: "Within target" },
    ],
    rows: [
      { name: "TXN-88421", stage: "Wire description", signal: "Entity unresolved", status: "Review", tone: "review" },
      { name: "TXN-88397", stage: "Merchant payment", signal: "Category confirmed", status: "Ready", tone: "ready" },
      { name: "TXN-88364", stage: "Cross-border transfer", signal: "Purpose review", status: "Pending", tone: "pending" },
    ],
    workbenchLabel: "Exception summary",
    workbenchTitle: "TXN-88421",
    workbenchSummary: "The payment narrative references a supplier name that does not resolve to the beneficiary record.",
    evidence: ["Payment message", "Entity graph", "Account history"],
    primaryAction: "Review example",
  } satisfies UseCaseFrame;
