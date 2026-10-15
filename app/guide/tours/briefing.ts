import type { Tour } from "../types";

export const briefingTour: Tour = {
  id: "company-briefing",
  useCaseId: "company-briefing",
  title: "Company briefing",
  recording: "halcyon-annual-report",
  steps: [
    {
      id: "briefing.problem", kind: "observe", story: true, targets: ["briefing.intake"],
      title: "A profile you can defend",
      body: "Account teams need a company profile before a meeting, and filings are long. This agent reads only EDGAR or an uploaded report, never the open web.",
    },
    {
      id: "briefing.run", kind: "act", story: true, targets: ["briefing.replay"],
      replay: { label: "Replay the recorded extract" },
      waitFor: { state: { stage: ["review"], source: ["recorded"] } },
      waitingText: "Choose Replay the recorded extract.",
      title: "Replay a recorded extract",
      body: "This tour replays a real extract of a synthetic annual report for Halcyon Interconnect, a fictional issuer. Ticker lookups and uploads run live outside the tour.",
    },
    {
      id: "briefing.review", kind: "observe", story: true, targets: ["briefing.review"],
      title: "Source and period",
      body: "The header names the document, its period, and whether it is synthetic, with the model that answered. Nothing is stored yet.",
    },
    {
      id: "briefing.themes", kind: "observe", story: true, targets: ["briefing.themes"], scroll: "start",
      title: "Cite or abstain",
      body: "Each theme keeps only facts with a verbatim excerpt. A theme with nothing grounded says abstain instead of guessing.",
    },
    {
      id: "briefing.metrics", kind: "observe", targets: ["briefing.metrics"],
      title: "Metrics from the filing",
      body: "Revenue, income, and EPS come from SEC XBRL facts or, for an upload like this, a verbatim table line. Each metric cites its excerpt, not model arithmetic.",
    },
    {
      id: "briefing.trail", kind: "observe", targets: ["briefing.trail"],
      title: "The agent's trail",
      body: "Plan, tools, and sections read are listed, and grounding reports how many uncited facts and metrics it dropped.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Inspects model hops and uploaded documents when enabled for this service.",
        status: "running",
        requires: { status: { service: "briefing", aiDefense: "on" } },
        otherwise: "AI Defense is off for briefing on this machine, and was off for this recording; the trail says so.",
      }],
    },
    {
      id: "briefing.accept", kind: "act", story: true, targets: ["briefing.accept"],
      waitFor: { state: { stage: ["accepted"] } },
      waitingText: "Use this company is your decision: press it to continue, or Skip.",
      title: "Nothing stored until you accept",
      body: "Use this company saves the profile in this browser only. Research and meeting prep can then use it.",
      variants: [{ when: { state: { stage: ["accepted"] } }, patch: { kind: "observe", body: "This company is in use, saved in this browser only. Research and meeting prep can use it." } }],
    },
    {
      id: "briefing.stats", kind: "observe", targets: ["stats"],
      title: "Measured from the run",
      body: "Live extracts report the calls made now. A replay shows historical counts from its original run, clearly labelled, and creates no new calls or traces.",
      ciscoFit: [{
        product: "Splunk Agent Observability",
        how: "Each live extract is one agent trace with tool spans. A replay sends no new trace.",
        status: "running",
        requires: { status: { service: "briefing", tracing: "configured" } },
        otherwise: "Agent tracing isn't configured for briefing on this machine.",
      }],
    },
    {
      id: "briefing.architecture", kind: "observe", tab: "architecture", targets: ["arch.mode"],
      title: "Implemented and proposed",
      body: "Implemented shows the EDGAR and upload pipeline as built. Proposed shows where it would run in production.",
      ciscoFit: [{
        product: "Cisco AI infrastructure",
        how: "Proposed: private inference for filings and uploads on Cisco AI infrastructure.",
        status: "proposed",
      }],
    },
  ],
};
