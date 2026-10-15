import type { ModelRegistry } from "./studio-models";

export type InferenceSnapshot = {
  registry: ModelRegistry;
  health?: Record<string, { up: boolean }>;
  routes?: Record<string, { active: string | null }>;
  saved?: boolean;
  unconfigured?: Record<string, string>;
};

/** Classify the selected route, never infer locality from provider names or chain order. */
export function inferenceStatus(snapshot: InferenceSnapshot | null, useCaseId?: string) {
  if (!snapshot) return { kind: "unknown", label: "Checking model", detail: "Model status is not available yet." };
  const active = useCaseId ? snapshot.routes?.[useCaseId]?.active : snapshot.registry.chain.find(id =>
    snapshot.health?.[id]?.up && (snapshot.saved || !snapshot.unconfigured?.[id]));
  const provider = active ? snapshot.registry.providers[active] : null;
  if (!provider) return { kind: "unknown", label: "Inference unavailable", detail: "No model is answering. Open model settings." };
  return { kind: provider.private ? "local" : "cloud", label: provider.private ? "Local inference" : "Cloud model", detail: `${provider.label} · ${provider.model}` };
}
