import type { CiscoFit, Condition, Tour } from "../types";

const RUN_STARTED: Condition = { state: { run: ["starting", "running", "awaiting-human", "done"] } };

const defense: CiscoFit = {
  product: "Cisco AI Defense",
  how: "Inspects the agent's prompt and its summary before release; the AI Defense chip on the summary shows the verdict.",
  status: "running",
  requires: { status: { service: "fraud", aiDefense: "on" } },
  otherwise: "AI Defense isn't active for fraud on this machine now. A recorded run's chip shows what it found when recorded.",
};

const takeAction: CiscoFit = {
  product: "Splunk Agent Control",
  how: "fraud.take_action denies irreversible card actions, such as block and reissue, until the analyst approves.",
  status: "running",
  requires: { status: { service: "fraud", agentControl: "enforcing" } },
  otherwise: "Hosted Agent Control isn't enforcing for fraud now; the same fraud.take_action rule runs as a labelled local check.",
};

export const fraudTour: Tour = {
  id: "fraud-modeling",
  useCaseId: "fraud-modeling",
  title: "Card fraud triage",
  recording: "cpp-orbit-escalate-live",
  encores: ["fraud-modeling.attack-dispute", "fraud-modeling.attack-pii"],
  steps: [
    {
      id: "fraud.problem", kind: "observe", story: true, targets: ["fraud.band"],
      title: "The queue Maya works",
      body: "Rules score one payment at a time, so a clean customer at a compromised merchant sails through and real fraud hides among false positives. Tiles marked Illustrative are targets, not measurements.",
    },
    {
      id: "fraud.scenario", kind: "auto", story: true, targets: ["fraud.scenario.cpp-orbit"],
      action: { type: "selectScenario", value: "cpp-orbit" },
      title: "A compromised merchant",
      body: "A long-tenured card spends $286.40 online at Orbit Digital Goods. Each scenario card says what the graph model can honestly score, and what to expect.",
    },
    {
      id: "fraud.run", kind: "act", story: true, targets: ["fraud.replay"],
      replay: { arg: "cpp-orbit-escalate-live" },
      waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run, or pick a recording from the highlighted menu.",
      title: "Replay a recorded triage",
      body: "This tour replays a real recorded run: five flagged payments scored, then the triage agent on the top alert. Live triage stays available outside the tour.",
    },
    {
      id: "fraud.queue", kind: "wait", targets: ["fraud.queue"],
      waitFor: { state: { stage: ["scored"] } }, waitingText: "Scoring five flagged payments…",
      needs: { state: { stage: ["scored"] } }, resumeFrom: "fraud.run",
      title: "Rules and graph, side by side",
      body: "Each payment gets a rules score and a GraphSAGE + XGBoost score from its account–merchant neighborhood. The badge says where the scores came from.",
      ciscoFit: [{
        product: "Cisco AI infrastructure",
        how: "Scoring runs on Sparky, an NVIDIA DGX Spark dev box; Cisco UCS or AI POD with NVIDIA GPUs is the proposed production placement.",
        status: "proposed",
      }],
    },
    {
      id: "fraud.verdicts", kind: "wait", story: true, targets: ["fraud.verdicts"],
      waitFor: { state: { stage: ["verdicts"] } }, waitingText: "Opening the top alert…",
      needs: { state: { stage: ["verdicts"] } }, resumeFrom: "fraud.run",
      title: "The payment rules approve",
      body: "Rules approve this purchase; the graph model rates it high risk. The risk sits in the merchant's network, not in the payment itself.",
    },
    {
      id: "fraud.network", kind: "wait", story: true, targets: ["fraud.network"],
      action: { type: "click", anchor: "fraud.show-network" },
      waitFor: { state: { stage: ["network"] } }, waitingText: "Loading the merchant's neighborhood…",
      showIf: { any: [{ state: { stage: ["network"] } }, { not: { state: { run: ["done"] } } }] },
      title: "The merchant's network",
      body: "Cards that shopped at this merchant and later had confirmed fraud surround it. That neighborhood is what the graph model sees and the rules cannot.",
    },
    {
      id: "fraud.reasons", kind: "wait", targets: ["fraud.reasons"],
      waitFor: { state: { stage: ["reasons"] } }, waitingText: "Explaining the score…",
      title: "Why, in plain English",
      body: "With live graph scores, exact XGBoost TreeSHAP contributions become these reason codes; positive raises risk. Until Sparky scores, they are labelled sample. No language model touches the score.",
    },
    {
      id: "fraud.agent", kind: "wait", targets: ["fraud.summary", "fraud.timeline"],
      waitFor: { state: { stage: ["summary"] } }, patience: 30_000,
      waitingText: "Replaying the agent's tool calls and summary…",
      needs: { state: { stage: ["summary"] } }, resumeFrom: "fraud.run",
      title: "The triage agent's draft",
      body: "The agent calls scoring, neighborhood, explanation, and playbook tools, then drafts a summary where every point cites tool evidence. A citation check counts the backed points.",
      ciscoFit: [defense],
    },
    {
      id: "fraud.decide", kind: "wait", story: true, targets: ["fraud.decision"],
      waitFor: { state: { stage: ["decided"] } }, waitingText: "Replaying the analyst's decision…",
      title: "Maya decides",
      body: "The agent only proposes. In this recorded run Maya chose Escalate to investigations, and the decision replays as made. Card actions are simulated.",
      ciscoFit: [takeAction],
      variants: [{
        when: { state: { run: ["awaiting-human"] } },
        patch: {
          kind: "act",
          body: "The agent only proposes. Choose a disposition: card actions are simulated, and irreversible ones need your approval. For the lifecycle story, choose Escalate to investigations.",
          waitingText: "Waiting for your disposition.",
        },
      }],
    },
    {
      id: "fraud.handoff", kind: "observe", story: true, targets: ["fraud.handoff"],
      showIf: { state: { stage: ["handoff"] } },
      title: "A SAR referral, drafted",
      body: "Escalation drafts a SAR referral with its evidence and transactions attached. Escalate to SAR hands it to the investigations team, where the lifecycle story continues.",
    },
    {
      id: "fraud.audit", kind: "observe", targets: ["fraud.audit", "fraud.shared"],
      title: "Audit, and what's shared",
      body: "Every agent step and analyst decision lands on the audit trail. Only what the customer already knows, such as a reissued card, is shared with the relationship team.",
    },
    {
      id: "fraud.stats", kind: "observe", targets: ["stats"],
      title: "Measured from this run",
      body: "Latency, model calls, tool calls, and tokens come from the run's own events. The badge repeats that this run is recorded, with its date.",
      ciscoFit: [
        {
          product: "Splunk Agent Observability",
          how: "Each live triage run is one agent trace with a span per tool and model call. A replay sends no new trace.",
          status: "running",
          requires: { status: { service: "fraud", tracing: "configured" } },
          otherwise: "Agent tracing isn't configured for fraud on this machine; the counts still come from the run's own events.",
        },
        {
          product: "Cisco AI Defense",
          how: "The defense card counts this run's inspections and blocks from its security summary.",
          status: "running",
          requires: { status: { service: "fraud", aiDefense: "on" } },
          otherwise: "AI Defense isn't active for fraud now, so the defense card claims no live inspections.",
        },
      ],
    },
    {
      id: "fraud.architecture", kind: "observe", tab: "architecture", targets: ["arch.mode"],
      title: "Where it would run",
      body: "Implemented shows what runs in this studio. Proposed shows the production design. Nothing here runs on Cisco hardware today.",
      ciscoFit: [{
        product: "Cisco AI infrastructure",
        how: "Proposed: GNN training and scoring on Cisco AI POD or UCS with NVIDIA GPUs on a Nexus fabric.",
        status: "proposed",
      }],
    },
  ],
};

export const fraudDisputeTour: Tour = {
  id: "fraud-modeling.attack-dispute",
  useCaseId: "fraud-modeling",
  title: "Attack: injected dispute note",
  recording: "attack-dispute-injection-live",
  encore: true,
  steps: [
    {
      id: "fraud-dispute.scenario", kind: "auto", targets: ["fraud.scenario.attack-dispute-injection"],
      action: { type: "selectScenario", value: "attack-dispute-injection" },
      title: "An instruction aimed at the AI",
      body: "The cardholder's dispute chat carries a hidden instruction telling the triage engine to approve and close the case.",
    },
    {
      id: "fraud-dispute.run", kind: "act", targets: ["fraud.replay"],
      replay: { arg: "attack-dispute-injection-live" }, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "Replay the attack",
      body: "This recorded run shows what happened when the injected note reached the triage service.",
    },
    {
      id: "fraud-dispute.verdict", kind: "wait", targets: ["fraud.dispute"],
      waitFor: { state: { stage: ["dispute-checked"] } }, waitingText: "Inspecting the dispute note…",
      needs: { state: { stage: ["dispute-checked"] } }, resumeFrom: "fraud-dispute.run",
      title: "Blocked before the agent",
      body: "The note is untrusted input. It was flagged as prompt injection, and the agent never saw it; triage continued on the evidence alone.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Inspects every untrusted note before the agent; in this recording it flagged Prompt Injection and withheld the note.",
        status: "running",
        requires: { status: { service: "fraud", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for fraud on this machine now; the verdict shown is from the recording.",
      }],
    },
  ],
};

export const fraudPiiTour: Tour = {
  id: "fraud-modeling.attack-pii",
  useCaseId: "fraud-modeling",
  title: "Attack: card number in a case note",
  recording: "attack-note-pii-scripted",
  encore: true,
  steps: [
    {
      id: "fraud-pii.scenario", kind: "auto", targets: ["fraud.scenario.attack-note-pii"],
      action: { type: "selectScenario", value: "attack-note-pii" },
      title: "A card number in a note",
      body: "An analyst pastes a full card number and SSN into the case note, the kind of slip that leaks data into case systems.",
    },
    {
      id: "fraud-pii.run", kind: "act", targets: ["fraud.replay"],
      replay: { arg: "attack-note-pii-scripted" }, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "Replay the recorded case",
      body: "This recorded run uses the scripted summary, with no model call, and keeps the note checks as they ran.",
    },
    {
      id: "fraud-pii.blocked", kind: "wait", targets: ["fraud.timeline"],
      waitFor: { state: { stage: ["decided"] } }, waitingText: "Replaying the note checks…",
      needs: { state: { stage: ["summary"] } }, resumeFrom: "fraud-pii.run",
      title: "The save is denied",
      body: "The timeline shows the note flagged for a card number, then fraud.note_pii denying the save. The re-entered note, last 4 only, passes both checks.",
      ciscoFit: [
        {
          product: "Cisco AI Defense",
          how: "Inspects each case note for PCI data and flagged the full card number in this recording.",
          status: "running",
          requires: { status: { service: "fraud", aiDefense: "on" } },
          otherwise: "AI Defense isn't active for fraud on this machine now; the flag shown is from the recording.",
        },
        {
          product: "Splunk Agent Control",
          how: "fraud.note_pii denies saving a note that contains a card number or SSN.",
          status: "running",
          requires: { status: { service: "fraud", agentControl: "enforcing" } },
          otherwise: "Hosted Agent Control isn't enforcing for fraud now; fraud.note_pii runs as a labelled local check.",
        },
      ],
    },
  ],
};
