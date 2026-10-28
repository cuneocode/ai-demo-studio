import type { Condition, Tour } from "../../app/guide/types";

const STARTED: Condition = { state: { run: ["running", "done", "blocked", "failed"] } };

export const bankingTour: Tour = {
  id: "brahe-bank",
  useCaseId: "brahe-bank",
  title: "Brahe Bank assistant",
  recording: "scripted-prompts",
  encores: ["brahe-bank.attack-scope"],
  steps: [
    {
      id: "banking.problem", kind: "observe", story: true, targets: ["banking.chat"],
      title: "Eligibility, from many places",
      body: "Customers piece together card eligibility from product documents and separate score checks. A supervisor agent routes each question to product and score specialists.",
    },
    {
      id: "banking.prompts", kind: "observe", targets: ["banking.suggestions"],
      showIf: { anchor: "banking.suggestions" },
      title: "Three scripted prompts",
      body: "Each prompt states its expected outcome: an answer, an AI Defense block, or a scope-control block. Clicked here, each one calls the live service.",
    },
    {
      id: "banking.ask", kind: "act", story: true, targets: ["banking.replay"],
      replay: { arg: "success", label: "Replay the recorded question" },
      waitFor: { state: { stage: ["answered"] } },
      waitingText: "Choose Replay the recorded question, or pick a turn from the highlighted menu.",
      title: "Replay a normal question",
      body: "This tour replays the same prompts as recorded from the live service. The supervisor hands off to the score specialist, which reads the mock score of 550.",
    },
    {
      id: "banking.answer", kind: "observe", story: true, targets: ["banking.answer"],
      title: "What answered, and what checked it",
      body: "Below the answer: the model that served it, latency, and each check’s actual verdict. Recorded fallbacks label historical results; they make no new model call.",
      ciscoFit: [
        {
          product: "Cisco AI Defense",
          how: "Inspects the question, each model call, and the answer; each result identifies the checks that ran.",
          status: "running",
          requires: { status: { service: "banking", aiDefense: "on" } },
          otherwise: "AI Defense isn't active for banking on this machine now; the verdicts shown are from the recording.",
        },
        {
          product: "Splunk Agent Control",
          how: "Scope, evidence-grounding, and no-approval-claims controls check each reply before release.",
          status: "running",
          requires: { status: { service: "banking", agentControl: "enforcing" } },
          otherwise: "Agent Control isn't enforcing for banking now; the control verdicts shown are from the recording.",
        },
      ],
    },
    {
      id: "banking.attack", kind: "act", story: true, targets: ["banking.replay"],
      replay: { arg: "ai-defense", label: "Replay the override attempt" },
      waitFor: { state: { stage: ["blocked-defense"] } },
      waitingText: "Choose Replay the override attempt.",
      title: "Try to override the rules",
      body: "This recorded prompt asks the assistant to reveal hidden instructions and bypass its safety policies.",
    },
    {
      id: "banking.blocked", kind: "observe", story: true, targets: ["banking.error"],
      title: "Inspect the actual guardrail outcome",
      body: "Inspect whether the request was blocked and which check acted. A configured control is not proof of a block; the displayed verdict and event ID are the evidence.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Checks prompt injection before the assistant answers; the displayed verdict identifies the actual outcome.",
        status: "running",
        requires: { status: { service: "banking", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for banking on this machine now; the block shown is from the recording.",
      }],
    },
    {
      id: "banking.stats", kind: "observe", targets: ["stats"],
      title: "Every turn, measured",
      body: "Model calls, handoffs, control decisions, and AI Defense verdicts per turn, from the service's own responses. Recorded turns are labelled recorded.",
      ciscoFit: [
        {
          product: "Splunk Agent Observability",
          how: "Each live turn is a trace with supervisor and specialist spans. A replay sends no new trace.",
          status: "running",
          requires: { status: { service: "banking", tracing: "configured" } },
          otherwise: "Agent tracing isn't configured for banking on this machine; counts come from each response.",
        },
        {
          product: "Splunk Observability Cloud",
          how: "The service can also export OTLP traces and metrics once an endpoint is configured.",
          status: "when-configured",
        },
      ],
    },
    {
      id: "banking.architecture", kind: "observe", tab: "architecture", targets: ["arch.rail"],
      title: "Explore the assistant architecture",
      body: "Expand Bank assistant, then a stage to reveal its components on the same canvas. Source panels explain inspection and control decisions. Layers add platform services; Back collapses one level and restores the framing.",
    },
  ],
};

export const bankingScopeTour: Tour = {
  id: "brahe-bank.attack-scope",
  useCaseId: "brahe-bank",
  title: "Attack: an off-topic request",
  recording: "scripted-prompts",
  encore: true,
  steps: [
    {
      id: "banking-scope.run", kind: "act", targets: ["banking.replay"],
      replay: { arg: "agent-controls", label: "Replay the cake recipe" },
      waitFor: STARTED,
      waitingText: "Choose Replay the cake recipe.",
      title: "Ask for a cake recipe",
      body: "A harmless request, but outside what a bank assistant should answer. This recording shows how the live service handled it.",
    },
    {
      id: "banking-scope.blocked", kind: "wait", targets: ["banking.error"],
      waitFor: { state: { stage: ["blocked-control"] } }, waitingText: "Replaying the recorded turn…",
      title: "Out of scope, refused",
      body: "AI Defense found nothing harmful. The Banking scope control refused the request, and no answer was released.",
      ciscoFit: [{
        product: "Splunk Agent Control",
        how: "Checks whether the request is in banking scope; the displayed verdict identifies the actual outcome.",
        status: "running",
        requires: { status: { service: "banking", agentControl: "enforcing" } },
        otherwise: "Agent Control isn't enforcing for banking now; the block shown is from the recording.",
      }],
    },
  ],
};
