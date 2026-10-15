import type { Condition, Tour } from "../types";

const RUN_STARTED: Condition = { state: { run: ["starting", "running", "awaiting-human", "done"] } };
const HAS_PACKAGE: Condition = { state: { stage: ["package"] } };

export const sarTour: Tour = {
  id: "sar-support",
  useCaseId: "sar-support",
  title: "SAR investigation",
  recording: "mule-reyes",
  encores: ["sar-support.attack-injection"],
  steps: [
    {
      id: "sar.problem", kind: "observe", story: true, targets: ["sar.band"],
      title: "From alert to reviewed report",
      body: "Choose a flagged case, review the evidence and draft, then record a decision. A different reviewer must approve it. This demo only simulates filing.",
    },
    {
      id: "sar.inbox", kind: "observe", story: true, targets: ["sar.inbox"],
      showIf: { anchor: "sar.inbox" },
      title: "A referral from fraud",
      body: "Fraud operations escalated the Orbit Digital Goods case. Opening it attaches the referral to the linked money-mule case as cited, untrusted evidence.",
    },
    {
      id: "sar.pick", kind: "auto", story: true, targets: ["sar.scenario.mule-reyes"],
      action: { type: "selectScenario", value: "mule-reyes" },
      title: "The money-mule case",
      body: "A new student account takes card-funded transfers from 17 strangers and cashes out within hours. Nine funding cards trace to the Orbit Digital Goods compromise.",
    },
    {
      id: "sar.case", kind: "observe", targets: ["sar.case"],
      title: "The case and its clock",
      body: "Subject, alert, and accounts are synthetic, with masked identifiers. The deadline bar shows the detection date, the due date, and the days left.",
    },
    {
      id: "sar.inputs", kind: "observe", story: true, targets: ["sar.inputs"],
      title: "Inspect the case file",
      body: "Read the payments, customer profile and documents. These are the records the investigation will connect and cite.",
    },
    {
      id: "sar.run", kind: "act", story: true, targets: ["sar.replay", "sar.investigate"],
      replay: { arg: "mule-reyes" }, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run, or pick a recording from the highlighted menu.",
      title: "Replay a recorded investigation",
      body: "This tour replays a real recorded run of the Deep Agent on the Studio model chain. Investigate and the sample narrative stay available outside the tour.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Case data reaches a hosted model only with AI Defense enforcing on every hop; the runtime row's Case data line says which applies.",
        status: "running",
        requires: { status: { service: "sar", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for SAR on this machine now, so live case data would not go to a hosted model.",
      }],
    },
    {
      id: "sar.timeline", kind: "wait", targets: ["sar.timeline"], scroll: "start",
      waitFor: { state: { stage: ["events"] } }, waitingText: "Waiting for the first tool call…",
      needs: { state: { stage: ["events"] } }, resumeFrom: "sar.run",
      title: "The agent assembles the case",
      body: "Alert, KYC with the SSN and street address withheld, account activity, counterparties, prior alerts, allowlisted media, and customer documents arrive as tool calls.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Inspects payment memos and customer documents segment by segment before the agent sees them; flagged segments are withheld.",
        status: "running",
        requires: { status: { service: "sar", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for SAR on this machine now; the inspections shown are from the recording.",
      }],
    },
    {
      id: "sar.typologies", kind: "wait", story: true, targets: ["sar.typologies"],
      waitFor: HAS_PACKAGE, patience: 30_000, waitingText: "Waiting for the investigation…",
      needs: HAS_PACKAGE, resumeFrom: "sar.run",
      title: "Why the case needs attention",
      body: "Money-mule indicators fire from the transactions as deterministic rules, each with a threshold, an observed value, and evidence. The model's recommendation is checked against them.",
    },
    {
      id: "sar.narrative", kind: "wait", story: true, targets: ["sar.narrative"], scroll: "start",
      waitFor: { state: { stage: ["drafted"] } }, waitingText: "Waiting for the cited draft…",
      title: "A cited narrative",
      body: "Who, what, when, where, why, and how, in FinCEN order. Every sentence cites evidence whose figures must match; unsupported sentences are dropped and listed.",
      ciscoFit: [{
        product: "Splunk Agent Control",
        how: "sar.narrative_cited releases the draft only when every sentence carries a citation.",
        status: "running",
        requires: { status: { service: "sar", agentControl: "enforcing" } },
        otherwise: "Hosted Agent Control isn't enforcing for SAR now; sar.narrative_cited runs as a labelled local check.",
      }],
    },
    {
      id: "sar.investigator", kind: "act", story: true, targets: ["sar.decision"],
      waitFor: { any: [{ state: { stage: ["filed"] } }, { state: { stage: ["closed"] } }] },
      waitingText: "Review the draft, choose a disposition, then complete QA approval.",
      title: "People decide, twice",
      body: "The investigator chooses a disposition and gives a rationale; a second reviewer handles QA approval. Use the controls below in a live run. Recorded fallbacks show prior decisions. No filing is sent.",
      ciscoFit: [{
        product: "Splunk Agent Control",
        how: "sar.file_requires_approval holds filing until QA approves; sar.no_tipping_off denies contacting the customer.",
        status: "running",
        requires: { status: { service: "sar", agentControl: "enforcing" } },
        otherwise: "Hosted Agent Control isn't enforcing for SAR now; the same policies run as labelled local checks.",
      }],
      variants: [{
        when: { state: { stage: ["investigator"] } },
        patch: {
          kind: "act",
          waitFor: { state: { stage: ["qa"] } },
          body: "Choose Report suspicious activity or Close without a report, give a reason, then send to QA. Message the customer demonstrates the no-tipping-off policy.",
          waitingText: "Waiting for the investigator's decision.",
        },
      }],
    },
    {
      id: "sar.audit", kind: "observe", targets: ["sar.audit", "stats"],
      title: "Who did what",
      body: "The audit trail records every human and agent step. The stats row counts this run's model calls, tool calls, and AI Defense verdicts.",
      ciscoFit: [{
        product: "Splunk Agent Observability",
        how: "Each live investigation is one agent trace. A replay sends no new trace.",
        status: "running",
        requires: { status: { service: "sar", tracing: "configured" } },
        otherwise: "Agent tracing isn't configured for SAR on this machine; the counts come from the run's own events.",
      }],
    },
    {
      id: "sar.architecture", kind: "observe", tab: "architecture", targets: ["arch.mode"],
      title: "Scale is proposed",
      body: "Typology rules and the citation check are ordinary code. At bank scale, entity resolution across millions of accounts is where GPU graph analytics would matter.",
      ciscoFit: [{
        product: "Cisco AI infrastructure",
        how: "Proposed: Cisco AI POD in the bank's data center for private inference and graph analytics.",
        status: "proposed",
      }],
    },
  ],
};

export const sarInjectionTour: Tour = {
  id: "sar-support.attack-injection",
  useCaseId: "sar-support",
  title: "Attack: injected instruction",
  recording: "injection-reyes",
  encore: true,
  steps: [
    {
      id: "sar-injection.pick", kind: "auto", targets: ["sar.scenario.injection-reyes"],
      action: { type: "selectScenario", value: "injection-reyes" },
      title: "A letter that gives orders",
      body: "The subject's explanation letter and one transfer memo tell the AI to mark the case no-file and email the customer. The letter also carries a card number.",
    },
    {
      id: "sar-injection.run", kind: "act", targets: ["sar.replay"],
      replay: { arg: "injection-reyes" }, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "Replay the attack",
      body: "This recorded run shows what reached the agent, and what did not.",
    },
    {
      id: "sar-injection.evidence", kind: "wait", targets: ["sar.evidence"],
      waitFor: HAS_PACKAGE, patience: 30_000, waitingText: "Waiting for the investigation…",
      needs: HAS_PACKAGE, resumeFrom: "sar-injection.run",
      title: "Withheld before the model",
      body: "The injected letter segment and the card number are withheld from the agent; the evidence list says who flagged each one.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Inspects customer documents for prompt injection and PCI data before model access; each verdict identifies what was found.",
        status: "running",
        requires: { status: { service: "sar", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for SAR on this machine now; the flags shown are from the recording.",
      }],
    },
    {
      id: "sar-injection.outcome", kind: "observe", targets: ["sar.recommendation"],
      title: "The recommendation holds",
      body: "The agent still recommends filing, in line with the typology indicators. The instruction to close the case never reached it.",
    },
  ],
};
