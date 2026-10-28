import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
    liveExperience: "interbank",
    transformation: {
      friction: "Settlement fails are chased by email and phone between banks, each re-keying the other's records.",
      aiShift: "Each bank's Deep Agent investigates its own records and asks the other bank's agent over A2A, through both banks' AI gateways.",
      humanControl: "Agents are read-only. Named operations teams approve SSI and instruction fixes; no funds move.",
    },
    architecture: {
      process: [
        { title: "Open the failed settlement", detail: "Ops desk kickoff to Bank A's agent" },
        { title: "Investigate own records", detail: "Read-only SQL on Bank A's data" },
        { title: "Coordinate with the counterparty", detail: "A2A to Bank B through both gateways" },
        { title: "Approve remediation", detail: "Each bank's team decides" },
      ],
      ai: [
        { point: "01 → 02", label: "Bank A Deep Agent", detail: "Plans the investigation, queries Bank A's settlement records, and decides what to ask Bank B." },
        { point: "02 → 03", label: "Counterparty agent over A2A", detail: "Bank B's Deep Agent answers from its own records. Every message passes Agent Control, both gateways, and AI Defense." },
        { point: "03 → 04", label: "Joint root-cause report", detail: "Bank A's agent reports root cause, evidence, exposure, and proposed fixes for human approval." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Interbank investigation",
    workbenchTitle: "TRD-847",
    workbenchSummary: "A delivery-versus-payment trade failed to match between Harbor Point Bank and Meridian Trust.",
    primaryAction: "Start investigation",
  } satisfies UseCaseFrame;
