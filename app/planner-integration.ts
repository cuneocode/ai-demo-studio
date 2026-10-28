import { appStorageKey, readStored, writeStored } from "./studio/storage.ts";
import type { ObservedRun } from "./RunStats";

/** Browser contract v1. The planner implementation is loaded from its own release. */
export type PlannerSection = "/" | "/genai-sizing" | "/bom-builder" | "/cluster-topology" | "/rack-layout" | "/tco-calculator" | "/results";
export const PLANNER_SECTIONS: { path: PlannerSection; label: string }[] = [
  { path: "/genai-sizing", label: "Requirements" },
  { path: "/bom-builder", label: "Design / BOM" },
  { path: "/cluster-topology", label: "Topology" },
  { path: "/rack-layout", label: "Racks" },
  { path: "/tco-calculator", label: "Costs / TCO" },
  { path: "/results", label: "Review" },
];

export const PLANNER_DEFAULT_MODEL_ID = "zai-org/GLM-5.3";
export type PlannerConnection = { configured: boolean; bundleUrl?: string; apiBaseUrl?: string; error?: string };
export type PlannerInitialization = {
  version: 1; source: "demo-studio"; useCaseId: string; assessmentId: string;
  assessment: { name: string; businessObjective: string };
  workloads: {
    id: string; modelId?: string;
    measurements?: { modelCalls?: number; inputTokens?: number; outputTokens?: number };
    provenance?: { kind: "measured" | "reported"; system: string; capturedAt?: string };
  }[];
};
export type PlannerElement = HTMLElement & {
  initialize: (seed: PlannerInitialization, options: {
    apiBaseUrl: string; analytics: { enabled: false; endpoint: string };
    initialSection: PlannerSection; showNavigation: false;
  }) => void;
  navigate: (section: PlannerSection) => void;
};

const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1e15 ? value : undefined;
/** Import one completed observation. Business demand is intentionally absent. */
export function plannerInitialization(useCaseId: string, assessmentId: string, title: string, objective: string, run?: ObservedRun): PlannerInitialization {
  const observed = run && ["completed", "cached"].includes(run.status) && run.provenance !== "sample" ? run : undefined;
  const measurements = observed ? {
    modelCalls: count(observed.llmCalls), inputTokens: count(observed.inputTokens), outputTokens: count(observed.outputTokens),
  } : {};
  const known = Object.values(measurements).some(value => value !== undefined);
  const captured = observed?.provenance === "recorded" ? observed.recordedAt : observed?.startedAt;
  const stamp = captured === undefined ? NaN : new Date(captured).getTime();
  return {
    version: 1, source: "demo-studio", useCaseId, assessmentId,
    assessment: { name: title.slice(0, 200), businessObjective: objective.slice(0, 2000) },
    workloads: [{ id: "inference", modelId: PLANNER_DEFAULT_MODEL_ID, ...(known ? {
      measurements,
      provenance: {
        kind: observed?.provenance === "recorded" ? "reported" as const : "measured" as const,
        system: observed?.provenance === "recorded" ? "Studio recorded run" : "Studio run instrumentation",
        ...(Number.isFinite(stamp) ? { capturedAt: new Date(stamp).toISOString() } : {}),
      },
    } : {}) }],
  };
}

const ASSESSMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export function plannerAssessmentId(storage: Pick<Storage, "getItem" | "setItem"> | null, useCaseId: string, fresh = false, uuid = () => crypto.randomUUID(), appId = "fsi"): string {
  const key = appId === "fsi" ? `fsi-studio.planner.v1:${useCaseId}:assessment` : appStorageKey(appId, "planner-assessment", useCaseId);
  try {
    const saved = readStored(storage, key);
    if (!fresh && saved && ASSESSMENT_ID.test(saved)) return saved;
  } catch { /* A session can still use the planner when browser storage is unavailable. */ }
  const id = uuid();
  try { writeStored(storage, key, id); } catch { /* The planner handles its own draft-storage status. */ }
  return id;
}

export function validatePlannerConnection(bundle: string, api: string): PlannerConnection {
  if (!bundle && !api) return { configured: false };
  try {
    const bundleUrl = new URL(bundle), apiUrl = new URL(api);
    for (const url of [bundleUrl, apiUrl]) {
      if (url.username || url.password || url.search || url.hash ||
        !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
    }
    if (apiUrl.pathname !== "/" || !bundleUrl.pathname.endsWith(".js")) throw new Error();
    return { configured: true, bundleUrl: bundleUrl.href, apiBaseUrl: apiUrl.origin };
  } catch {
    return { configured: false, error: "Set a valid planner browser bundle URL and API origin in Studio configuration." };
  }
}
