/* global GraphViewer, mxEvent, mxPoint */
import { canvasScopePath, fitCanvasCamera, layoutCanvas, routeCanvasConnection, visibleCanvasEdges } from './canvas-layout.js';
import { componentLabel, componentTypes } from './components.js';

const canvas = document.getElementById('canvas');
const overview = document.getElementById('overview');
const channel = 'studio-drawio';
const send = data => parent.postMessage({ channel, ...data }, location.origin);
const darkColors = {
  '#ffffff':'#0b111b', '#1e293b':'#eef2f8', '#64748b':'#b5c3d6', '#f1f5f9':'#192333',
  '#94a3b8':'#64748b', '#ede9fe':'#292239', '#a78bfa':'#a58cc9', '#e8efff':'#1e2b43',
  '#7795c6':'#7997c8', '#fff3d6':'#302a1f', '#bc9453':'#bc9453', '#e7f3f2':'#172b30',
  '#6a9b98':'#6a9b98', '#cbd5e1':'#46566e', '#446ac4':'#9bb8ff', '#298165':'#8fd0b0',
  '#a37524':'#ddbd83', '#8555b6':'#bd9ee5', '#6c7a90':'#aab4c6',
};
let viewer, documentModel, loading, current, lastLayout, renderedKey, pendingKey;
let revision = 0;
let animation = 0;
let modelLoads = 0;
let requestedNavigationId, requestedViewport;
let needsFit = false;
let pointerStart;
const baseStyles = new Map();
const cameras = new Map();
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const scopeActive = (id, config) => id === documentModel.rootScopeId || (config.expanded.includes(id) && canvasScopePath(documentModel, id).slice(1).every(scopeId => config.expanded.includes(scopeId)));
const active = (item, config) => (!item.layer || config.layers.includes(item.layer)) && (!item.modes || item.modes.includes(config.mode));
function activate(id, details = false) {
  const item = documentModel.items[id];
  if (!item) return;
  send({ type: details ? 'inspect' : 'select', cellId: id });
}
class StudioViewer extends GraphViewer {
  addClickHandler() {}
  addSizeHandler() {}
  positionGraph() {}
  crop() {}
  updateContainerHeight() {}
}
function describeCells() {
  if (!viewer || !lastLayout) return;
  const graph = viewer.graph;
  const model = graph.getModel();
  for (const item of Object.values(documentModel.items)) {
    const native = model.getCell(item.id);
    const state = graph.view.getState(native);
    const shape = state?.shape?.node;
    if (!shape || !lastLayout.visibleIds.includes(item.id)) continue;
    const expanded = item.childScopeId && current.expanded.includes(item.childScopeId);
    shape.setAttribute('data-cell-id', item.id);
    shape.setAttribute('data-local-id', item.localId);
    shape.setAttribute('data-scope-id', item.scopeId);
    shape.setAttribute('data-entity-id', native.value.getAttribute('entityId') || item.instanceId);
    shape.setAttribute('data-component-type', item.componentType);
    if (item.childScopeId) {
      shape.setAttribute('data-child-scope-id', item.childScopeId);
      shape.setAttribute('aria-expanded', String(Boolean(expanded)));
    }
    shape.setAttribute('role', 'button');
    shape.setAttribute('tabindex', '0');
    shape.setAttribute('aria-label', `${item.labelByMode?.[current.mode] ?? item.label} · ${componentTypes[item.componentType].label}${item.childScopeId ? expanded ? ' · Collapse' : ' · Expand' : item.targetPageId ? ' · Focus related component' : ' · Details'}`);
    state.text?.node?.setAttribute('data-label-for', item.id);
    shape.onclick = event => {
      event.stopPropagation();
      if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) return;
      if (expanded && event.clientY - shape.getBoundingClientRect().top > 48 * graph.view.scale) return;
      activate(item.id);
    };
    shape.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); activate(item.id); }
      if (event.key.toLowerCase() === 'i') { event.preventDefault(); activate(item.id, true); }
    };
  }
  for (const edge of documentModel.edges) {
    const state = graph.view.getState(model.getCell(edge.id));
    if (state?.shape?.node) {
      state.shape.node.setAttribute('data-edge-id', edge.id);
      state.shape.node.setAttribute('data-source-id', model.getTerminal(model.getCell(edge.id), true)?.id ?? '');
      state.shape.node.setAttribute('data-target-id', model.getTerminal(model.getCell(edge.id), false)?.id ?? '');
      state.shape.node.setAttribute('data-edge-kind', edge.kind ?? 'request');
      state.shape.node.setAttribute('data-edge-layer', edge.layer ?? '');
    }
  }
  canvas.dataset.modelLoads = String(modelLoads);
  canvas.dataset.expanded = current.expanded.join(',');
  canvas.dataset.zoom = graph.view.scale.toFixed(4);
  canvas.dataset.camera = JSON.stringify(Object.values(readCamera()).map(value => Math.round(value * 10000) / 10000));
  renderOverview();
}
function readCamera() {
  const view = viewer.graph.view;
  return { scale: view.scale, x: view.translate.x, y: view.translate.y, left: canvas.scrollLeft, top: canvas.scrollTop };
}
function setCamera(camera) {
  viewer.graph.view.scaleAndTranslate(camera.scale, camera.x, camera.y);
  canvas.scrollLeft = camera.left ?? 0;
  canvas.scrollTop = camera.top ?? 0;
}
const boundsOf = boxes => {
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x, height: Math.max(...boxes.map(box => box.y + box.height)) - y };
};
function focusBounds(layout, config, all = false) {
  const scope = documentModel.scopes[config.focusScopeId];
  if (all || !scope?.ownerId) return boundsOf(layout.visibleIds.map(id => layout.absolute[id]));
  const parent = documentModel.scopes[scope.parentScopeId];
  const siblings = parent.id !== documentModel.rootScopeId && parent.level < 2
    ? parent.cellIds.filter(id => layout.visibleIds.includes(id)) : [scope.ownerId];
  return boundsOf(siblings.map(id => layout.absolute[id]));
}
function cameraFor(bounds, all = false) {
  return fitCanvasCamera(bounds, canvas.clientWidth, canvas.clientHeight, all);
}
function styleFor(id, theme) {
  const style = baseStyles.get(id) ?? '';
  return theme === 'dark' ? style.replace(/#[a-f0-9]{6}/gi, color => darkColors[color.toLowerCase()] || color) : style;
}
function applyState(config, layout) {
  const model = viewer.graph.getModel();
  const projected = new Map(visibleCanvasEdges(documentModel, config.expanded, config.mode, config.layers, layout.visibleIds).map(edge => [edge.id, edge]));
  model.beginUpdate();
  try {
    for (const item of Object.values(documentModel.items)) {
      const native = model.getCell(item.id);
      const expanded = Boolean(item.childScopeId && config.expanded.includes(item.childScopeId));
      model.setCollapsed(native, Boolean(item.childScopeId && !expanded));
      model.setVisible(native, active(item, config));
      let style = styleFor(item.id, config.theme);
      if (expanded) style += 'verticalAlign=top;align=left;spacingTop=12;spacingLeft=16;fillOpacity=25;absoluteArcSize=1;arcSize=12;';
      model.setStyle(native, style);
      const value = native.value.cloneNode(true);
      value.setAttribute('label', componentLabel(item, expanded, config.mode, config.theme, documentModel.symbols));
      model.setValue(native, value);
    }
    for (const box of documentModel.boundaries) {
      const native = model.getCell(box.id);
      model.setStyle(native, styleFor(box.id, config.theme));
      model.setVisible(native, Boolean(layout.boundaries[box.id]) && scopeActive(box.scopeId, config));
      if (layout.boundaries[box.id]) {
        const geometry = native.geometry.clone();
        Object.assign(geometry, layout.boundaries[box.id]);
        model.setGeometry(native, geometry);
      }
    }
    for (const original of documentModel.edges) {
      const edge = projected.get(original.id) ?? original;
      const native = model.getCell(edge.id);
      const show = projected.has(edge.id);
      model.setVisible(native, show);
      model.setTerminal(native, model.getCell(edge.from), true);
      model.setTerminal(native, model.getCell(edge.to), false);
      if (!show) continue;
      const value = native.value.cloneNode(true);
      value.setAttribute('label', edge.label);
      model.setValue(native, value);
      let style = styleFor(edge.id, config.theme);
      const from = layout.absolute[edge.from], to = layout.absolute[edge.to];
      const dx = to.x + to.width / 2 - from.x - from.width / 2;
      const fromAnchor = (layout.anchors[edge.from] ?? from.height / 2) / from.height;
      const toAnchor = (layout.anchors[edge.to] ?? to.height / 2) / to.height;
      const dy = to.y + to.height * toAnchor - from.y - from.height * fromAnchor;
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
      const exit = edge.exit ?? (horizontal ? [dx > 0 ? 1 : 0, fromAnchor] : [.5, dy > 0 ? 1 : 0]);
      const entry = edge.entry ?? (horizontal ? [dx > 0 ? 0 : 1, toAnchor] : [.5, dy > 0 ? 0 : 1]);
      style += `exitX=${exit[0]};exitY=${exit[1]};entryX=${entry[0]};entryY=${entry[1]};exitPerimeter=0;entryPerimeter=0;`;
      const geometry = native.geometry.clone();
      geometry.points = null;
      const a = documentModel.items[edge.from], b = documentModel.items[edge.to];
      const localA = layout.cells[a.id], localB = layout.cells[b.id];
      if (a.scopeId === edge.scopeId && b.scopeId === edge.scopeId && Math.abs((localA.x - a.x) - (localB.x - b.x)) < .1 && Math.abs((localA.y - a.y) - (localB.y - b.y)) < .1) {
        if (edge.via) geometry.points = edge.via.map(([x, y]) => new mxPoint(x + localA.x - a.x, y + localA.y - a.y));
        geometry.offset = edge.labelOffset ? new mxPoint(...edge.labelOffset) : null;
        if (edge.routed) style = style.replace('edgeStyle=orthogonalEdgeStyle;', 'edgeStyle=none;');
      } else geometry.offset = null;
      // Replies use a reserved rail above a linear workflow.
      if (documentModel.scopes[edge.scopeId].flow && a.scopeId === edge.scopeId && b.scopeId === edge.scopeId && dx < 0 && Math.abs(dy) < 1) {
        const peers = documentModel.scopes[edge.scopeId].cellIds.filter(id => layout.visibleIds.includes(id) && !documentModel.items[id].layer);
        const rail = Math.min(...peers.map(id => layout.cells[id].y)) - 24;
        style += 'exitX=.5;exitY=0;entryX=.5;entryY=0;';
        geometry.points = [new mxPoint(localA.x + localA.width / 2, rail), new mxPoint(localB.x + localB.width / 2, rail)];
        geometry.offset = null;
      }
      if (documentModel.scopes[edge.scopeId].flow && to.y > from.y + from.height + 32) {
        const parentBounds = layout.absolute[model.getParent(native)?.id] ?? { x: 0, y: 0 };
        const rail = (from.y + from.height + to.y) / 2 - parentBounds.y + (edge.laneOffset ?? 0);
        style += 'exitX=.5;exitY=1;entryX=.5;entryY=0;';
        geometry.points = [new mxPoint(from.x + from.width / 2 - parentBounds.x, rail), new mxPoint(to.x + to.width / 2 - parentBounds.x, rail)];
        geometry.offset = null;
      }
      if (edge.layer) {
        const systemOwner = item => {
          while (item && item.scopeId !== 'system') item = documentModel.items[documentModel.scopes[item.scopeId].ownerId];
          return item;
        };
        const ownerA = systemOwner(a), ownerB = systemOwner(b);
        if (ownerA && ownerB && Boolean(ownerA.layer) !== Boolean(ownerB.layer)) {
          const parentBounds = layout.absolute[model.getParent(native)?.id] ?? { x: 0, y: 0 };
          const reverse = Boolean(ownerA.layer);
          const mainId = reverse ? edge.to : edge.from, providerId = reverse ? edge.from : edge.to;
          const points = routeCanvasConnection(layout, documentModel, mainId, providerId);
          const mainAnchor = layout.anchors[mainId] / layout.absolute[mainId].height;
          style += reverse ? `exitX=.5;exitY=0;entryX=1;entryY=${mainAnchor};` : `exitX=1;exitY=${mainAnchor};entryX=.5;entryY=0;`;
          if (points.length) {
            geometry.points = (reverse ? points.toReversed() : points).map(([x, y]) => new mxPoint(x - parentBounds.x, y - parentBounds.y));
            style = style.replace('edgeStyle=orthogonalEdgeStyle;', 'edgeStyle=none;');
          }
          geometry.offset = null;
        }
      }
      if (documentModel.scopes[edge.scopeId].flow && edge.labelOffset) geometry.offset = new mxPoint(...edge.labelOffset);
      model.setGeometry(native, geometry);
      model.setStyle(native, style);
    }
  } finally { model.endUpdate(); }
}
async function transition(config, layout, camera, version) {
  const model = viewer.graph.getModel();
  const start = Object.fromEntries(Object.keys(documentModel.items).map(id => [id, { ...model.getCell(id).geometry }]));
  const previous = new Set(lastLayout?.visibleIds ?? []);
  const newcomers = layout.visibleIds.filter(id => !previous.has(id));
  const fromCamera = readCamera();
  const duration = !lastLayout || reducedMotion() ? 0 : 240;
  const started = performance.now();
  const token = ++animation;
  canvas.dataset.phase = duration ? 'animating' : 'loading';
  await new Promise(resolve => {
    function frame(now) {
      if (version !== revision || token !== animation) { resolve(); return; }
      const progress = duration ? Math.min(1, (now - started) / duration) : 1;
      const ease = 1 - Math.pow(1 - progress, 3);
      model.beginUpdate();
      try {
        for (const [id, target] of Object.entries(layout.cells)) {
          const native = model.getCell(id), geometry = native.geometry.clone(), old = start[id];
          for (const field of ['x', 'y', 'width', 'height']) geometry[field] = old[field] + (target[field] - old[field]) * ease;
          model.setGeometry(native, geometry);
        }
        for (const id of newcomers) {
          const native = model.getCell(id);
          const opacity = Math.round(Math.max(0, (progress - .45) / .55) * 100);
          model.setStyle(native, native.style.replace(/opacity=\d+;/g, '') + `opacity=${opacity};`);
        }
      } finally { model.endUpdate(); }
      if (camera) {
        const next = {};
        for (const key of ['scale', 'x', 'y', 'left', 'top']) next[key] = (fromCamera[key] ?? 0) + ((camera[key] ?? 0) - (fromCamera[key] ?? 0)) * ease;
        setCamera(next);
      }
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}
function renderOverview() {
  if (!lastLayout || !viewer) return;
  const rects = lastLayout.visibleIds.map(id => ({ id, ...lastLayout.absolute[id] }));
  const bounds = boundsOf(rects), pad = 24;
  const roots = documentModel.scopes[documentModel.rootScopeId].cellIds;
  const view = viewer.graph.view;
  const camera = { x: -view.translate.x + canvas.scrollLeft / view.scale, y: -view.translate.y + canvas.scrollTop / view.scale, width: canvas.clientWidth / view.scale, height: canvas.clientHeight / view.scale };
  overview.innerHTML = `<svg viewBox="${bounds.x - pad} ${bounds.y - pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}" aria-hidden="true">${rects.map(rect => `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="8" fill="${roots.includes(rect.id) ? '#405374' : 'none'}" stroke="#7997c8" stroke-width="${roots.includes(rect.id) ? 3 : 1.5}"/>`).join('')}<rect x="${camera.x}" y="${camera.y}" width="${camera.width}" height="${camera.height}" fill="#9bb8ff18" stroke="#9bb8ff" stroke-width="5"/></svg><span>Overview</span>`;
}
async function render(config, version) {
  if (viewer && current && requestedNavigationId === current.navigationId) cameras.set(current.navigationId, readCamera());
  const navChanged = !current || current.navigationId !== config.navigationId;
  const resized = requestedViewport !== undefined && requestedViewport !== config.viewport;
  const layout = layoutCanvas(documentModel, config.expanded, config.mode, config.layers);
  const targetCamera = resized ? cameraFor(focusBounds(layout, config)) : navChanged ? cameras.get(config.navigationId) ?? cameraFor(focusBounds(layout, config)) : null;
  if (targetCamera) cameras.set(config.navigationId, targetCamera);
  requestedNavigationId = config.navigationId;
  requestedViewport = config.viewport;
  applyState(config, layout);
  await transition(config, layout, targetCamera, version);
  if (version !== revision) return;
  const previousPath = current ? canvasScopePath(documentModel, current.focusScopeId) : [];
  const nextPath = canvasScopePath(documentModel, config.focusScopeId);
  current = config;
  lastLayout = layout;
  renderedKey = config.configKey;
  if (needsFit) { needsFit = false; setCamera(cameraFor(focusBounds(layout, config))); }
  canvas.dataset.phase = 'idle';
  describeCells();
  if (nextPath.length < previousPath.length && nextPath.every((id, index) => id === previousPath[index])) {
    const id = documentModel.scopes[previousPath[nextPath.length]].ownerId;
    viewer.graph.view.getState(viewer.graph.getModel().getCell(id))?.shape?.node?.focus({ preventScroll: true });
  }
  send({ type: 'rendered', configKey: config.configKey, modelLoads, visibleIds: layout.visibleIds });
}
window.addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.channel !== channel) return;
  const data = event.data;
  try {
    if (data.type === 'render') {
      if (data.configKey === pendingKey) {
        if (renderedKey === pendingKey) send({ type: 'rendered', configKey: renderedKey, modelLoads, visibleIds: lastLayout.visibleIds });
        return;
      }
      if (!/^\/diagrams\/[a-z0-9-]+\.drawio$/.test(data.asset) || !['implemented','proposed'].includes(data.mode) || !Array.isArray(data.expanded)) return;
      pendingKey = data.configKey;
      const version = ++revision;
      loading ??= fetch(data.asset).then(response => { if (!response.ok) throw new Error('Diagram unavailable'); return response.text(); });
      const source = await loading;
      if (version !== revision) return;
      if (!viewer) {
        const xml = new DOMParser().parseFromString(source, 'text/xml');
        const diagram = xml.querySelector('diagram');
        if (xml.querySelector('parsererror') || !diagram?.getAttribute('studioCanvas')) throw new Error('Invalid architecture canvas');
        documentModel = JSON.parse(diagram.getAttribute('studioCanvas'));
        viewer = new StudioViewer(canvas, xml.documentElement, { pageId: 'architecture', lightbox: false, nav: false, resize: false, border: 24, 'check-visible-state': false, 'auto-origin': false, 'auto-fit': false, 'dark-mode': 'light' });
        modelLoads++;
        const graph = viewer.graph;
        graph.foldingEnabled = false;
        graph.setPanning(true);
        graph.useScrollbarsForPanning = false;
        graph.panningHandler.useLeftButtonForPanning = true;
        graph.panningHandler.ignoreCell = true;
        graph.customLinkClicked = () => true;
        for (const native of Object.values(graph.getModel().cells)) baseStyles.set(native.id, native.style ?? '');
        graph.view.addListener(mxEvent.SCALE_AND_TRANSLATE, () => { if (current) describeCells(); });
        graph.view.addListener(mxEvent.SCALE, () => { if (current) describeCells(); });
        graph.view.addListener(mxEvent.TRANSLATE, () => { if (current) describeCells(); });
      }
      canvas.style.background = data.theme === 'dark' ? '#0b111b' : '#f8fafc';
      document.body.style.background = canvas.style.background;
      document.documentElement.dataset.theme = data.theme;
      await render(data, version);
    } else if (data.type === 'fit' && lastLayout && canvas.clientWidth && canvas.clientHeight) { setCamera(cameraFor(focusBounds(lastLayout, current, data.all), data.all)); describeCells(); }
    else if (data.type === 'zoom' && viewer) { viewer.graph.zoom(data.factor); describeCells(); }
  } catch (error) { console.error('Architecture canvas:', error); send({ type: 'error', message: 'The diagram could not be loaded.' }); }
});
canvas.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY }; }, true);
canvas.addEventListener('wheel', event => {
  if (!viewer || (!event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  viewer.graph.zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1);
  describeCells();
}, { passive: false });
canvas.addEventListener('scroll', () => { if (current) describeCells(); }, { passive: true });
overview.onclick = () => { if (lastLayout) { setCamera(cameraFor(focusBounds(lastLayout, current, true), true)); describeCells(); } };
document.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); send({ type: 'back' }); } });
let lastWidth = 0;
new ResizeObserver(() => {
  if (!viewer || !lastLayout || !canvas.clientWidth || !canvas.clientHeight) return;
  if (lastWidth && canvas.clientWidth !== lastWidth) {
    if (canvas.dataset.phase === 'idle') setCamera(cameraFor(focusBounds(lastLayout, current)));
    else needsFit = true;
  }
  lastWidth = canvas.clientWidth;
  describeCells();
}).observe(canvas);
if (typeof GraphViewer === 'function') send({ type: 'ready' });
else send({ type: 'error', message: 'The diagram viewer could not be loaded.' });
