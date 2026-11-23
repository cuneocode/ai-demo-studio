import { buildBusinessJourneyScene, type CaseScenes, type Mode, type SceneNode } from "./scene-model.ts";

export type Catalog = CaseScenes & {
  resolveScene?: (sceneId: string, mode: Mode) => string;
};

export function journeyCase(input: {
  id: string;
  title: string;
  purpose: string;
  modes: Mode[];
  environment: string[];
  steps: { id: string; label: string; text: string; drillInto?: string; emphasis?: SceneNode["emphasis"] }[];
}): Catalog {
  const relationships = input.steps.slice(1).map((step, index) => ({
    id: `${input.id}-${input.steps[index].id}-${step.id}`,
    fromEntityId: input.steps[index].id,
    toEntityId: step.id,
    kind: "businessSequence" as const,
    fact: `${input.steps[index].label} leads to ${step.label}.`,
  }));
  const scene = buildBusinessJourneyScene({
    id: `${input.id}.journey`,
    businessStepId: "overview",
    title: input.title,
    purpose: input.purpose,
    modes: input.modes,
    steps: input.steps.map((step, index) => ({
      instanceId: step.id,
      entityId: step.id,
      displayLabel: step.label,
      supportingText: step.text,
      role: "activity" as const,
      emphasis: step.emphasis,
      drillInto: step.drillInto,
      modelRelationshipId: relationships[Math.max(0, index - 1)]?.id ?? relationships[0]?.id ?? `${input.id}-self`,
    })),
  });
  return {
    id: input.id,
    rootSceneId: scene.id,
    businessStepIds: input.steps.map((step) => step.id),
    environment: input.environment,
    relationships,
    scenes: { [scene.id]: scene },
  };
}
