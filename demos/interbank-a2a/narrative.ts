import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
    headline: "Resolve the mismatch across bank boundaries",
    sections: [
      { title: "Give the client a clear path to settlement", paragraphs: [
        "A client expects a transaction to settle as agreed. When the banks' records disagree, operations teams must establish the cause and coordinate a correction. The teams running agent services need that collaboration to respect each bank's data boundary and preserve ownership of consequential changes.",
      ] },
      { title: "Coordinate the investigation with controlled access", paragraphs: [
        "Email exchanges and repeated record checks slow the investigation. Connecting agents introduces another risk: a peer's message can carry malicious instructions or request information beyond its authority. Operators need to see what crossed the boundary, what was blocked and which records informed the conclusion.",
        "Each fictional bank's Deep Agent investigates its own records and communicates with the other over A2A. AI gateways inspect the exchanged messages with Cisco AI Defense. Outbound controls constrain what an agent can send, and the agents' tools provide read-only access to their bank's records.",
        "The workflow produces a joint report with the proposed correction and the teams responsible for approval. Gateway verdicts, query activity and agent traces provide evidence for investigating failures across the two services. This visibility contributes to operational resilience oversight and helps operators understand the dependencies involved in a settlement investigation.",
      ], option: { label: "Deployment option · AI infrastructure", text: "Each bank can assess model placement and serving capacity within its own operating environment. Gateway and inference latency should be measured together when sizing the cross-bank workflow." } },
      { title: "Resolving the settlement mismatch", paragraphs: [
        "The intended outcome is an investigation both banks can follow, with controlled information exchange and human ownership of corrections. Operations teams gain a shared account of the mismatch, helping them give the client a clearer explanation and path toward settlement.",
      ] },
    ],
    references: [
      { id: "dora", evidence: "Separate bank services, gateway verdicts and agent activity expose dependencies and investigation evidence. Recovery testing, incident reporting and third-party governance remain production responsibilities." },
      { id: "agent-permissions", evidence: "Read-only investigation tools and outbound controls constrain agent authority. The report assigns corrective actions to human teams." },
      { id: "mas-ai", evidence: "Distinct bank boundaries, controlled communication and reviewable investigation outputs provide concrete inputs to an institution's AI risk assessment." },
    ],
  } satisfies DemoNarrative;
