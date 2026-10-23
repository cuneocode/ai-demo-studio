"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { guideAnchor } from "../../guide/anchors.ts";
import { useTheme } from "../../theme.ts";
import type { Catalog } from "../catalog.ts";
import { EnvironmentInspector, SourceInspector } from "../inspector.tsx";
import { sourceActionsForNode, type Mode } from "../scene-model.ts";
import { sourceAttribution } from "../source-attribution.ts";
import { diagramNode, type DiagramLayer, type DiagramPage } from "./model.ts";
import { composeCanvas } from "./canvas.ts";
import { componentTypes, primaryComponentTypes } from "./components.ts";
import { canvasScopePath, visibleCanvasItems } from "./canvas-layout.ts";
import "../map.css";
import "./drawio.css";

const layerLabels: Record<DiagramLayer, string> = { security: "Security", observability: "Observability", deployment: "AI Infrastructure" };
const channel = "studio-drawio";
type Frame = { scopeId: string; id: number };
type Navigation = { frames: Frame[]; selection: string | null; sourceId: string | null; environment: boolean };

export default function DrawioExplorer({ catalog, pages, asset, title }: { catalog: Catalog; pages: DiagramPage[]; asset: string; title: string }) {
  const theme = useTheme();
  const documentModel = useMemo(() => composeCanvas(pages, catalog), [pages, catalog]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const nextFrame = useRef(1);
  const [nav, setNav] = useState<Navigation>({ frames: [{ scopeId: documentModel.rootScopeId, id: 0 }], selection: null, sourceId: null, environment: false });
  const modes = catalog.scenes[catalog.rootSceneId].modes;
  const [mode, setMode] = useState<Mode>(modes[0]);
  const [layers, setLayers] = useState<DiagramLayer[]>([]);
  const [readyConfig, setReadyConfig] = useState<string | null>(null);
  const [hasRendered, setHasRendered] = useState(false);
  const [error, setError] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [sourceWidth, setSourceWidth] = useState(760);
  const [retry, setRetry] = useState(0);
  const { scopeId: focusScopeId, id: navigationId } = nav.frames.at(-1)!;
  const scope = documentModel.scopes[focusScopeId];
  const expanded = useMemo(() => nav.frames.slice(1).map((frame) => frame.scopeId), [nav.frames]);
  const visible = useMemo(() => visibleCanvasItems(documentModel, expanded, mode, layers), [documentModel, expanded, mode, layers]);
  const selected = visible.find((item) => item.id === nav.selection);
  const selectedNode = selected ? diagramNode(catalog, selected) : null;
  const sources = selected ? [selected, ...(selected.aliases ?? [])].flatMap((item) => sourceActionsForNode(catalog, diagramNode(catalog, item), mode)).filter((item, index, all) => all.findIndex((source) => source.id === item.id) === index) : [];
  const source = sources.find((item) => item.id === nav.sourceId) ?? sources[0];
  const availableLayers = (["security", "observability", "deployment"] as DiagramLayer[]).filter((layer) => pages.some(page => page.layers.includes(layer)));
  const configKey = JSON.stringify({ asset, expanded, focusScopeId, navigationId, viewport: fullScreen, mode, theme, layers });
  const post = useCallback((message: object) => frameRef.current?.contentWindow?.postMessage({ channel, ...message }, window.location.origin), []);
  const renderCanvas = useCallback(() => post({ type: "render", ...JSON.parse(configKey), configKey }), [post, configKey]);
  const focusScope = useCallback((scopeId: string, toggle = false) => {
    const path = canvasScopePath(documentModel, scopeId);
    if (!path.length) return;
    const transitionId = nextFrame.current++;
    setNav((state) => {
      const index = state.frames.findIndex((frame) => frame.scopeId === scopeId);
      if (toggle && index > 0) return { ...state, frames: state.frames.slice(0, index), selection: null, sourceId: null, environment: false };
      const frames = path.map((id, position) => state.frames[position]?.scopeId === id ? state.frames[position] : { scopeId: id, id: transitionId * 10 + position });
      return { frames, selection: null, sourceId: null, environment: false };
    });
  }, [documentModel]);
  const back = useCallback(() => {
    setNav((state) => state.selection || state.environment ? { ...state, selection: null, sourceId: null, environment: false } : state.frames.length > 1 ? { ...state, frames: state.frames.slice(0, -1) } : state);
  }, []);
  const inspect = useCallback((id: string) => { if (visible.some((item) => item.id === id)) setNav((state) => ({ ...state, selection: id, sourceId: null, environment: false })); }, [visible]);
  const select = useCallback((id: string) => {
    const item = visible.find((entry) => entry.id === id);
    if (!item) return;
    if (item.childScopeId) focusScope(item.childScopeId, true);
    else if (item.targetPageId) focusScope(item.targetPageId);
    else inspect(id);
  }, [visible, focusScope, inspect]);
  function toggleLayer(layer: DiagramLayer) {
    const enabled = layers.includes(layer);
    const closing = nav.frames.find(frame => documentModel.items[documentModel.scopes[frame.scopeId].ownerId ?? ""]?.layer === layer);
    if (!enabled && nav.frames.length === 1) focusScope("system");
    else if (enabled && closing) focusScope(documentModel.scopes[closing.scopeId].parentScopeId!);
    else if (enabled && selected?.layer === layer) setNav(state => ({ ...state, selection: null, sourceId: null }));
    setLayers(state => enabled ? state.filter(item => item !== layer) : [...state, layer]);
  }

  useEffect(() => { renderCanvas(); }, [renderCanvas]);
  useEffect(() => {
    const resize = () => { if (frameRef.current?.offsetWidth && frameRef.current?.offsetHeight) post({ type: "fit" }); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [post]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin || event.data?.channel !== channel) return;
      const data = event.data;
      if (data.type === "ready") renderCanvas();
      if (data.type === "rendered" && data.configKey === configKey) { setReadyConfig(configKey); setHasRendered(true); setError(false); }
      if (data.type === "error") setError(true);
      if (data.type === "select" && typeof data.cellId === "string") select(data.cellId);
      if (data.type === "inspect" && typeof data.cellId === "string") inspect(data.cellId);
      if (data.type === "back") back();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [renderCanvas, configKey, select, inspect, back]);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (readyConfig !== configKey) setError(true); }, 12000);
    return () => window.clearTimeout(timer);
  }, [configKey, readyConfig, retry]);
  useEffect(() => {
    if (!fullScreen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [fullScreen]);

  return (
    <section className={`map-explorer drawio-explorer ${fullScreen ? "is-expanded" : ""}`} data-testid="architecture-explorer" data-renderer="drawio" data-system-id={catalog.id} data-canvas-id={`${catalog.id}.architecture`} data-scene-id={`${catalog.id}.architecture`} data-scope-id={scope.id} data-expanded-groups={expanded.join(",")} data-phase={error ? "error" : readyConfig === configKey ? "idle" : hasRendered ? "animating" : "loading"} data-mode={mode} aria-label={`${title} architecture explorer`} {...guideAnchor("arch.explorer")}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); if (!nav.selection && !nav.environment && nav.frames.length === 1) setFullScreen(false); else back(); } }}>
      <div className="map-bar">
        <div className="drawio-heading"><h2>{title}</h2></div>
        <div className="map-actions"><button type="button" aria-label={fullScreen ? "Exit full screen" : "Full screen diagram"} onClick={() => setFullScreen((value) => !value)}>{fullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button></div>
      </div>
      <div className="drawio-navigation" {...guideAnchor("arch.rail")}>
        <button className="drawio-back" type="button" onClick={back} disabled={nav.frames.length === 1 && !nav.selection && !nav.environment}><ArrowLeft size={15} /> Back</button>
        <nav className="map-crumb" aria-label="Architecture depth">{nav.frames.map((frame, index) => <span key={frame.id}>{index > 0 ? <span aria-hidden="true"> / </span> : null}<button type="button" aria-current={frame.scopeId === scope.id ? "page" : undefined} disabled={frame.scopeId === scope.id} onClick={() => focusScope(frame.scopeId)}>{documentModel.scopes[frame.scopeId].title}</button></span>)}</nav>
        {nav.frames.length > 1 ? <button className="drawio-back drawio-reset" type="button" onClick={() => focusScope(documentModel.rootScopeId)}>Collapse all</button> : null}
      </div>
      <div className="drawio-summary"><p>{scope.purpose}</p></div>
      <div className="drawio-controls">
        {availableLayers.length ? <div className="drawio-layers" role="group" aria-label="Diagram layers" {...guideAnchor("arch.focus")}>{availableLayers.map((layer) => <button key={layer} type="button" aria-pressed={layers.includes(layer)} onClick={() => toggleLayer(layer)}><span className={`drawio-dot is-${layer}`} />{layerLabels[layer]}</button>)}</div> : null}
        <div className="diagram-toggle" role="group" aria-label="System implementation" {...guideAnchor("arch.mode")}>{modes.map((item) => <button key={item} type="button" className={mode === item ? "active" : ""} aria-pressed={mode === item} onClick={() => { setMode(item); setNav((state) => ({ ...state, selection: null, sourceId: null })); }}>{item === "implemented" ? "Implemented" : "Proposed"}</button>)}</div>
        <button type="button" className="map-env-trigger" aria-expanded={nav.environment} onClick={() => setNav((state) => ({ ...state, environment: !state.environment, selection: null, sourceId: null }))} {...guideAnchor("arch.env")}>Environment details</button>
      </div>
      <div className="drawio-key" role="group" aria-label="Component key"><span>Components</span>{primaryComponentTypes.map(type => <span key={type} title={componentTypes[type].meaning}><span className="drawio-key-symbol" aria-hidden="true" style={{ maskImage: `url(/vendor/drawio/carbon/${componentTypes[type].icon}.svg)` }} />{componentTypes[type].label}</span>)}</div>
      <div className="map-stage">
        <div className="map-canvas drawio-canvas" {...guideAnchor("arch.canvas")}>
          <iframe key={`continuous:${retry}`} ref={frameRef} src="/diagrams/viewer.html" title={`${title} architecture canvas`} onLoad={renderCanvas} onError={() => setError(true)} />
          {!hasRendered && !error ? <div className="drawio-loading" role="status">Loading architecture…</div> : null}
          {error ? <div className="drawio-loading" role="alert"><p>The architecture diagram could not be loaded.</p><button type="button" onClick={() => { setError(false); setReadyConfig(null); setHasRendered(false); setRetry((value) => value + 1); }}>Retry diagram</button></div> : null}
          <div className="map-zoom drawio-zoom"><button type="button" aria-label="Zoom out" onClick={() => post({ type: "zoom", factor: .85 })}><Minus size={16} /></button><button type="button" onClick={() => post({ type: "fit" })}>Fit focus</button><button type="button" aria-label="Zoom in" onClick={() => post({ type: "zoom", factor: 1.15 })}><Plus size={16} /></button></div>
        </div>
        {selectedNode && source ? <SourceInspector sourceId={source.id} sourceIds={sources.map((item) => item.id)} labels={Object.fromEntries(sources.map((item) => [item.id, item.label]))} attribution={sourceAttribution(catalog, selectedNode, mode, source)} width={sourceWidth} maxWidth={1100} drawer onWidth={setSourceWidth} onSelect={(id) => setNav((state) => ({ ...state, sourceId: id }))} onClose={() => setNav((state) => ({ ...state, selection: null, sourceId: null }))} /> : selected && selectedNode ? (
          <aside className="map-source is-drawer" aria-label="Component details"><div className="map-source-bar"><strong>{selected.label}</strong><button type="button" onClick={() => setNav((state) => ({ ...state, selection: null }))}>Close details</button></div><div className="map-source-body"><h3>{selectedNode.displayLabel}</h3><p>{selectedNode.supportingByMode?.[mode] ?? selectedNode.supportingText ?? scope.purpose}</p>{selectedNode.detail ? <p className="drawio-detail-text">{selectedNode.detail}</p> : null}</div></aside>
        ) : null}
        {nav.environment ? <EnvironmentInspector lines={catalog.environment} width={sourceWidth} drawer onWidth={setSourceWidth} onClose={() => setNav((state) => ({ ...state, environment: false }))} /> : null}
      </div>
      <div className="drawio-footer"><p>{mode === "proposed" ? "Proposed view. " : ""}Expand a component to reveal its contents. Drag the background to pan; use Ctrl or ⌘ with the wheel to zoom.</p><a href={asset} download><Download size={14} /> Editable diagram</a></div>
      <details className="drawio-accessible"><summary>Diagram components</summary><div>{visible.map((item) => <span key={item.id}><button type="button" onClick={() => select(item.id)}>{item.label}{item.childScopeId ? expanded.includes(item.childScopeId) ? " · Collapse" : " · Expand" : item.targetPageId ? " · Focus" : " · Details"}</button>{item.childScopeId ? <button type="button" aria-label={`${item.label} details`} onClick={() => inspect(item.id)}>Details</button> : null}</span>)}</div></details>
    </section>
  );
}
