import { brahe } from "../../demos/brahe-bank/architecture/continuous.ts";
import { interbank } from "../../demos/interbank-a2a/architecture/continuous.ts";
import type { Mode, SceneSpec } from "./scene-model.ts";

export type FrameRule = {
  /** Occurrences kept in the camera when this group is opened. Exact ids win over prefixes. */
  ids?: string[];
  prefixes?: string[];
  /** Context occurrences reduced to their header while framing. */
  shrink?: Record<string, { x?: number; width: number; height: number }>;
  minZoom?: number;
};

export type ContinuousStage = { instanceId: string; displayLabel: string; groupId: string; occurrenceId: string };

/** A hand-authored continuous projection: one canvas whose groups expand in place. */
export type ContinuousSystem = {
  rootLabel: string;
  rootGroupId: string;
  rootOccurrenceId: string;
  railLabel: string;
  stages: ContinuousStage[];
  labels: Record<string, string>;
  occurrences: Record<string, string>;
  framing: Record<string, FrameRule>;
  project: (expandedGroupIds: readonly string[], mode: Mode) => SceneSpec;
  normalize: (current: readonly string[], groupId: string) => string[];
  collapse: (current: readonly string[], groupId: string) => string[];
  frameParent: (groupId: string) => string;
  /** Journey activity on the rail to the occurrence that represents it in the projection. */
  railOccurrence: (stepInstanceId: string) => string;
  /** Cards render at least their authored height, so routed edges meet the card edge. */
  fillDeclaredHeights?: boolean;
};

export const continuousSystems: Record<string, ContinuousSystem> = {
  "brahe-bank": brahe,
  "interbank-a2a": interbank,
};
