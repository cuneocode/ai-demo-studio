import type { ServiceId, Step, Tour } from "../types";

export const STATUS_STEP_ID = "status";

/** Shown after step 1 whenever the demo renders its offline or degraded banner. */
export function statusStep(): Step {
  return {
    id: STATUS_STEP_ID, kind: "observe", targets: ["status-banner"],
    showIf: { anchor: "status-banner" },
    title: "Part of the path is offline",
    body: "Part of the live path is offline. The banner says what still works; this tour uses that path, and every result keeps its label.",
  };
}

export function withStatusStep(steps: Step[]): Step[] {
  if (!steps.length || steps.some((step) => step.id === STATUS_STEP_ID)) return steps;
  return [steps[0], statusStep(), ...steps.slice(1)];
}

/**
 * The short tour used when the demo's service is down, so its recorded runs cannot be served:
 * the problem, the offline banner, and the architecture. No run steps.
 */
export function offlineVariant(tour: Pick<Tour, "steps">, service: ServiceId, label: string): Pick<Tour, "offline" | "offlineWhen"> {
  const [problem] = tour.steps;
  const architecture = [...tour.steps].reverse().find((step) => step.tab === "architecture");
  const offline: Step = {
    id: "offline", kind: "observe", targets: ["status-banner"],
    title: `${label} is offline`,
    body: "Its service isn't reachable, so no run, live or recorded, can play here. The banner says how to start it. Source and architecture still work.",
    variants: [{
      when: { anchor: "status-banner", present: false },
      patch: { targets: [], body: "Its service isn't reachable, so no run, live or recorded, can play here. Start it from Studio settings. Source and architecture still work." },
    }],
  };
  return {
    offline: [{ ...problem, action: undefined, kind: "observe" }, offline, ...(architecture ? [architecture] : [])],
    offlineWhen: { status: { service, up: false } },
  };
}
