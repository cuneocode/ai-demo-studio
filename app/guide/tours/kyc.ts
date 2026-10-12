import type { Tour } from "../types";

export const kycTour: Tour = {
  id: "kyc-processing",
  useCaseId: "kyc-processing",
  title: "KYC processing",
  label: "Illustrative prototype · no live service",
  steps: [
    {
      id: "kyc.label", kind: "observe", story: true, targets: ["kyc.label"],
      title: "An illustrative prototype",
      body: "No service runs behind this page. The values and the AI review show how KYC could work, not how it works here.",
    },
    {
      id: "kyc.metrics", kind: "observe", targets: ["kyc.metrics"],
      title: "Example queue metrics",
      body: "Open reviews, median age, and the auto-verified share are example figures, each marked Illustrative, not measurements.",
    },
    {
      id: "kyc.queue", kind: "observe", story: true, targets: ["kyc.queue"],
      title: "Dana Whitfield's refresh",
      body: "The lifecycle customer's periodic KYC refresh: sanctions clear, and a Section 16 officer of HCYN, so her employer-stock trades need pre-clearance.",
    },
    {
      id: "kyc.workbench", kind: "observe", story: true, targets: ["kyc.workbench"],
      title: "The analyst keeps approval",
      body: "Proposed: document models extract fields and context is assembled from registry and policy data. Only uncertain matches reach a person, who decides with evidence attached.",
    },
    {
      id: "kyc.stats", kind: "observe", targets: ["stats"],
      title: "What would be traced",
      body: "These cards show what an instrumented run would report. Nothing here is measured.",
      ciscoFit: [
        { product: "Splunk Agent Observability", how: "Proposed: trace each document extraction, model call, and analyst decision in one run.", status: "proposed" },
        { product: "Cisco AI Defense", how: "Proposed: inspect document text and every model hop for injected instructions and leaked identifiers.", status: "proposed" },
      ],
    },
    {
      id: "kyc.architecture", kind: "observe", tab: "architecture", targets: ["arch.mode"],
      title: "Proposed design only",
      body: "The map shows only the proposed design: document intelligence, entitled context, and exception review.",
      ciscoFit: [{ product: "Cisco AI infrastructure", how: "Proposed: GPU document models on Cisco AI infrastructure in the bank's data center.", status: "proposed" }],
    },
  ],
};
