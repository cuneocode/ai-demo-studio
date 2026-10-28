import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
    headline: "Banking answers customers can trust",
    sections: [
      {
        title: "A clearer path to the right banking option",
        paragraphs: [
          "A customer wants to understand a bank's products and what their credit profile means for eligibility. A conversational assistant can make that information easier to navigate. For the teams operating it, every answer also carries a responsibility: keep guidance grounded, protect the interaction, and deliver a responsive service.",
        ],
      },
      {
        title: "Confidence in every interaction",
        paragraphs: [
          "Unsupported answers and malicious instructions can mislead customers or redirect an agent, while unnecessary model calls add delay and cost. Security and platform teams need to understand what happened, enforce boundaries, and find the cause when an interaction goes wrong.",
          "Brahe routes questions through a supervisor and specialist agents that retrieve product information or a mock credit score. Cisco AI Defense inspects model inputs and outputs. Agent Control checks banking scope, evidence grounding, and unsupported approval claims, helping operators maintain clear customer communication.",
          "Splunk Agent Observability provides execution tracing. Reported model calls, tool calls, handoffs, tokens, and latency give teams evidence to investigate behavior and identify waste. The run statistics show the evidence returned by each request; runtime details describe the configured integrations.",
        ],
        option: {
          label: "Deployment option · AI infrastructure",
          text: "Private model serving gives operators a choice over data placement and capacity. Token and latency measurements help compare serving options and assess cost against actual demand.",
        },
      },
      {
        title: "Oversight of customer guidance",
        paragraphs: [
          "The intended outcome is a service operators can investigate, tune, and govern, with clearer evidence for oversight and more control over compute use. Customers receive more dependable guidance and a clearer next step, helping the bank earn their trust over time.",
        ],
      },
    ],
    references: [
      { id: "consumer-duty", evidence: "Product-source retrieval and checks on evidence grounding and approval claims give operators ways to review the assistant's answers." },
      { id: "ai-transparency", evidence: "The workspace identifies the AI assistant and labels its fictional products and mock credit score." },
      { id: "prompt-injection", evidence: "AI Defense inspects model inputs and outputs. Application checks enforce banking scope and response grounding. Run evidence exposes reported blocks and errors." },
    ],
  } satisfies DemoNarrative;
