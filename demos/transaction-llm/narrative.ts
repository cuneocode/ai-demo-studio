import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
    headline: "Turn payment text into useful context",
    planned: true,
    sections: [
      { title: "Understand a payment without chasing its meaning", paragraphs: [
        "A customer asking about a payment expects the bank to understand who was paid and what the transaction represents. Operations teams often start with inconsistent descriptions and incomplete counterparty information. An AI enrichment service would need to make that information useful while preserving the original record and the limits of each interpretation.",
      ] },
      { title: "Reviewing uncertain payment details", paragraphs: [
        "Manual re-keying slows investigations and introduces inconsistent labels. At scale, a mistaken entity match can spread into downstream reporting or monitoring. Operators would need to distinguish extracted facts from inferred classifications and identify which records require review.",
        "The current demo is an illustrative workspace. The proposed workflow would batch transaction descriptions into structured fields, retain their source records and route low-confidence exceptions for agent-assisted review. Human reviewers would own corrections before the enriched context is relied on downstream.",
        "The proposed architecture uses Splunk Agent Observability to trace extraction and exception handling, with AI Defense inspecting untrusted text at the exception agent boundary. Where the output feeds AML monitoring, its provenance and quality would form part of the institution's broader monitoring controls. The enrichment service would have a defined responsibility for data quality and reliable delivery.",
      ], option: { label: "Planned capability · AI infrastructure", text: "Batch serving and selective agent use would be evaluated for throughput and cost. Capacity planning would measure volume, exception rates and latency before selecting a production serving arrangement." } },
      { title: "Using structured payment records in customer support", paragraphs: [
        "The intended outcome is a payment operation with more consistent context and a review path for uncertain records. Teams could spend less time reconstructing basic facts and give customers clearer answers about their transactions.",
      ] },
    ],
    references: [
      { id: "customer-diligence", evidence: "If used for AML monitoring, planned transaction enrichment could support understanding activity and investigating exceptions. The current workspace is illustrative; monitoring coverage and effectiveness require separate implementation." },
      { id: "dora", evidence: "The planned extraction and exception stages identify service dependencies that would need monitoring, failure handling and recovery testing in a covered EU deployment." },
      { id: "nist-ai", evidence: "Source preservation, uncertain classifications and human correction are proposed design controls. Their quality and effectiveness remain to be evaluated." },
    ],
  } satisfies DemoNarrative;
