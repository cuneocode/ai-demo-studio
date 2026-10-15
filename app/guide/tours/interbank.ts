import type { Condition, Tour } from "../types";

const STARTED: Condition = { state: { run: ["starting", "running", "done", "blocked", "failed"] } };

export const interbankTour: Tour = {
  id: "interbank-a2a",
  useCaseId: "interbank-a2a",
  title: "Interbank settlement investigation",
  recording: "trd-847-allowed",
  encores: ["interbank-a2a.attack-kickoff"],
  steps: [
    {
      id: "interbank.problem", kind: "observe", story: true, targets: ["interbank.controls"],
      title: "Settlement fails, chased by email",
      body: "Two fictional banks chase a failed trade by phone and email, re-keying each other's records. Here each bank's read-only Deep Agent investigates its own side.",
    },
    {
      id: "interbank.offline", kind: "observe", targets: ["interbank.offline"],
      showIf: { status: { service: "interbank", up: false } },
      title: "The lab is offline",
      body: "Live runs need the Docker lab. Start it to run the real agents and gateways; if unavailable, explicitly choose a labelled recording.",
    },
    {
      id: "interbank.scenario", kind: "observe", targets: ["interbank.scenarios", "interbank.kickoff"],
      title: "Trade TRD-847",
      body: "The kickoff is an A2A message to Bank A's agent through Bank A's AI gateway. Bank A's agent decides when to ask Bank B.",
    },
    {
      id: "interbank.run", kind: "act", story: true, targets: ["interbank.replay"],
      replay: { arg: "trd-847-allowed" }, waitFor: STARTED,
      waitingText: "Choose Replay the recorded run, or pick a recording from the highlighted menu.",
      title: "Replay a recorded investigation",
      body: "This tour replays a real run of the Docker lab: two Deep Agents, two gateways, and real inspections. Start investigation runs live outside the tour.",
    },
    {
      id: "interbank.bank-a", kind: "wait", story: true, targets: ["interbank.bank-a"],
      waitFor: { state: { stage: ["bank-a"] } }, waitingText: "Waiting for Bank A's agent…",
      needs: { state: { stage: ["bank-a"] } }, resumeFrom: "interbank.run",
      title: "Bank A investigates",
      body: "Bank A's agent plans, then queries its own settlement records with read-only SQL. It never sees Bank B's database.",
    },
    {
      id: "interbank.wire", kind: "wait", story: true, targets: ["interbank.wire"],
      waitFor: { state: { stage: ["wire"] } }, waitingText: "Waiting for the first gateway inspection…",
      title: "Every hop inspected",
      body: "Each A2A request and response crosses both banks' gateways. Verdicts appear here per listener, with event IDs.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Inspects every A2A hop at agentgateway through an ext-proc, failing closed.",
        status: "running",
        requires: { status: { service: "interbank", aiDefense: "on" } },
        otherwise: "The lab isn't running now, so no gateway is inspecting; the verdicts shown are from the recording.",
      }],
    },
    {
      id: "interbank.bank-b", kind: "wait", targets: ["interbank.bank-b"],
      waitFor: { state: { stage: ["bank-b"] } }, waitingText: "Waiting for Bank A to reach out over A2A…",
      title: "Bank B answers",
      body: "Bank B's agent answers only from its own data. Before any message leaves a bank, an outbound control checks what may be shared.",
      ciscoFit: [{
        product: "Splunk Agent Control",
        how: "Each bank's outbound-confidentiality control evaluates every A2A message before it is sent; this run shows three allows.",
        status: "running",
        requires: { status: { service: "interbank", agentControl: "enforcing" } },
        otherwise: "The lab isn't running now, so no control is evaluating; the decisions shown are from the recording.",
      }],
    },
    {
      id: "interbank.report", kind: "wait", story: true, targets: ["interbank.report"],
      waitFor: { state: { stage: ["report"] } }, patience: 45_000, waitingText: "Replaying the investigation…",
      title: "A joint report for people",
      body: "Bank A's agent reports root cause, evidence, exposure, and proposed fixes. Agents are read-only; named teams approve fixes, and no funds move.",
    },
    {
      id: "interbank.stats", kind: "observe", targets: ["stats"],
      title: "One trace, two banks",
      body: "Model calls, A2A sends, SQL queries, control decisions, and gateway inspections are counted from this run's events.",
      ciscoFit: [{
        product: "Splunk Agent Observability",
        how: "A live run is one trace across the ops desk, both gateways, both agents, and each control. A replay sends no new trace.",
        status: "running",
        requires: { status: { service: "interbank", tracing: "configured" } },
        otherwise: "The lab isn't running now, so nothing is traced; counts come from the recording's events.",
      }],
    },
    {
      id: "interbank.code", kind: "observe", targets: ["interbank.integrations"],
      title: "See the code",
      body: "Each button opens the captured source excerpt the architecture map cites, and says if the file has changed since.",
    },
    {
      id: "interbank.architecture", kind: "observe", tab: "architecture", targets: ["arch.canvas"],
      title: "The system map",
      body: "Two banks, two gateways, one inspection service, and one control plane. Select a stage to see what runs there.",
    },
  ],
};

export const interbankKickoffTour: Tour = {
  id: "interbank-a2a.attack-kickoff",
  useCaseId: "interbank-a2a",
  title: "Attack: prompt-injection kickoff",
  recording: "trd-847-blocked",
  encore: true,
  steps: [
    {
      id: "interbank-kickoff.run", kind: "act", targets: ["interbank.replay"],
      replay: { arg: "trd-847-blocked" }, waitFor: STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "A kickoff that gives orders",
      body: "This recorded kickoff tells Bank A's agent to ignore its safety rules and have Bank B wire funds. It reached Bank A's gateway in a real lab run.",
    },
    {
      id: "interbank-kickoff.report", kind: "wait", targets: ["interbank.report"],
      waitFor: { state: { stage: ["report"] } }, waitingText: "Replaying the gateway's verdict…",
      title: "Stopped at the gateway",
      body: "The gateway refused it, with the AI Defense classifications and event ID. Neither agent received the message, so nothing was investigated.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Inspects the kickoff at Bank A’s gateway; the displayed verdict shows whether it was blocked.",
        status: "running",
        requires: { status: { service: "interbank", aiDefense: "on" } },
        otherwise: "The lab isn't running now; the block shown is from the recording.",
      }],
    },
  ],
};
