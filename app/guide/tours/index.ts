import type { Tour } from "../types";
import { vulnerabilityTour } from "./vulnerability.ts";
import { advisoryPriyaTour, advisoryTour } from "./advisory.ts";
import { bankingScopeTour, bankingTour } from "./banking.ts";
import { briefingTour } from "./briefing.ts";
import { interbankKickoffTour, interbankTour } from "./interbank.ts";
import { fraudDisputeTour, fraudPiiTour, fraudTour } from "./fraud.ts";
import { kycTour } from "./kyc.ts";
import { LIFECYCLE_TOUR_ID, lifecycleTour } from "./lifecycle.ts";
import { researchTour } from "./research.ts";
import { sarInjectionTour, sarTour } from "./sar.ts";

export { LIFECYCLE_TOUR_ID };

const LIVE_RUNS: Record<string, { targets: import("../types").Step["targets"]; title: string; body: string }> = {
  "brahe-bank": { targets: ["banking.composer"], title: "Ask the live assistant", body: "Run this question through the configured model and controls. The specialist reads synthetic banking data. Inspect the actual answer and checks; a recorded turn is an explicit fallback." },
  "fraud-modeling": { targets: ["fraud.run"], title: "Run live triage", body: "Score the flagged queue and run the triage agent on the selected scenario. Review actual scores, checks, and the analyst decision. If live execution fails, choose whether to replay a recording." },
  "company-briefing": { targets: ["briefing.intake"], title: "Extract a briefing live", body: "Enter a company or upload a report, then run the extraction with the configured model. Review its citations before accepting company context. A saved extract is available only as a fallback." },
  "market-research": { targets: ["research.run"], title: "Analyze company news", body: "Select Run live. The AI researches the selected company and checks its sources. Then review what changed, why it matters, and what advisors can discuss." },
  "client-advisory": { targets: ["advisory.run"], title: "Prepare the meeting live", body: "Run meeting preparation on the configured model using this session’s available context. Review the brief before supervision. The saved code-written sample is a fallback and cannot be approved." },
  "sar-support": { targets: ["sar.investigate"], title: "Investigate the case live", body: "Run the investigation with the configured model, evidence tools, and approval gates. No filing is sent. A recording or pre-written narrative is available only when you explicitly choose a fallback." },
  "interbank-a2a": { targets: ["interbank.start"], title: "Run the investigation live", body: "Start both banks’ agents through their gateways and review their actual report. The agents propose a correction for human approval. If the lab is unavailable, explicitly choose a recorded fallback." },
};

/** Guided runs use the same model routing as normal mode. */
function finish(tour: Tour): Tour {
  const steps = tour.steps;
  const withSteps = { ...tour, steps: steps.map(step => {
    const live = LIVE_RUNS[step.case ?? tour.useCaseId];
    if (!step.replay || !live) return step;
    const prompt = step.replay.arg === "ai-defense" ? { title: "Test the guardrail live", body: "Send the test prompt that asks for hidden instructions and a safety bypass. Inspect the real service’s response and verdict. A recorded block is available only as an explicit fallback." }
      : step.replay.arg === "agent-controls" ? { title: "Test banking scope live", body: "Ask the live banking assistant for a chocolate cake recipe. Inspect whether its scope control refuses the request. A recorded outcome is available only as an explicit fallback." } : {};
    return { ...step, ...live, ...prompt, waitingText: "Choose Run live, or explicitly select a recorded fallback.",
      ...(step.id === "briefing.run" ? { waitFor: { state: { stage: ["review"] } } } : {}) };
  }) };
  return withSteps; // The studio serves recordings even when Python services are stopped.
}

const ALL: Tour[] = [
  finish(vulnerabilityTour),
  finish(fraudTour),
  finish(fraudDisputeTour),
  finish(fraudPiiTour),
  finish(sarTour),
  finish(sarInjectionTour),
  finish(researchTour),
  finish(advisoryTour),
  finish(advisoryPriyaTour),
  finish(interbankTour),
  finish(interbankKickoffTour),
  finish(bankingTour),
  finish(bankingScopeTour),
  finish(briefingTour),
  finish(kycTour),
  finish(lifecycleTour),
];

export const TOURS: Record<string, Tour> = Object.fromEntries(ALL.map((tour) => [tour.id, tour]));

/** The use case's main tour; encores and the story are reached from it or from ⌘K. */
export function mainTourFor(caseId: string): Tour | null {
  return ALL.find((tour) => tour.useCaseId === caseId && !tour.encore && !tour.story) ?? null;
}
