import type { Viewport } from "./viewport.ts";
import type { PlatformId } from "./scene-model.ts";

export type Phase = "idle" | "preparing" | "bridging" | "committing" | "revealing";
export type SourceSelection = { sourceId: string; bindingId?: string };
export type InteractionSnapshot = {
  expandedGroupIds: string[];
  selectedId: string | null;
  platformFocus: PlatformId | null;
  viewport: Viewport;
  cameraOwner?: "automatic" | "user";
  sourceSelection: SourceSelection | null;
};

export type HistoryEntry = {
  sceneId: string;
  businessStepId: string;
  selectedId: string | null;
  platformFocus: PlatformId | null;
  layoutKey: string;
  viewport: Viewport;
};

export type NavState = {
  sceneId: string;
  businessStepId: string;
  focusPath: string[];
  selectedId: string | null;
  platformFocus: PlatformId | null;
  viewport: Viewport | null;
  history: HistoryEntry[];
  sourceSelection: SourceSelection | null;
  expandedGroupIds: string[];
  interactionHistory: InteractionSnapshot[];
  phase: Phase;
  transitionId: number;
  fitNonce: number;
};

export type NavEvent =
  | { type: "prepare"; transitionId: number }
  | { type: "commitEnter"; sceneId: string; businessStepId: string; entry: HistoryEntry; platformFocus: PlatformId | null; transitionId: number }
  | { type: "setFocus"; platformFocus: PlatformId | null }
  | { type: "restoreTo"; index: number; transitionId: number }
  | { type: "reveal" }
  | { type: "idle" }
  | { type: "cancelToIdle" }
  | { type: "select"; instanceId: string | null }
  | { type: "openSource"; selection: SourceSelection }
  | { type: "closeSource" }
  | { type: "fit" }
  | { type: "swapScene"; sceneId: string; businessStepId: string }
  | { type: "setExpansion"; expandedGroupIds: string[]; selectedId: string | null; snapshot: InteractionSnapshot }
  | { type: "restoreInteraction" };

export function initialNav(sceneId: string, businessStepId: string): NavState {
  return {
    sceneId,
    businessStepId,
    focusPath: [sceneId],
    selectedId: null,
    platformFocus: null,
    viewport: null,
    history: [],
    sourceSelection: null,
    expandedGroupIds: [],
    interactionHistory: [],
    phase: "idle",
    transitionId: 0,
    fitNonce: 0,
  };
}

export function reduceNav(state: NavState, event: NavEvent): NavState {
  switch (event.type) {
    case "prepare":
      if (event.transitionId < state.transitionId) return state;
      return { ...state, phase: "preparing", transitionId: event.transitionId };
    case "setFocus":
      return { ...state, platformFocus: event.platformFocus };
    case "commitEnter": {
      if (event.transitionId !== state.transitionId) return state;
      if (state.sceneId === event.sceneId && state.phase !== "preparing") return state;
      const top = state.history.at(-1);
      const duplicate = top
        && top.sceneId === event.entry.sceneId
        && top.selectedId === event.entry.selectedId
        && top.layoutKey === event.entry.layoutKey;
      return {
        ...state,
        sceneId: event.sceneId,
        businessStepId: event.businessStepId,
        focusPath: state.focusPath.at(-1) === event.sceneId ? state.focusPath : [...state.focusPath, event.sceneId],
        selectedId: null,
        platformFocus: event.platformFocus,
        sourceSelection: null,
        history: duplicate ? state.history : [...state.history, event.entry],
        phase: "committing",
      };
    }
    case "restoreTo": {
      if (event.transitionId !== state.transitionId) return state;
      const entry = state.history[event.index];
      if (!entry) return { ...state, phase: "idle" };
      return {
        ...state,
        sceneId: entry.sceneId,
        businessStepId: entry.businessStepId,
        selectedId: entry.selectedId,
        platformFocus: entry.platformFocus,
        viewport: entry.viewport,
        history: state.history.slice(0, event.index),
        focusPath: state.focusPath.slice(0, event.index + 1),
        sourceSelection: null,
        phase: "committing",
      };
    }
    case "reveal":
      return state.phase === "committing" ? { ...state, phase: "revealing" } : state;
    case "idle":
      return { ...state, phase: "idle" };
    case "cancelToIdle":
      return { ...state, phase: "idle" };
    case "select":
      return { ...state, selectedId: event.instanceId };
    case "openSource":
      return { ...state, sourceSelection: event.selection };
    case "closeSource":
      return { ...state, sourceSelection: null };
    case "fit":
      return state.phase === "idle" ? { ...state, fitNonce: state.fitNonce + 1 } : state;
    case "setExpansion":
      return {
        ...state,
        expandedGroupIds: event.expandedGroupIds,
        selectedId: event.selectedId,
        sourceSelection: null,
        interactionHistory: [...state.interactionHistory, event.snapshot],
      };
    case "restoreInteraction": {
      const snapshot = state.interactionHistory.at(-1);
      if (!snapshot) return state;
      return {
        ...state,
        expandedGroupIds: snapshot.expandedGroupIds,
        selectedId: snapshot.selectedId,
        platformFocus: snapshot.platformFocus,
        viewport: snapshot.viewport,
        sourceSelection: snapshot.sourceSelection,
        interactionHistory: state.interactionHistory.slice(0, -1),
      };
    }
    case "swapScene":
      return { ...state, sceneId: event.sceneId, businessStepId: event.businessStepId, selectedId: null, sourceSelection: null };
    default:
      return state;
  }
}
