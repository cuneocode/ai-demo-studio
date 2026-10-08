import { flushSync } from "react-dom";
import type { AnimationPlaybackControls } from "motion";
import type { Catalog } from "./catalog.ts";
import { resolveScene } from "./catalog.ts";
import { contentRevision, layoutKey, prepareLayout, type LayoutResult } from "./layout.ts";
import type { HistoryEntry, NavEvent, NavState } from "./navigation.ts";
import type { Mode, PlatformId, SceneSpec } from "./scene-model.ts";
import { frameScene, type Viewport } from "./viewport.ts";

export type Veil = "idle" | "leaving" | "holding" | "revealing";
export type Rect = { x: number; y: number; width: number; height: number };
export type Shell = { title: string; role: string; from: Rect; to: Rect };

type MeasuredNode = { id: string; measured?: { width?: number } };

export type TransitionHost = {
  tokenRef: { current: number };
  animRef: { current: AnimationPlaybackControls | null };
  getNav: () => NavState;
  dispatch: (event: NavEvent) => NavState;
  setVeil: (veil: Veil) => void;
  setShell: (shell: Shell | null) => void;
  setZoom: (zoom: number) => void;
  setLayout: (sceneId: string, layout: LayoutResult) => void;
  getCanvas: () => HTMLElement | null;
  getShell: () => HTMLElement | null;
  catalog: Catalog;
  mode: Mode;
  flow: {
    getViewport: () => Viewport;
    setViewport: (viewport: Viewport, options: { duration: number }) => void;
    getNodes: () => MeasuredNode[];
  };
  focusNode: (instanceId: string | null) => void;
};

export function begin(host: TransitionHost) {
  const token = ++host.tokenRef.current;
  host.animRef.current?.stop();
  host.setShell(null);
  if (host.getNav().phase !== "idle") {
    host.dispatch({ type: "cancelToIdle" });
    host.setVeil("idle");
  }
  return token;
}

export async function enterScene(host: TransitionHost, instanceId: string, sceneOverride?: string) {
  const token = begin(host);
  const current = host.getNav();
  const live = host.catalog.scenes[current.sceneId];
  const node = live?.nodes.find((item) => item.instanceId === instanceId);
  if (!sceneOverride && (!node?.drillInto || !live)) return;
  const destId = sceneOverride ?? resolveScene(host.catalog, node?.drillInto ?? "", host.mode);
  const dest = host.catalog.scenes[destId];
  if (!dest || !dest.modes.includes(host.mode) || current.sceneId === destId) return;
  mark(token, "intent");
  host.dispatch({ type: "prepare", transitionId: token });
  const layout = await prepareLayout(host.catalog.id, host.mode, dest, "authored");
  mark(token, "scene-data-ready");
  if (host.tokenRef.current !== token) return;
  const canvas = host.getCanvas();
  const card = canvas?.querySelector(`.react-flow__node[data-id="${CSS.escape(instanceId)}"]`) as HTMLElement | null;
  const from = canvas && card ? relativeRect(canvas, card) : null;
  const entry: HistoryEntry = {
    sceneId: current.sceneId,
    businessStepId: current.businessStepId,
    selectedId: instanceId,
    platformFocus: host.getNav().platformFocus,
    layoutKey: layoutKey(host.catalog.id, host.mode, current.sceneId, contentRevision(live), "authored"),
    viewport: host.flow.getViewport(),
  };
  mark(token, "layout-ready");
  const size = host.getCanvas()?.getBoundingClientRect();
  const viewport = size ? frameScene(layout.nodes, layout.edges, dest.guides, size.width, size.height) : null;
  const requestedFocus = (node?.platformFocus ?? host.getNav().platformFocus) as PlatformId | null;
  host.setShell(from ? { title: node?.displayLabel ?? dest.title, role: node?.role ?? "activity", from, to: from } : null);
  flushSync(() => {
    host.setLayout(dest.id, layout);
    host.dispatch({ type: "commitEnter", sceneId: dest.id, businessStepId: dest.businessStepId, entry, platformFocus: requestedFocus, transitionId: token });
    host.setVeil(reducedMotion() ? "idle" : "revealing");
    if (viewport) {
      host.flow.setViewport(viewport, { duration: 0 });
      host.setZoom(viewport.zoom);
    }
  });
  mark(token, "transition-start");
  const ready = await waitForScene(host, dest, token);
  if (!ready) return;
  mark(token, "nodes-measured");
  mark(token, "destination-readable");
  await nextFrames(reducedMotion() ? 2 : 14);
  if (host.tokenRef.current !== token) return;
  host.setShell(null);
  host.setVeil("idle");
  host.dispatch({ type: "idle" });
  mark(token, "transition-complete");
  host.focusNode(dest.entryInstanceIds[0] ?? null);
}

export async function restoreTo(host: TransitionHost, index: number) {
  const token = begin(host);
  const current = host.getNav();
  const entry = current.history[index];
  if (!entry) return;
  const dest = host.catalog.scenes[entry.sceneId];
  if (!dest) return;
  host.dispatch({ type: "prepare", transitionId: token });
  const layout = await prepareLayout(host.catalog.id, host.mode, dest, "authored");
  if (host.tokenRef.current !== token) return;
  flushSync(() => {
    host.setLayout(dest.id, layout);
    host.dispatch({ type: "restoreTo", index, transitionId: token });
    host.setVeil(reducedMotion() ? "idle" : "revealing");
    host.flow.setViewport(entry.viewport, { duration: 0 });
    host.setZoom(entry.viewport.zoom);
  });
  await nextFrames(reducedMotion() ? 1 : 8);
  if (host.tokenRef.current !== token) return;
  host.setShell(null);
  host.setVeil("idle");
  host.dispatch({ type: "idle" });
  host.focusNode(entry.selectedId);
}

async function waitForScene(host: TransitionHost, target: SceneSpec, token: number) {
  const ids = target.nodes.map((node) => node.instanceId);
  const started = performance.now();
  let present = 0;
  while (performance.now() - started < 400) {
    if (host.tokenRef.current !== token) return false;
    const nodes = host.flow.getNodes();
    const same = nodes.length === ids.length && nodes.every((node) => ids.includes(node.id));
    if (same && nodes.every((node) => node.measured?.width)) return true;
    if (same) present += 1;
    if (present >= 2) return true;
    await nextFrames(1);
  }
  return host.tokenRef.current === token;
}

const timings: Record<string, number> = {};

function mark(token: number, name: string) {
  timings[`${token}:${name}`] = performance.now();
  if (name === "transition-complete") {
    const intent = timings[`${token}:intent`] ?? timings[`${token}:transition-start`];
    const done = timings[`${token}:transition-complete`];
    const input = (globalThis as { __mapInputEventAt?: number }).__mapInputEventAt;
    const dataReady = timings[`${token}:scene-data-ready`] ?? intent;
    const layoutReady = timings[`${token}:layout-ready`] ?? dataReady;
    const transition = timings[`${token}:transition-start`] ?? layoutReady;
    const readable = timings[`${token}:destination-readable`] ?? transition;
    const report = {
      inputToHandlerMs: input == null ? null : Math.round(intent - input),
      preparationMs: Math.round(dataReady - intent),
      layoutMs: Math.round(layoutReady - dataReady),
      commitToReadableMs: Math.round(readable - transition),
      readableToCompleteMs: Math.round(done - readable),
      totalAppMs: Math.round(done - intent),
    };
    (globalThis as { __mapNavMs?: number; __mapNavTiming?: typeof report }).__mapNavMs = report.totalAppMs;
    (globalThis as { __mapNavTiming?: typeof report }).__mapNavTiming = report;
  }
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function nextFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    requestAnimationFrame(() => step(count));
  });
}

function relativeRect(container: HTMLElement, element: HTMLElement): Rect {
  const outer = container.getBoundingClientRect();
  const inner = element.getBoundingClientRect();
  return { x: inner.left - outer.left, y: inner.top - outer.top, width: inner.width, height: inner.height };
}
