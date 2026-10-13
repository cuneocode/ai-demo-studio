import type { Condition, Tour } from "../types";

const RUN_STARTED: Condition = { state: { run: ["running", "awaiting-human", "done"] } };
const HAS_RESULT: Condition = { state: { stage: ["result"] } };

export const advisoryTour: Tour = {
  id: "client-advisory",
  useCaseId: "client-advisory",
  title: "Advisor meeting prep",
  recording: "advisory-chuck-robbins",
  encores: ["client-advisory.attack-priya"],
  steps: [
    {
      id: "advisory.problem", kind: "observe", targets: ["advisory.intro"],
      title: "Hours of prep per review",
      body: "Jordan rebuilds each client's picture from profile, holdings, CRM notes, and the house view, and must document Reg BI care. Supervisors see the rationale days later.",
      variants: [{ when: { anchor: "advisory.intro", present: false }, patch: { targets: ["advisory.households"] } }],
    },
    {
      id: "advisory.household", kind: "auto", story: true, targets: ["advisory.household.chuck-robbins"],
      action: { type: "selectScenario", value: "chuck-robbins" },
      title: "Chuck Robbins's review",
      body: "Chuck Robbins is Cisco’s Chair and CEO. This hypothetical portfolio concentrates in fictional HCYN, an unrelated investment. Its financial figures and banking events are invented.",
    },
    {
      id: "advisory.context", kind: "observe", story: true, targets: ["advisory.context"],
      title: "What the advisor may see",
      body: "Context lists the house-view update, the company briefing, and at most one service event the client already knows about. Fraud and SAR work never appear here.",
    },
    {
      id: "advisory.run", kind: "act", story: true, targets: ["advisory.replay"],
      replay: {}, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "Replay the meeting prep",
      body: "This saved sample uses code to compare the hypothetical portfolio with its profile and build a brief. No model ran; it does not consume this session’s handoff.",
    },
    {
      id: "advisory.notes", kind: "wait", story: true, targets: ["advisory.notes"],
      waitFor: HAS_RESULT, waitingText: "Waiting for the meeting brief…",
      needs: HAS_RESULT, resumeFrom: "advisory.run",
      title: "CRM notes, screened first",
      body: "The saved sample screens invented notes with local rules. No model or AI Defense call was made. Live preparation can inspect notes before sending them to a model.",
      variants: [{
        when: { state: { stage: ["withheld"] } },
        patch: { body: "Notes are inspected before any model call. PII is masked and an injected instruction is withheld; each note names what was found and by which check." },
      }],
    },
    {
      id: "advisory.findings", kind: "observe", targets: ["advisory.findings"],
      title: "Profile against portfolio",
      body: "Each finding names the rule that fired, its category, and the Reg BI care note. These are code rules, not the model.",
    },
    {
      id: "advisory.actions", kind: "observe", targets: ["advisory.actions"],
      title: "Next-best actions, in dollars",
      body: "Code sizes each action. Unsuitable ones are flagged, and the supervisor's policy check would deny them. Toggle which go into the plan.",
    },
    {
      id: "advisory.brief", kind: "observe", targets: ["advisory.brief"], scroll: "start",
      title: "A checked one-page brief",
      body: "Every statement is checked against the household, research, or briefing, and struck lines are shown. The count says how many were verified.",
    },
    {
      id: "advisory.submit", kind: "act", story: true, targets: ["advisory.approval"],
      waitFor: { any: [{ state: { stage: ["approval-awaiting_supervisor"] } }, { state: { stage: ["approval-sent"] } }, { state: { stage: ["approval-denied"] } }, { state: { stage: ["approval-returned"] } }] },
      waitingText: "Submit for supervision is Jordan's decision: press it to continue, or Skip.",
      title: "Jordan submits",
      body: "The advisor checks the brief and the chosen actions, then submits them for supervision.",
      variants: [{
        when: { not: { state: { stage: ["approval-awaiting_advisor"] } } },
        patch: { kind: "observe", body: "A live model-generated brief requires advisor review. This code-written sample cannot be submitted for supervision." },
      }],
    },
    {
      id: "advisory.approve", kind: "act", story: true, targets: ["advisory.approval"],
      waitFor: { any: [{ state: { stage: ["approval-sent"] } }, { state: { stage: ["approval-denied"] } }, { state: { stage: ["approval-rejected"] } }] },
      waitingText: "Approve and record is the supervisor's decision: press it to continue, or Skip.",
      title: "Supervisor approves",
      body: "Approval runs the advisory.recommendation policies. Nothing is executed: no trade, transfer, or message leaves the studio.",
      ciscoFit: [{
        product: "Splunk Agent Control",
        how: "advisory.recommendation blocks promised returns, trade or wire instructions, and unsuitable recommendations at approval.",
        status: "running",
        requires: { status: { service: "wealth", agentControl: "enforcing" } },
        otherwise: "Hosted Agent Control isn't enforcing for wealth yet; the policy list says a local check evaluated it.",
      }],
      variants: [{
        when: { state: { stage: ["approval-unavailable"] } },
        patch: { kind: "observe", body: "This sample cannot be approved. Live model-generated briefs require supervisor review; approval records a simulated outcome and never executes a trade or transfer.", ciscoFit: [] },
      }, {
        when: { any: [{ state: { stage: ["approval-sent"] } }, { state: { stage: ["approval-denied"] } }, { state: { stage: ["approval-rejected"] } }] },
        patch: { kind: "observe" },
      }],
    },
    {
      id: "advisory.stats", kind: "observe", targets: ["advisory.timeline", "stats"], scroll: "start",
      title: "Measured from this run",
      body: "The timeline shows screening, rules, the agent and its reviewer, policies, and both approvals. Stats come from this run's events.",
      ciscoFit: [{
        product: "Splunk Agent Observability",
        how: "A live meeting-prep run is one agent trace. A replay sends no new trace.",
        status: "running",
        requires: { status: { service: "wealth", tracing: "configured" } },
        otherwise: "Agent tracing isn't configured for wealth on this machine; stats come from the run's own events.",
      }],
    },
    {
      id: "advisory.architecture", kind: "observe", tab: "architecture", targets: ["arch.mode"],
      title: "Client data stays private",
      body: "The value here is private inference for client data, not speed. Rules and action sizing are ordinary code.",
      ciscoFit: [{
        product: "Cisco AI infrastructure",
        how: "Proposed: Cisco AI POD in the bank's data center for private inference on client data.",
        status: "proposed",
      }],
    },
  ],
};

export const advisoryPriyaTour: Tour = {
  id: "client-advisory.attack-priya",
  useCaseId: "client-advisory",
  title: "Attack: PII and an injected instruction",
  recording: "advisory-priya-raman",
  encore: true,
  steps: [
    {
      id: "advisory-priya.household", kind: "auto", targets: ["advisory.household.priya-raman"],
      action: { type: "selectScenario", value: "priya-raman" },
      title: "A poisoned CRM note",
      body: "One of Priya Raman's CRM notes carries test PII and an instruction to wire proceeds, written to reach the model.",
    },
    {
      id: "advisory-priya.run", kind: "act", targets: ["advisory.replay"],
      replay: {}, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "Replay the recorded prep",
      body: "This recorded run shows what the meeting-prep agent was allowed to read.",
    },
    {
      id: "advisory-priya.notes", kind: "wait", targets: ["advisory.notes"],
      waitFor: HAS_RESULT, waitingText: "Waiting for the meeting brief…",
      needs: HAS_RESULT, resumeFrom: "advisory-priya.run",
      title: "Withheld from the model",
      body: "The note is withheld before any model call, and its masked identifiers name the check that found them. The brief is written without it.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Flagged prompt injection and PII in the note in this recording, alongside the local screen.",
        status: "running",
        requires: { status: { service: "wealth", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for wealth on this machine now; the flags shown are from the recording.",
      }],
    },
  ],
};
