import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
    headline: "A clearer route through customer onboarding",
    planned: true,
    sections: [
      { title: "Open the relationship with less uncertainty", paragraphs: [
        "A customer wants to open an account or complete a periodic review without repeated requests for the same information. Onboarding teams need to establish who they are dealing with and resolve exceptions. The operators of an AI-assisted process would need to protect identity documents and make every review decision accountable.",
      ] },
      { title: "Build around evidence and exceptions", paragraphs: [
        "Documents can be incomplete, names can differ across sources and ownership structures can be difficult to reconcile. Incorrect matches can delay a legitimate customer or leave a material risk unresolved. Automated processing would need explicit handling for uncertainty, failed checks and requests for additional evidence.",
        "The current demo is an illustrative queue and review workspace. The planned workflow would extract document fields, compare identities and entities with authorized sources, and route discrepancies to an analyst. Source evidence, confidence and review history would remain available beside each proposed finding.",
        "The proposed Cisco architecture places AI Defense around untrusted document text and model interactions, with Splunk Agent Observability tracing extraction and exception handling. Access controls and approval boundaries would preserve analyst ownership. These capabilities would support the evidence collection and review needed for customer due diligence.",
      ], option: { label: "Planned capability · AI infrastructure", text: "Document processing would be sized for onboarding volume, peak demand and sensitive-data handling. Private model serving and retention policies would be evaluated as part of the deployment design." } },
      { title: "Reviewing onboarding evidence and exceptions", paragraphs: [
        "The intended outcome is an onboarding operation that can explain its checks, prioritize exceptions and reduce avoidable rework. Customers would receive clearer requests and a more predictable path through the review, with their identity information handled carefully.",
      ] },
    ],
    references: [
      { id: "customer-diligence", evidence: "The illustrative queue highlights missing documents, identity discrepancies and beneficial-ownership review. Verified identity checks and institutional CDD procedures are planned work." },
      { id: "nist-ai", evidence: "The proposed workflow identifies evidence, uncertainty and human review as design requirements. Evaluation, monitoring and operational controls remain to be implemented." },
    ],
  } satisfies DemoNarrative;
