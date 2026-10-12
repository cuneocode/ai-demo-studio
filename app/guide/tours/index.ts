import type { Tour } from "../types";
import { advisoryPriyaTour, advisoryTour } from "./advisory.ts";
import { bankingScopeTour, bankingTour } from "./banking.ts";
import { briefingTour } from "./briefing.ts";
import { interbankKickoffTour, interbankTour } from "./interbank.ts";
import { fraudDisputeTour, fraudPiiTour, fraudTour } from "./fraud.ts";
import { kycTour } from "./kyc.ts";
import { LIFECYCLE_TOUR_ID, lifecycleTour } from "./lifecycle.ts";
import { researchPoisonedTour, researchRestrictedTour, researchTour } from "./research.ts";
import { sarInjectionTour, sarTour } from "./sar.ts";
import { offlineVariant, withStatusStep } from "./shared.ts";

export { LIFECYCLE_TOUR_ID };

type Service = Parameters<typeof offlineVariant>[1];

/** Demos that render the shared status banner when part of their path is down. */
const BANNERED = new Set<Service>(["fraud", "sar", "wealth"]);

/** Live-service tours get an offline variant; demos with the status banner also get the status step. */
function finish(tour: Tour, offline?: Service, label?: string): Tour {
  const steps = offline && BANNERED.has(offline) && !tour.encore ? withStatusStep(tour.steps) : tour.steps;
  const withSteps = { ...tour, steps };
  return offline && label ? { ...withSteps, ...offlineVariant(withSteps, offline, label) } : withSteps;
}

const ALL: Tour[] = [
  finish(fraudTour, "fraud", "Fraud triage"),
  finish(fraudDisputeTour),
  finish(fraudPiiTour),
  finish(sarTour, "sar", "SAR investigation"),
  finish(sarInjectionTour),
  finish(researchTour, "wealth", "Market research"),
  finish(researchPoisonedTour),
  finish(researchRestrictedTour),
  finish(advisoryTour, "wealth", "Meeting prep"),
  finish(advisoryPriyaTour),
  finish(interbankTour),
  finish(interbankKickoffTour),
  finish(bankingTour, "banking", "Brahe Bank"),
  finish(bankingScopeTour),
  finish(briefingTour, "briefing", "Company briefing"),
  finish(kycTour),
  finish(lifecycleTour),
];

export const TOURS: Record<string, Tour> = Object.fromEntries(ALL.map((tour) => [tour.id, tour]));

/** The use case's main tour; encores and the story are reached from it or from ⌘K. */
export function mainTourFor(caseId: string): Tour | null {
  return ALL.find((tour) => tour.useCaseId === caseId && !tour.encore && !tour.story) ?? null;
}
