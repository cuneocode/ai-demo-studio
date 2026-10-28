import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
    headline: "Analyst review of suspected card fraud",
    sections: [
      { title: "Help when a card is compromised", paragraphs: [
        "A cardholder needs the bank to recognize suspicious activity and help them recover with as little disruption as possible. Fraud analysts need enough context to decide what to do. The teams operating the service must balance detection quality, customer friction and the consequences of acting on a misleading alert.",
      ] },
      { title: "From a risk score to an accountable decision", paragraphs: [
        "A payment can look ordinary on its own while its merchant connections reveal a wider compromise. Excessive alerts consume analyst time; missed patterns leave customers exposed. An agent that acts too freely can compound the harm by recommending the wrong intervention.",
        "This workflow compares rules with a graph-based fraud model, then brings together network relationships, model explanations and a response playbook. A triage agent drafts a cited account of the evidence. The analyst owns the disposition, and Agent Control gates proposed card actions on approval.",
        "Cisco AI Defense screens untrusted dispute text and the agent prompt. Splunk Agent Observability traces the investigation, helping operators connect model and tool activity to the draft. This evidence supports review of how an alert was handled; model validation and ongoing performance monitoring remain part of the operating program.",
      ], option: { label: "Deployment option · AI infrastructure", text: "The graph workload and language model have different serving needs. Production sizing should measure their throughput, latency and cost separately; Cisco infrastructure is a proposed production placement." } },
      { title: "Managing card compromise with less disruption", paragraphs: [
        "The intended outcome is a fraud operation with clearer decisions, controlled interventions and evidence for investigating mistakes. Cardholders benefit from a response that addresses the suspected compromise while keeping their legitimate banking needs in view.",
      ] },
    ],
    references: [
      { id: "model-risk", evidence: "Rules-versus-model results, network context and model explanations support examination of the predictive fraud model. The triage language model requires a separate AI risk assessment." },
      { id: "pci-dss", evidence: "The synthetic card workflow illustrates where payment evidence reaches the model, tools and analyst. Production data-flow scoping and security validation are still required." },
      { id: "agent-permissions", evidence: "Proposed card actions pass through an approval gate, with the analyst retaining the disposition decision." },
    ],
  } satisfies DemoNarrative;
