"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
  type Edge,
  type Node as FlowNode,
} from "@xyflow/react";
import { Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { catalogs, resolveScene, type Catalog } from "./catalog.ts";
import { continuousSystems, type ContinuousSystem } from "./continuous.ts";
import { begin, enterScene, restoreTo, type Shell, type TransitionHost, type Veil } from "./controller.ts";
import { edgeTypes } from "./edges.tsx";
import {
  collapseGenericGroup,
  genericGroupLabel,
  normalizeGenericExpansion,
  parentGenericGroup,
  primaryGroupId,
  projectGenericSystem,
} from "./generic-system.ts";
import { EnvironmentInspector, SourceInspector } from "./inspector.tsx";
import { authoredLayout, contentRevision, measuredLayout, prepareLayout, type LayoutResult, type MeasuredNodeSizes } from "./layout.ts";
import { initialNav, reduceNav, type NavEvent, type NavState } from "./navigation.ts";
import { nodeTypes, type SceneNodeData } from "./nodes.tsx";
import {
  attributionFor,
  edgeRelevanceFor,
  focusNamesPlatform,
  nodeRelevanceFor,
  relevanceForBindingIds,
  sourceActionsForNode,
  absoluteSceneNodes,
  routeScene,
  type FocusRelevance,
  type Mode,
  type PlatformId,
  type RelationshipKind,
  type SceneNode,
  type SceneSourceAction,
  type SceneSpec,
} from "./scene-model.ts";
import { frameScene, panBoundsIntoView, sceneBounds, type Bounds, type Viewport } from "./viewport.ts";
import "./map.css";
import { useTheme, type Theme } from "../theme.ts";

type EdgePalette = { kinds: Record<RelationshipKind, string>; secondary: string; active: string; dots: string };

const EDGE_PALETTES: Record<Theme, EdgePalette> = {
  dark: {
    kinds: { businessSequence: "#9bb8ff", support: "#8ea0b8", request: "#9bb8ff", return: "#8fd0b0", control: "#ddbd83", telemetry: "#bd9ee5", hosting: "#aab4c6" },
    secondary: "#66768c", active: "#c2d3ff", dots: "rgba(120,140,170,0.28)",
  },
  light: {
    kinds: { businessSequence: "#3a68d6", support: "#7b8aa0", request: "#3a68d6", return: "#2f8a63", control: "#a87a26", telemetry: "#7a52c4", hosting: "#7d889a" },
    secondary: "#b3bdca", active: "#1d4ed8", dots: "rgba(70,90,120,0.22)",
  },
};

const relevanceClass: Record<FocusRelevance, string> = { active: "is-active", context: "is-context", secondary: "is-secondary" };
const ignoreMeasurement = () => {};

function unionBounds(left: Bounds, right: Bounds): Bounds {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  return {
    x,
    y,
    width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y,
  };
}

function localStoryBounds(scene: SceneSpec, nodes: SceneNode[], selectedId: string, usableWidth: number, usableHeight: number, zoom: number): Bounds | null {
  const absolute = absoluteSceneNodes(nodes);
  const byId = new Map(absolute.map((node) => [node.instanceId, node]));
  const selected = byId.get(selectedId);
  if (!selected) return null;
  let bounds: Bounds = { x: selected.x, y: selected.y, width: selected.width, height: selected.height };
  const authoredSelected = scene.nodes.find((node) => node.instanceId === selectedId);
  const parent = authoredSelected?.parentId ? byId.get(authoredSelected.parentId) : undefined;
  const candidates: Bounds[] = [];
  if (parent) candidates.push({ x: parent.x, y: parent.y, width: Math.min(parent.width, 220), height: 44 });
  const neighbors = scene.relationships
    .filter((edge) => edge.sourceInstanceId === selectedId || edge.targetInstanceId === selectedId)
    .map((edge) => byId.get(edge.sourceInstanceId === selectedId ? edge.targetInstanceId : edge.sourceInstanceId))
    .filter((node): node is SceneNode => Boolean(node) && node.role !== "group")
    .sort((a, b) => Math.hypot(a.x - selected.x, a.y - selected.y) - Math.hypot(b.x - selected.x, b.y - selected.y));
  candidates.push(...neighbors.map((node) => ({ x: node.x, y: node.y, width: node.width, height: node.height })));
  for (const candidate of candidates) {
    const next = unionBounds(bounds, candidate);
    if (next.width * zoom <= usableWidth - 48 && next.height * zoom <= usableHeight - 48) bounds = next;
  }
  return bounds;
}

function sourceAttribution(catalog: Catalog, node: SceneNode, mode: Mode, action?: SceneSourceAction) {
  const resolved = attributionFor(catalog, node, mode);
  if (!action?.bindingId) {
    return {
      subject: node.displayLabel,
      ownership: node.serviceLabel,
      platforms: [],
      mechanism: "Occurrence implementation",
      effect: action?.evidenceSummary ?? node.supportingText ?? "Shows how this occurrence is configured and behaves.",
      disclosure: node.disclosure,
    };
  }
  const relevant = resolved.filter((item) => item.bindingId === action.bindingId);
  const selected = relevant[0];
  if (!selected) return null;
  return {
    subject: node.displayLabel,
    ownership: node.serviceLabel && !resolved.some((item) => item.platformName === node.serviceLabel) ? node.serviceLabel : undefined,
    platforms: [...new Set(relevant.map((item) => item.platformName))],
    mechanism: selected.mechanismLabel,
    effect: selected.applicationEffect,
    disclosure: node.disclosure,
  };
}

function buildGraph(
  catalog: Catalog,
  spec: SceneSpec,
  layout: LayoutResult,
  activeMode: Mode,
  platformFocus: PlatformId | null,
  onMeasure: (instanceId: string, width: number, height: number) => void,
  transitionNodeIds: ReadonlySet<string>,
  transitionEdgeIds: ReadonlySet<string>,
  fillDeclaredHeights = false,
  palette: EdgePalette = EDGE_PALETTES.dark,
) {
  const usedPorts = new Map<string, Set<string>>();
  for (const edge of layout.edges) {
    if (!usedPorts.has(edge.sourceInstanceId)) usedPorts.set(edge.sourceInstanceId, new Set());
    if (!usedPorts.has(edge.targetInstanceId)) usedPorts.set(edge.targetInstanceId, new Set());
    usedPorts.get(edge.sourceInstanceId)?.add(edge.sourcePort);
    usedPorts.get(edge.targetInstanceId)?.add(edge.targetPort);
  }
  const nodes: FlowNode[] = layout.nodes.filter((node) => !node.modes || node.modes.includes(activeMode)).map((node) => {
    const drillInto = node.drillByMode?.[activeMode] ?? node.drillInto;
    const supportingText = node.supportingByMode?.[activeMode] ?? node.supportingText;
    const nodeRelevance = nodeRelevanceFor(catalog, node, platformFocus, activeMode);
    const sourceActions = sourceActionsForNode(catalog, node, activeMode);
    const representationKey = `${activeMode}:${node.role}:${node.expanded ? "expanded" : "summary"}:${node.width}:${node.height}:${node.displayLabel}:${supportingText ?? ""}`;
    const attribution = attributionFor(catalog, node, activeMode, platformFocus)
      .filter((item) => !node.suppressAttribution && item.platformName !== node.displayLabel && (item.role !== "workload" || node.showPlatformAttribution))
      .filter(() => !node.compact);
    return {
    id: node.instanceId,
    type: node.role === "input" || node.role === "output" ? "context" : node.role,
    position: { x: node.x, y: node.y },
    parentId: node.parentId,
    style: node.role === "group"
      ? { width: node.width, height: node.height, zIndex: node.parentId ? 1 : 0 }
      : { width: node.width, zIndex: node.parentId ? 2 : 1 },
    draggable: false,
    connectable: false,
    selectable: true,
    className: `${relevanceClass[nodeRelevance]} ${transitionNodeIds.has(node.instanceId) ? "is-local-moving" : ""}`.trim(),
    ariaLabel: node.displayLabel,
    data: {
      instanceId: node.instanceId,
      representationKey,
      role: node.role,
      displayLabel: node.displayLabel,
        supportingText,
        detail: node.detail,
        technicalLabel: node.technicalLabel,
        serviceLabel: node.serviceLabel,
        emphasis: node.emphasis,
        drillInto,
        expandGroupId: node.expandGroupId,
        expanded: node.expanded,
        platformFocus: node.platformFocus,
        compact: node.compact,
        dense: node.dense,
        hasSource: sourceActions.length > 0,
        nodeRelevance,
        sourceRelevance: relevanceForBindingIds(catalog, sourceActions.flatMap((source) => source.bindingId ? [source.bindingId] : []), platformFocus, activeMode),
        capabilityLines: (node.capabilityLines ?? []).map((line) => ({
          id: line.id,
          text: line.text,
          relevance: relevanceForBindingIds(catalog, line.bindingIds, platformFocus, activeMode),
        })),
      attribution: attribution
        .map((item) => ({ name: item.platformName, label: node.showPlatformAttribution ? item.platformName : item.role === "integration" ? `Integrates ${item.platformName}` : item.platformName, role: item.role, relevance: item.relevance })),
      portAlong: layout.portAlong[node.instanceId],
      ports: [...(usedPorts.get(node.instanceId) ?? [])],
      onMeasure,
      minHeight: fillDeclaredHeights && !(node.role === "group" && node.expanded) ? node.height : undefined,
    } satisfies SceneNodeData,
    };
  });
  const edges: Edge[] = layout.edges.map((edge) => {
    const relevance = edgeRelevanceFor(catalog, edge, platformFocus, activeMode);
    const edgeStroke = relevance === "secondary" ? palette.secondary : relevance === "active" ? palette.active : palette.kinds[edge.kind];
    return {
    id: edge.id,
    source: edge.sourceInstanceId,
    target: edge.targetInstanceId,
    sourceHandle: edge.sourcePort,
    targetHandle: edge.targetPort,
    type: edge.kind === "support" ? "support" : "routed",
      markerEnd: edge.kind === "support" ? undefined : { type: MarkerType.ArrowClosed, color: edgeStroke, width: 16, height: 16 },
      style: { stroke: edgeStroke, strokeWidth: relevance === "active" ? 2.5 : 1.75, strokeDasharray: edge.kind === "telemetry" || edge.kind === "hosting" || edge.kind === "support" ? "5 4" : undefined },
      data: { points: edge.points, kind: edge.kind, label: edge.label, labelOffset: edge.labelOffset, relevance, localTransition: transitionEdgeIds.has(edge.id) },
    };
  });
  return { nodes, edges };
}

function Canvas({ catalog, title }: { catalog: Catalog; title: string }) {
  const theme = useTheme();
  const flow = useReactFlow();
  const root = catalog.scenes[catalog.rootSceneId];
  const system: ContinuousSystem | undefined = continuousSystems[catalog.id];
  const continuous = Boolean(system) || Boolean(catalog.projectionRelationshipIds?.length);
  const [mode, setMode] = useState<Mode>(root.modes.includes("implemented") ? "implemented" : "proposed");
  const [nav, setNav] = useState<NavState>(() => initialNav(root.id, root.businessStepId));
  const [layouts, setLayouts] = useState<Record<string, LayoutResult>>(() => ({ [root.id]: authoredLayout(root) }));
  const [veil, setVeil] = useState<Veil>("idle");
  const [shell, setShell] = useState<Shell | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sourceWidth, setSourceWidth] = useState(500);
  const [narrow, setNarrow] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [measurements, setMeasurements] = useState<Record<string, MeasuredNodeSizes>>({});
  const [localTransition, setLocalTransition] = useState<{ nodeIds: Set<string>; edgeIds: Set<string> } | null>(null);
  const localTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measurementFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measurementQueue = useRef<Record<string, MeasuredNodeSizes>>({});
  const navRef = useRef(nav);
  const zoomRef = useRef(1);
  const sceneRef = useRef<SceneSpec>(root);
  const expandContinuousRef = useRef<(node: SceneNode) => void>(() => {});
  const tokenRef = useRef(0);
  const animRef = useRef<TransitionHost["animRef"]["current"]>(null);
  const layoutsRef = useRef(layouts);
  const canvasRef = useRef<HTMLDivElement>(null);
  const explorerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const beforePanel = useRef<Viewport | null>(null);
  const beforePanelOwner = useRef<"automatic" | "user">("automatic");
  const framedPanelKey = useRef<string | null>(null);
  const automaticViewport = useRef<Viewport | null>(null);
  const cameraOwner = useRef<"automatic" | "user">("automatic");
  const didFit = useRef(false);
  const hostRef = useRef<TransitionHost | null>(null);
  const refitRef = useRef<() => void>(() => {});
  const publishZoom = useCallback((value: number) => {
    const next = Number(value.toFixed(3));
    zoomRef.current = next;
    explorerRef.current?.setAttribute("data-zoom", String(next));
  }, []);
  const scene = useMemo(
    () => continuous
      ? system
        ? system.project(nav.expandedGroupIds, mode)
        : projectGenericSystem(catalog, nav.expandedGroupIds, mode)
      : catalog.scenes[nav.sceneId] ?? root,
    [system, catalog, continuous, mode, nav.expandedGroupIds, nav.sceneId, root],
  );
  const measurementKey = `${scene.id}:${mode}:${contentRevision(scene)}`;
  const representationGeneration = `${mode}:${nav.expandedGroupIds.join(">") || "overview"}:${scene.nodes.length}:${scene.relationships.length}`;
  const baseLayout = continuous ? authoredLayout(scene) : layouts[scene.id] ?? authoredLayout(scene);
  const laid = useMemo(() => continuous ? baseLayout : measuredLayout(scene, baseLayout, measurements[measurementKey] ?? {}), [baseLayout, continuous, measurementKey, measurements, scene]);
  const platformFocus = (nav.platformFocus as PlatformId | null) ?? null;
  const onMeasure = useCallback((instanceId: string, width: number, height: number) => {
    measurementQueue.current[measurementKey] = {
      ...(measurementQueue.current[measurementKey] ?? {}),
      [instanceId]: { width, height },
    };
    if (measurementFlushTimer.current) clearTimeout(measurementFlushTimer.current);
    measurementFlushTimer.current = setTimeout(() => {
      const queued = measurementQueue.current;
      measurementQueue.current = {};
      measurementFlushTimer.current = null;
      setMeasurements((current) => {
        let changed = false;
        const next = { ...current };
        for (const [key, sizes] of Object.entries(queued)) {
          const existing = current[key] ?? {};
          const merged = { ...existing };
          for (const [id, size] of Object.entries(sizes)) {
            const previous = existing[id];
            if (!previous || Math.abs(previous.width - size.width) >= 1 || Math.abs(previous.height - size.height) >= 1) {
              merged[id] = size;
              changed = true;
            }
          }
          if (changed) next[key] = merged;
        }
        return changed ? next : current;
      });
    }, 48);
  }, [measurementKey]);
  const graph = useMemo(() => buildGraph(
    catalog,
    scene,
    laid,
    mode,
    platformFocus,
    continuous ? ignoreMeasurement : onMeasure,
    localTransition?.nodeIds ?? new Set(),
    localTransition?.edgeIds ?? new Set(),
    Boolean(system?.fillDeclaredHeights),
    EDGE_PALETTES[theme],
  ), [catalog, continuous, scene, laid, localTransition, mode, platformFocus, onMeasure, system, theme]);
  const focusPlatform = catalog.platforms?.find((item) => item.id === platformFocus) ?? null;
  const systemExpanded = continuous && nav.expandedGroupIds.length > 0;
  const isOverview = continuous ? !systemExpanded : scene.id === catalog.rootSceneId;

  const dispatch = useCallback((event: NavEvent) => {
    const next = reduceNav(navRef.current, event);
    navRef.current = next;
    setNav(next);
    return next;
  }, []);

  useEffect(() => { layoutsRef.current = layouts; }, [layouts]);
  useEffect(() => { sceneRef.current = scene; }, [scene]);
  useEffect(() => {
    (globalThis as { __mapRepresentationGeneration?: string }).__mapRepresentationGeneration = representationGeneration;
  }, [representationGeneration]);
  useEffect(() => { hostRef.current = host(); });
  useEffect(() => {
    refitRef.current = () => {
      const current = navRef.current;
      if (cameraOwner.current !== "automatic" || current.phase !== "idle" || current.sourceSelection || environmentOpen) return;
      const deepest = current.expandedGroupIds.at(-1);
      if (continuous && deepest) frameContinuous(scene, deepest);
      else frame(laid, scene.guides);
    };
  });
  useEffect(() => () => {
    if (localTransitionTimer.current) clearTimeout(localTransitionTimer.current);
    if (measurementFlushTimer.current) clearTimeout(measurementFlushTimer.current);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const controls = hostRef.current;
      if (!controls || !explorerRef.current?.getClientRects().length) return;
      if (controls.getNav().sourceSelection || environmentOpen) {
        event.preventDefault();
        if (controls.getNav().sourceSelection) controls.dispatch({ type: "closeSource" });
        setEnvironmentOpen(false);
        framedPanelKey.current = null;
        if (beforePanel.current) {
          controls.flow.setViewport(beforePanel.current, { duration: 0 });
          publishZoom(beforePanel.current.zoom);
          cameraOwner.current = beforePanelOwner.current;
          automaticViewport.current = beforePanelOwner.current === "automatic" ? beforePanel.current : null;
          beforePanel.current = null;
        }
        return;
      }
      const explorer = controls.getCanvas()?.closest("[data-testid='architecture-explorer']");
      if (!explorer?.contains(event.target as globalThis.Node)) return;
      event.preventDefault();
      if (continuousSystems[controls.catalog.id]) {
        const snapshot = controls.getNav().interactionHistory.at(-1);
        if (snapshot) {
          controls.dispatch({ type: "restoreInteraction" });
          controls.flow.setViewport(snapshot.viewport, { duration: 0 });
          publishZoom(snapshot.viewport.zoom);
          cameraOwner.current = snapshot.cameraOwner ?? "automatic";
          automaticViewport.current = cameraOwner.current === "automatic" ? snapshot.viewport : null;
        }
        return;
      }
      const index = controls.getNav().history.length - 1;
      if (index >= 0) void restoreTo(controls, index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [environmentOpen, publishZoom]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const fitOnce = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (didFit.current || width < 10 || height < 10) return;
      if (navRef.current.phase !== "idle" || navRef.current.history.length > 0) return;
      didFit.current = true;
      const live = continuous
        ? system
          ? system.project(navRef.current.expandedGroupIds, mode)
          : projectGenericSystem(catalog, navRef.current.expandedGroupIds, mode)
        : catalog.scenes[navRef.current.sceneId];
      const layout = continuous ? authoredLayout(live) : layoutsRef.current[live.id] ?? authoredLayout(live);
      const viewport = frameScene(layout.nodes, layout.edges, live.guides, width, height);
      automaticViewport.current = viewport;
      cameraOwner.current = "automatic";
      flow.setViewport(viewport, { duration: 0 });
      publishZoom(viewport.zoom);
    };
    const frameId = requestAnimationFrame(fitOnce);
    // Inside a hidden tab the canvas measures 0x0. Fit once it is first shown, and
    // re-frame on a later show if its size changed while hidden.
    let hidden = false;
    let shown = { width: 0, height: 0 };
    const observer = new ResizeObserver(() => {
      const size = { width: el.clientWidth, height: el.clientHeight };
      if (size.width < 10 || size.height < 10) { hidden = true; return; }
      if (!didFit.current) fitOnce();
      else if (hidden && (size.width !== shown.width || size.height !== shown.height)) refitRef.current();
      hidden = false;
      shown = size;
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [system, catalog, continuous, flow, mode, publishZoom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!stage.clientWidth) return;
        const next = stage.clientWidth < 900 || stage.clientWidth - sourceWidth < 560;
        setNarrow((current) => current === next ? current : next);
      });
    };
    // Observing the stage (not the window) also catches a resize made while the tab was hidden.
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [expanded, sourceWidth]);

  useEffect(() => {
    if (!nav.sourceSelection && !environmentOpen) {
      framedPanelKey.current = null;
      return;
    }
    const deepest = nav.expandedGroupIds.at(-1);
    const targetId = nav.selectedId ?? (system ? (deepest ? system.occurrences[deepest] : system.rootOccurrenceId) : undefined);
    if (!targetId) return;
    let innerFrame = 0;
    const frameId = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = flow.getViewport();
      const drawerHeight = narrow ? stageRef.current?.querySelector(".map-source.is-drawer")?.getBoundingClientRect().height ?? 0 : 0;
      const usableHeight = canvas.clientHeight - (drawerHeight ? drawerHeight + 24 : 0);
      const panelKey = `${nav.sourceSelection ? "source" : "environment"}:${targetId}:${narrow}:${canvas.clientWidth}:${Math.round(drawerHeight)}`;
      if (framedPanelKey.current === panelKey) return;
      const bounds = localStoryBounds(scene, laid.nodes, targetId, canvas.clientWidth, usableHeight, viewport.zoom);
      if (!bounds) return;
      const next = panBoundsIntoView(viewport, bounds, canvas.clientWidth, canvas.clientHeight, 0, drawerHeight ? drawerHeight + 24 : 0);
      framedPanelKey.current = panelKey;
      if (next.x !== viewport.x || next.y !== viewport.y) flow.setViewport(next, { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160 });
      });
    });
    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(innerFrame);
    };
  }, [environmentOpen, flow, laid.nodes, narrow, nav.expandedGroupIds, nav.selectedId, nav.sourceSelection, scene, sourceWidth, system]);

  useEffect(() => {
    if (!expanded) return;
    const frameId = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const viewport = frameScene(laid.nodes, laid.edges, scene.guides, canvas.clientWidth, canvas.clientHeight);
      automaticViewport.current = viewport;
      cameraOwner.current = "automatic";
      flow.setViewport(viewport, { duration: 0 });
      publishZoom(viewport.zoom);
    });
    return () => cancelAnimationFrame(frameId);
  }, [expanded, flow, laid, publishZoom, scene.guides]);

  useEffect(() => {
    if (continuous) return;
    let cancel = false;
    const sceneId = nav.sceneId;
    const live = catalog.scenes[sceneId];
    if (!live) return;
    void prepareLayout(catalog.id, mode, live, "authored").then((result) => {
      if (cancel) return;
      setLayouts((current) => current[sceneId] === result ? current : { ...current, [sceneId]: result });
    });
    return () => { cancel = true; };
  }, [catalog, continuous, mode, nav.sceneId]);

  useEffect(() => {
    if (continuous) return;
    const rootScene = catalog.scenes[catalog.rootSceneId];
    for (const item of rootScene?.nodes ?? []) {
      const nextId = item.drillByMode?.[mode] ?? item.drillInto;
      const next = nextId ? catalog.scenes[nextId] : undefined;
      if (next) void prepareLayout(catalog.id, mode, next, "authored");
    }
  }, [catalog, continuous, mode]);

  function host(): TransitionHost {
    return {
      tokenRef,
      animRef,
      getNav: () => navRef.current,
      dispatch,
      setVeil,
      setShell,
      setZoom: publishZoom,
      setLayout: (sceneId, layout) => setLayouts((current) => ({ ...current, [sceneId]: layout })),
      getCanvas: () => canvasRef.current,
      getShell: () => shellRef.current,
      catalog,
      mode,
      flow,
      focusNode: (instanceId) => {
        if (!instanceId) return;
        requestAnimationFrame(() => {
          const element = canvasRef.current?.querySelector(`.react-flow__node[data-id="${CSS.escape(instanceId)}"]`) as HTMLElement | null;
          element?.focus();
        });
      },
    };
  }

  function frame(layout: LayoutResult, guides: SceneSpec["guides"]) {
    const el = canvasRef.current;
    if (!el) return;
    const viewport = frameScene(layout.nodes, layout.edges, guides, el.clientWidth, el.clientHeight);
    automaticViewport.current = viewport;
    cameraOwner.current = "automatic";
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    flow.setViewport(viewport, { duration });
    if (duration === 0) publishZoom(viewport.zoom);
  }

  function interactionSnapshot() {
    const current = navRef.current;
    return {
      expandedGroupIds: [...current.expandedGroupIds],
      selectedId: current.selectedId,
      platformFocus: current.platformFocus,
      viewport: cameraOwner.current === "automatic" && automaticViewport.current ? automaticViewport.current : flow.getViewport(),
      cameraOwner: cameraOwner.current,
      sourceSelection: current.sourceSelection,
    };
  }

  function frameContinuous(nextScene: SceneSpec, groupId: string, projectedNodes: SceneNode[] = nextScene.nodes) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const absolute = absoluteSceneNodes(projectedNodes).map((node) => ({ ...node, parentId: undefined }));
    if (!system) {
      const primary = primaryGroupId(catalog.id);
      const coreExpanded = groupId.startsWith(`${catalog.id}.group.core.`);
      const primaryOccurrence = projectedNodes.find((node) => node.expandGroupId === primary && node.expanded)?.instanceId;
      const selectedCoreOccurrence = coreExpanded
        ? `${catalog.id}.core.${groupId.slice(`${catalog.id}.group.core.`.length)}`
        : undefined;
      const visible = (coreExpanded
        ? absolute.filter((node) => {
          const authored = projectedNodes.find((candidate) => candidate.instanceId === node.instanceId);
          return node.instanceId === primaryOccurrence || node.instanceId === selectedCoreOccurrence || authored?.parentId === selectedCoreOccurrence;
        })
        : absolute).map((node) => coreExpanded && node.instanceId === primaryOccurrence ? { ...node, width: 220, height: 44 } : node);
      const ids = new Set(visible.map((node) => node.instanceId));
      const routed = routeScene({ ...nextScene, nodes: projectedNodes }).filter((edge) => ids.has(edge.sourceInstanceId) && ids.has(edge.targetInstanceId));
      const viewport = frameScene(visible, routed, undefined, canvas.clientWidth, canvas.clientHeight, { minZoom: 0.6, pad: 32 });
      automaticViewport.current = viewport;
      cameraOwner.current = "automatic";
      (globalThis as { __mapFramingInputs?: unknown }).__mapFramingInputs = {
        operationId: (globalThis as { __mapOperationId?: number }).__mapOperationId ?? 0,
        expansionSignature: navRef.current.expandedGroupIds.join(">"),
        representationGeneration: `${mode}:${navRef.current.expandedGroupIds.join(">") || "overview"}:${nextScene.nodes.length}:${nextScene.relationships.length}`,
        mode,
        selectedGroupId: groupId,
        canvas: { width: canvas.clientWidth, height: canvas.clientHeight },
        requiredLocalBounds: sceneBounds(visible, routed),
        panelMode: "none",
        focusExcluded: true,
        viewport,
      };
      const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
      flow.setViewport(viewport, { duration });
      if (duration === 0) publishZoom(viewport.zoom);
      return;
    }
    const rule = system.framing[groupId] ?? system.framing[system.rootGroupId] ?? {};
    const exact = rule.ids ? new Set(rule.ids) : null;
    const wanted = rule.prefixes ?? [];
    const visible = absolute
      .filter((node) => exact ? exact.has(node.instanceId) : wanted.some((prefix) => node.instanceId.startsWith(prefix)))
      .map((node) => {
        const shrink = rule.shrink?.[node.instanceId];
        return shrink ? { ...node, ...shrink } : node;
      });
    const ids = new Set(visible.map((node) => node.instanceId));
    const routed = routeScene({ ...nextScene, nodes: projectedNodes }).filter((edge) => ids.has(edge.sourceInstanceId) && ids.has(edge.targetInstanceId));
    const viewport = frameScene(visible, routed, undefined, canvas.clientWidth, canvas.clientHeight, rule.minZoom ? { minZoom: rule.minZoom, pad: 32 } : undefined);
    automaticViewport.current = viewport;
    cameraOwner.current = "automatic";
    (globalThis as {
      __mapFramingInputs?: {
        operationId: number;
        expansionSignature: string;
        representationGeneration: string;
        mode: Mode;
        selectedGroupId: string;
        canvas: { width: number; height: number };
        requiredLocalBounds: Bounds;
        panelMode: "none";
        focusExcluded: true;
        viewport: Viewport;
      };
    }).__mapFramingInputs = {
      operationId: (globalThis as { __mapOperationId?: number }).__mapOperationId ?? 0,
      expansionSignature: navRef.current.expandedGroupIds.join(">"),
      representationGeneration: `${mode}:${navRef.current.expandedGroupIds.join(">") || "overview"}:${nextScene.nodes.length}:${nextScene.relationships.length}`,
      mode,
      selectedGroupId: groupId,
      canvas: { width: canvas.clientWidth, height: canvas.clientHeight },
      requiredLocalBounds: sceneBounds(visible, routed),
      panelMode: "none",
      focusExcluded: true,
      viewport,
    };
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    flow.setViewport(viewport, { duration });
    if (duration === 0) publishZoom(viewport.zoom);
  }

  function scheduleContinuousFrame(nextScene: SceneSpec, groupId: string, operationId: number) {
    requestAnimationFrame(() => {
      if (tokenRef.current !== operationId) return;
      frameContinuous(nextScene, groupId);
    });
  }

  function beginLocalTransition(nextScene: SceneSpec) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const before = new Map(absoluteSceneNodes(scene.nodes).map((node) => [node.instanceId, node]));
    const after = new Map(absoluteSceneNodes(nextScene.nodes).map((node) => [node.instanceId, node]));
    const nodeIds = new Set<string>();
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const left = before.get(id);
      const right = after.get(id);
      if (!left || !right || left.x !== right.x || left.y !== right.y || left.width !== right.width || left.height !== right.height || left.parentId !== right.parentId) nodeIds.add(id);
    }
    const beforeEdges = new Set(scene.relationships.map((edge) => edge.id));
    const afterEdges = new Set(nextScene.relationships.map((edge) => edge.id));
    const edgeIds = new Set<string>();
    for (const edge of [...scene.relationships, ...nextScene.relationships]) {
      if (!beforeEdges.has(edge.id) || !afterEdges.has(edge.id) || nodeIds.has(edge.sourceInstanceId) || nodeIds.has(edge.targetInstanceId)) edgeIds.add(edge.id);
    }
    setLocalTransition({ nodeIds, edgeIds });
    if (localTransitionTimer.current) clearTimeout(localTransitionTimer.current);
    localTransitionTimer.current = setTimeout(() => setLocalTransition(null), 260);
  }

  function reportContinuousTiming(started: number, projected: number) {
    const input = (globalThis as { __mapInputEventAt?: number }).__mapInputEventAt;
    requestAnimationFrame(() => {
      const visible = performance.now();
      setTimeout(() => {
        const complete = performance.now();
        (globalThis as { __mapExpansionTiming?: Record<string, number | null> }).__mapExpansionTiming = {
          inputToHandlerMs: input == null ? null : Math.round(started - input),
          projectionMs: Math.round(projected - started),
          commitToVisibleMs: Math.round(visible - projected),
          localMotionMs: Math.round(complete - visible),
          totalAppMs: Math.round(complete - started),
        };
      }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260);
    });
  }

  function expandContinuous(node: SceneNode) {
    if (!node.expandGroupId) return;
    const operationId = ++tokenRef.current;
    (globalThis as { __mapOperationId?: number }).__mapOperationId = operationId;
    const started = performance.now();
    const snapshot = interactionSnapshot();
    const nextExpanded = system
      ? system.normalize(navRef.current.expandedGroupIds, node.expandGroupId)
      : normalizeGenericExpansion(catalog.id, navRef.current.expandedGroupIds, node.expandGroupId);
    if (node.platformFocus) dispatch({ type: "setFocus", platformFocus: node.platformFocus });
    const nextScene = system ? system.project(nextExpanded, mode) : projectGenericSystem(catalog, nextExpanded, mode);
    const projected = performance.now();
    beginLocalTransition(nextScene);
    dispatch({ type: "setExpansion", expandedGroupIds: nextExpanded, selectedId: node.instanceId, snapshot });
    scheduleContinuousFrame(nextScene, node.expandGroupId, operationId);
    reportContinuousTiming(started, projected);
  }
  expandContinuousRef.current = expandContinuous;

  function collapseContinuous(node: SceneNode) {
    if (!node.expandGroupId) return;
    const operationId = ++tokenRef.current;
    (globalThis as { __mapOperationId?: number }).__mapOperationId = operationId;
    const started = performance.now();
    const snapshot = interactionSnapshot();
    const nextExpanded = system
      ? system.collapse(navRef.current.expandedGroupIds, node.expandGroupId)
      : collapseGenericGroup(catalog.id, navRef.current.expandedGroupIds, node.expandGroupId);
    const nextScene = system ? system.project(nextExpanded, mode) : projectGenericSystem(catalog, nextExpanded, mode);
    const projected = performance.now();
    beginLocalTransition(nextScene);
    dispatch({ type: "setExpansion", expandedGroupIds: nextExpanded, selectedId: node.instanceId, snapshot });
    const frameGroupId = system ? system.frameParent(node.expandGroupId) : parentGenericGroup(catalog.id, node.expandGroupId);
    scheduleContinuousFrame(nextScene, frameGroupId, operationId);
    reportContinuousTiming(started, projected);
  }

  function openSource(instanceId: string) {
    const node = scene.nodes.find((item) => item.instanceId === instanceId);
    const action = node ? sourceActionsForNode(catalog, node, mode)[0] : undefined;
    if (!node || !action) return;
    if (!beforePanel.current) {
      beforePanelOwner.current = cameraOwner.current;
      beforePanel.current = cameraOwner.current === "automatic" && automaticViewport.current ? automaticViewport.current : flow.getViewport();
    }
    if (navRef.current.sourceSelection) dispatch({ type: "closeSource" });
    setEnvironmentOpen(false);
    framedPanelKey.current = null;
    dispatch({ type: "select", instanceId });
    dispatch({ type: "openSource", selection: { sourceId: action.id, bindingId: action.bindingId } });
  }

  function restorePanelViewport() {
    framedPanelKey.current = null;
    if (beforePanel.current) {
      flow.setViewport(beforePanel.current, { duration: 0 });
      publishZoom(beforePanel.current.zoom);
      cameraOwner.current = beforePanelOwner.current;
      automaticViewport.current = beforePanelOwner.current === "automatic" ? beforePanel.current : null;
      beforePanel.current = null;
    }
  }

  function closeSource() {
    dispatch({ type: "closeSource" });
    restorePanelViewport();
  }

  function openEnvironment() {
    if (!beforePanel.current) {
      beforePanelOwner.current = cameraOwner.current;
      beforePanel.current = cameraOwner.current === "automatic" && automaticViewport.current ? automaticViewport.current : flow.getViewport();
    }
    if (navRef.current.sourceSelection) dispatch({ type: "closeSource" });
    framedPanelKey.current = null;
    setEnvironmentOpen(true);
  }

  function closeEnvironment() {
    setEnvironmentOpen(false);
    restorePanelViewport();
  }

  function onUp() {
    if (navRef.current.sourceSelection) {
      closeSource();
      return;
    }
    if (environmentOpen) {
      closeEnvironment();
      return;
    }
    if (continuous && navRef.current.interactionHistory.length) {
      const snapshot = navRef.current.interactionHistory.at(-1);
      dispatch({ type: "restoreInteraction" });
      if (snapshot) {
        flow.setViewport(snapshot.viewport, { duration: 0 });
        publishZoom(snapshot.viewport.zoom);
        cameraOwner.current = snapshot.cameraOwner ?? "automatic";
        automaticViewport.current = cameraOwner.current === "automatic" ? snapshot.viewport : null;
      }
      return;
    }
    const controls = host();
    if (controls.getNav().phase !== "idle") begin(controls);
    const index = controls.getNav().history.length - 1;
    if (index < 0) return;
    void restoreTo(controls, index);
  }

  function onRail(step: SceneNode) {
    if (continuous) {
      if (!system) {
        const occurrence = scene.nodes.find((node) => node.instanceId === step.instanceId);
        if (occurrence?.expandGroupId) expandContinuous(occurrence);
        else dispatch({ type: "select", instanceId: step.instanceId });
        return;
      }
      const occurrenceId = system.railOccurrence(step.instanceId);
      const occurrence = scene.nodes.find((node) => node.instanceId === occurrenceId);
      if (occurrence?.expandGroupId) expandContinuous(occurrence);
      else dispatch({ type: "select", instanceId: occurrenceId });
      return;
    }
    const controls = host();
    const current = controls.getNav();
    if (step.drillInto) {
      const destId = resolveScene(catalog, step.drillInto, mode);
      if (current.sceneId === destId) return;
      const depth = current.focusPath.indexOf(destId);
      if (depth >= 0 && depth < current.focusPath.length - 1) {
        void restoreTo(controls, depth);
        return;
      }
      if (current.sceneId === catalog.rootSceneId) {
        void enterScene(controls, step.instanceId);
        return;
      }
      void restoreTo(controls, 0).then(() => enterScene(host(), step.instanceId));
      return;
    }
    if (current.sceneId !== catalog.rootSceneId && current.history.length) {
      void restoreTo(controls, 0).then(() => dispatch({ type: "select", instanceId: step.instanceId }));
      return;
    }
    dispatch({ type: "select", instanceId: step.instanceId });
  }

  function changeMode(next: Mode) {
    tokenRef.current += 1;
    setMode(next);
    if (continuous) return;
    const mapped = resolveScene(catalog, nav.sceneId, next);
    if (mapped === nav.sceneId) return;
    const dest = catalog.scenes[mapped];
    if (!dest) return;
    const layout = layouts[dest.id] ?? authoredLayout(dest);
    if (!layouts[dest.id]) setLayouts((current) => ({ ...current, [dest.id]: layout }));
    dispatch({ type: "swapScene", sceneId: dest.id, businessStepId: dest.businessStepId });
    frame(layout, dest.guides);
  }

  const journey = root;
  const selected = scene.nodes.find((node) => node.instanceId === nav.selectedId) ?? null;
  const bothModes = root.modes.includes("implemented") && root.modes.includes("proposed");
  const continuousPath = system
    ? [system.rootLabel, ...nav.expandedGroupIds.map((id) => system.labels[id] ?? id)]
    : [root.title, ...nav.expandedGroupIds.map((id) => genericGroupLabel(catalog.id, id))];
  const handleFlowNodeClick = useCallback((_: unknown, node: FlowNode) => {
    dispatch({ type: "select", instanceId: node.id });
  }, [dispatch]);
  const handleFlowNodeDoubleClick = useCallback((_: unknown, node: FlowNode) => {
    const occurrence = sceneRef.current.nodes.find((item) => item.instanceId === node.id);
    if (continuousSystems[catalog.id] && occurrence?.expandGroupId) expandContinuousRef.current(occurrence);
    else if (hostRef.current) void enterScene(hostRef.current, node.id);
  }, [catalog.id]);
  const handleFlowMoveStart = useCallback((event: unknown) => {
    if (event) {
      cameraOwner.current = "user";
      automaticViewport.current = null;
    }
  }, []);
  const handleFlowMoveEnd = useCallback((event: unknown, viewport: Viewport) => {
    if (event) {
      cameraOwner.current = "user";
      automaticViewport.current = null;
    }
    publishZoom(viewport.zoom);
  }, [publishZoom]);

  return (
    <section
      ref={explorerRef}
      className={`map-explorer ${expanded ? "is-expanded" : ""} ${localTransition ? "is-local-transition" : ""}`}
      aria-label={`${title} architecture explorer`}
      data-testid="architecture-explorer"
      data-scene-id={scene.id}
      data-selected-id={nav.selectedId ?? ""}
      data-phase={nav.phase}
      data-history-depth={continuous ? nav.interactionHistory.length : nav.history.length}
      data-system-id={catalog.id}
      data-expanded-groups={nav.expandedGroupIds.join(",")}
      data-zoom={zoomRef.current}
      data-mode={mode}
      data-platform-focus={nav.platformFocus ?? ""}
      data-layout={laid.engine}
      data-representation-generation={representationGeneration}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-action='explore'],[data-action='expand'],[data-action='collapse']")) {
          (globalThis as { __mapInputEventAt?: number }).__mapInputEventAt = performance.now();
        }
      }}
      onClick={(event) => {
        const action = (event.target as HTMLElement).closest("[data-action]")?.getAttribute("data-action");
        const id = (event.target as HTMLElement).closest(".react-flow__node")?.getAttribute("data-id");
        if (!action || !id) return;
        event.stopPropagation();
        const occurrence = scene.nodes.find((node) => node.instanceId === id);
        if (continuous && action === "expand" && occurrence) expandContinuous(occurrence);
        else if (continuous && action === "collapse" && occurrence) collapseContinuous(occurrence);
        if (action === "explore") void enterScene(host(), id);
        if (action === "source") openSource(id);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        const node = (event.target as HTMLElement).closest(".react-flow__node");
        const id = node?.getAttribute("data-id");
        if (id && event.target === node) {
          event.preventDefault();
          const occurrence = scene.nodes.find((item) => item.instanceId === id);
          if (continuous && occurrence?.expandGroupId) expandContinuous(occurrence);
          else void enterScene(host(), id);
        }
      }}
    >
      <div className="map-bar">
        <h2>{title}</h2>
        <div className="map-actions">
          {bothModes ? (
            <div className="diagram-toggle" role="group" aria-label="System implementation">
              <button type="button" className={mode === "implemented" ? "active" : ""} aria-pressed={mode === "implemented"} onClick={() => changeMode("implemented")}>Implemented</button>
              <button type="button" className={mode === "proposed" ? "active" : ""} aria-pressed={mode === "proposed"} onClick={() => changeMode("proposed")}>Proposed</button>
            </div>
          ) : <span className={`map-mode-status is-${mode}`}>{mode === "implemented" ? "Implemented" : "Proposed"}</span>}
          <button type="button" onClick={onUp} disabled={(continuous ? nav.interactionHistory.length : nav.history.length) < 1 && !nav.sourceSelection && !environmentOpen}>{continuous ? "Back" : "Up a level"}</button>
          <button type="button" onClick={() => frame(laid, scene.guides)}>Fit</button>
          {selected && sourceActionsForNode(catalog, selected, mode).length ? <button type="button" onClick={() => openSource(selected.instanceId)}>View source</button> : null}
          <button type="button" aria-label={expanded ? "Exit full screen" : "Full screen diagram"} onClick={() => setExpanded((value) => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        </div>
      </div>
      <div className={`map-context ${isOverview ? "is-overview" : ""}`}>
        {!isOverview && !continuous ? (
          <div className="map-subject">
            <h3>{scene.title}</h3>
            <p>{title}</p>
          </div>
        ) : null}
        <ol className="map-rail" aria-label={isOverview || !system ? "Business journey" : system.railLabel}>
          {(isOverview || !system
            ? journey.nodes.filter((step) => step.role === "activity")
            : system.stages
          ).map((step, index) => (
            <li key={step.instanceId}>
              {index > 0 ? <span aria-hidden="true">→</span> : null}
              <button type="button" aria-current={!isOverview && (continuous
                ? !system
                  ? scene.nodes.find((node) => node.instanceId === step.instanceId)?.expanded
                  : system.stages.some((stage) => stage.instanceId === step.instanceId && nav.expandedGroupIds.includes(stage.groupId))
                : (step.instanceId === "check" && ["brahe.check", "brahe.inspect-request", "brahe.scope-control"].includes(scene.id))
                  || (step.instanceId === "build" && ["brahe.build", "brahe.hosting", "brahe.hosting-proposed"].includes(scene.id))
                  || (step.instanceId === "return-stage" && ["brahe.return-stage", "brahe.inspect-response", "brahe.answer-control"].includes(scene.id))) ? "step" : undefined} onClick={() => {
                if (continuous || isOverview) onRail(step as SceneNode);
                else {
                  const target = step.instanceId === "check" ? "brahe.check" : step.instanceId === "build" ? "brahe.build" : "brahe.return-stage";
                  if (scene.id !== target) void enterScene(host(), step.instanceId, target);
                }
              }}>{step.displayLabel}</button>
            </li>
          ))}
        </ol>
        {continuous && !isOverview ? (
          <details className="map-path">
            <summary>Path · {continuousPath.at(-1)}</summary>
            <div className="map-path-detail">{continuousPath.join(" / ")}</div>
          </details>
        ) : !continuous ? (
          <nav className="map-crumb" aria-label="Technical scope">
            {nav.focusPath.map((id, index) => {
            const item = catalog.scenes[id];
            const current = index === nav.focusPath.length - 1;
            return (
              <span key={`${id}-${index}`}>
                {index > 0 ? <span aria-hidden="true"> / </span> : null}
                <button type="button" aria-current={current ? "page" : undefined} disabled={current} onClick={() => { if (index < nav.history.length) void restoreTo(host(), index); }}>{item?.title ?? id}</button>
              </span>
            );
            })}
          </nav>
        ) : null}
        {catalog.environment.length > 0 ? (
          <button type="button" className="map-env-trigger" aria-expanded={environmentOpen} onClick={environmentOpen ? closeEnvironment : openEnvironment}>
            Environment details
          </button>
        ) : null}
      </div>
      {!isOverview && catalog.platforms?.length ? (
        <div className="map-focus-row">
          <div className="map-focus-select" role="radiogroup" aria-label="Platform focus">
            <button type="button" role="radio" aria-checked={!platformFocus} onClick={() => dispatch({ type: "setFocus", platformFocus: null })}>All platforms</button>
            {catalog.platforms.map((platform) => (
              <button
                key={platform.id}
                type="button"
                role="radio"
                aria-label={platform.name}
                aria-checked={platformFocus === platform.id}
                onClick={() => dispatch({ type: "setFocus", platformFocus: platform.id })}
              >
                {platform.id === "cisco-ai-defense" ? "AI Defense" : platform.id === "splunk-agent-observability" ? "Agent Observability" : "AI Infrastructure"}
              </button>
            ))}
          </div>
          <p className="map-focus-summary" aria-live="polite">
            {focusPlatform
              ? focusNamesPlatform(catalog, scene, focusPlatform.id, mode)
                ? `${focusPlatform.contribution} ${scene.purpose}`
                : `No direct integration shown at this step. ${focusPlatform.contribution} ${scene.purpose}`
              : scene.purpose}
          </p>
        </div>
      ) : <p className="map-purpose">{scene.purpose}</p>}
      <div ref={stageRef} className="map-stage">
        <div ref={canvasRef} className={`map-canvas is-${veil}`}>
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            nodesFocusable
            deleteKeyCode={null}
            zoomOnDoubleClick={false}
            selectionOnDrag={false}
            colorMode={theme}
            minZoom={0.45}
            maxZoom={1.35}
            proOptions={{ hideAttribution: true }}
            onNodeClick={handleFlowNodeClick}
            onNodeDoubleClick={handleFlowNodeDoubleClick}
            onMoveStart={handleFlowMoveStart}
            onMoveEnd={handleFlowMoveEnd}
          >
            <Background variant={BackgroundVariant.Dots} color={EDGE_PALETTES[theme].dots} gap={28} size={1} />
            <ViewportPortal>
              <div className="map-guides">
                {scene.guides?.map((guide) => <div key={guide.label} className="map-guide" style={{ left: guide.x, width: guide.width }}>{guide.label}</div>)}
              </div>
            </ViewportPortal>
            <Panel position="bottom-left" className="map-zoom">
              <button type="button" aria-label="Zoom in" onClick={() => flow.zoomIn({ duration: 0 })}><Plus size={16} /></button>
              <button type="button" aria-label="Zoom out" onClick={() => flow.zoomOut({ duration: 0 })}><Minus size={16} /></button>
            </Panel>
          </ReactFlow>
          {shell ? (
            <div ref={shellRef} className={`map-shell role-${shell.role}`} style={{ left: shell.from.x, top: shell.from.y, width: shell.from.width, height: shell.from.height }} aria-hidden="true" inert>
              <strong>{shell.title}</strong>
            </div>
          ) : null}
        </div>
        {nav.sourceSelection ? (
          <SourceInspector
            sourceId={nav.sourceSelection.sourceId}
            sourceIds={selected ? sourceActionsForNode(catalog, selected, mode).map((source) => source.id) : [nav.sourceSelection.sourceId]}
            labels={Object.fromEntries((selected ? sourceActionsForNode(catalog, selected, mode) : []).map((item) => [item.id, item.label]))}
            attribution={selected ? sourceAttribution(catalog, selected, mode, sourceActionsForNode(catalog, selected, mode).find((item) => item.id === nav.sourceSelection?.sourceId)) : null}
            width={sourceWidth}
            drawer={narrow}
            onWidth={setSourceWidth}
            onSelect={(id) => {
              const action = selected ? sourceActionsForNode(catalog, selected, mode).find((item) => item.id === id) : undefined;
              dispatch({ type: "openSource", selection: { sourceId: id, bindingId: action?.bindingId ?? nav.sourceSelection?.bindingId } });
            }}
            onClose={closeSource}
          />
        ) : environmentOpen ? (
          <EnvironmentInspector
            lines={catalog.environment}
            width={sourceWidth}
            drawer={narrow}
            onWidth={setSourceWidth}
            onClose={closeEnvironment}
          />
        ) : null}
      </div>
    </section>
  );
}

export default function Explorer({ caseId, title }: { caseId: string; title: string }) {
  const catalog = catalogs[caseId];
  if (!catalog) {
    return <section className="map-explorer" data-testid="architecture-explorer" data-phase="idle"><p className="map-purpose">This use case has no architecture scene.</p></section>;
  }
  return (
    <ReactFlowProvider>
      <Canvas catalog={catalog} title={title} />
    </ReactFlowProvider>
  );
}
