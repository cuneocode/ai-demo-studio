import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
    headline: "Start the conversation with facts that hold up",
    sections: [
      { title: "Understand the company before the meeting", paragraphs: [
        "An account team wants to understand a customer's priorities before discussing how to help. Annual reports contain useful detail, spread across long sections and financial tables. For the teams operating an AI briefing service, the responsibility is to preserve the meaning and provenance of that information as it becomes a concise company profile.",
      ] },
      { title: "Keep the source connected to the summary", paragraphs: [
        "A misplaced metric or unsupported interpretation can send a conversation in the wrong direction. Uploaded material can also contain instructions intended to redirect the model. Operators need to know which document was read, which facts were used and how an answer was assembled.",
        "The briefing agent works from an EDGAR filing or an uploaded annual report. It navigates document sections and retrieves financial facts to assemble objectives, risks, obligations and AI initiatives. The user reviews the result before accepting it as the studio's company context.",
        "Cisco AI Defense inspects model interactions and uploaded content. Splunk Agent Observability traces the agent's tool activity, giving operators a way to examine the path from source to briefing. Source references and the acceptance step support accountable review. Extracted statements about a company's obligations still need assessment in their business and jurisdictional context.",
      ], option: { label: "Deployment option · AI infrastructure", text: "Document size and repeated extraction affect capacity and cost. Private serving can be evaluated against data-handling needs and measured document-processing demand." } },
      { title: "Using the briefing in customer meetings", paragraphs: [
        "The intended outcome is a briefing process that operators can inspect and improve, with clear ownership of accepted company context. Account teams arrive better prepared, and the customer receives a conversation grounded in their stated priorities.",
      ] },
    ],
    references: [
      { id: "nist-ai", evidence: "Document provenance, tool activity and explicit acceptance of company context provide concrete points for quality assessment and accountable review." },
      { id: "prompt-injection", evidence: "Uploaded documents and model interactions are inspected by AI Defense. The source boundary is the selected filing or upload." },
      { id: "finra-supervision", evidence: "When a member firm uses a briefing in a covered securities workflow, source references and human acceptance can contribute to its review process. A general account-planning briefing has a different applicability assessment." },
    ],
  } satisfies DemoNarrative;
