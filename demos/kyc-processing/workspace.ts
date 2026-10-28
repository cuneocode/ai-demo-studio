import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
    transformation: {
      friction: "Analysts move between documents, registries, and screening tools to assemble a case, and periodic refreshes queue up behind onboarding.",
      aiShift: "Proposed: document models extract fields, entity resolution reconciles registries and screening hits, and only uncertain matches reach a person. Illustrative prototype; no live service.",
      humanControl: "Analysts keep approval authority with source evidence and policy context attached.",
    },
    architecture: {
      process: [
        { title: "Intake documents", detail: "Identity and entity records" },
        { title: "Verify identity", detail: "Registry and sanctions checks" },
        { title: "Assess exceptions", detail: "Risk and discrepancy review" },
        { title: "Approve onboarding", detail: "Analyst-owned decision" },
      ],
      ai: [
        { point: "01 → 02", label: "Document intelligence", detail: "Proposed: GPU-accelerated OCR and document models extract fields and detect mismatches. Not built in this studio." },
        { point: "02 → 03", label: "RAG + context engineering", detail: "Build an entitled case context from registry, ownership, policy, and prior-case data." },
        { point: "03 → 04", label: "Exception review", detail: "Summarize discrepancies with cited evidence; the analyst retains approval." },
      ],
    },
    metrics: [
      { label: "Open reviews", value: "24", detail: "7 need analyst review" },
      { label: "Median age", value: "2h 18m", detail: "Down 16% this week" },
      { label: "Auto-verified", value: "71%", detail: "Within policy threshold" },
    ],
    rows: [
      { name: "Chuck Robbins (fictional demo profile)", stage: "Periodic KYC refresh", signal: "Cisco Chair and CEO · sample screening clear", status: "Review", tone: "review" },
      { name: "Northstar Imports LLC", stage: "Business verification", signal: "2 documents missing", status: "Review", tone: "review" },
      { name: "Avery Chen", stage: "Identity match", signal: "Selfie mismatch", status: "Review", tone: "review" },
      { name: "Morrow Family Trust", stage: "Beneficial ownership", signal: "1 owner unverified", status: "Pending", tone: "pending" },
    ],
    workbenchLabel: "Next case",
    workbenchTitle: "Chuck Robbins (fictional demo profile)",
    workbenchSummary: "Chuck Robbins is Cisco’s Chair and CEO. This hypothetical banking profile uses sample screening results and a Medium risk rating; neither describes a real assessment. KYC is an illustrative prototype. The next demo shows a separate hypothetical card incident, not an outcome of this review.",
    evidence: ["Sanctions clear", "Cisco Chair and CEO", "Risk rating: Medium"],
    primaryAction: "Review next case",
  } satisfies UseCaseFrame;
