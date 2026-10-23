import { diagramNode } from "./model.ts";
import { componentTypeFor } from "./component-types.ts";
import type { CaseScenes } from "../scene-model.ts";
import type { CanvasDocument, CanvasItem, CanvasScope, DiagramPage } from "./model.ts";

export const canvasId = (scopeId: string, cellId: string) => `${scopeId}::${cellId}`;

/** Compile authored scopes into one tree of persistent draw.io cells. */
export function composeCanvas(pages: DiagramPage[], catalog: CaseScenes): CanvasDocument {
  const rootScopeId = pages[0].id;
  const scopes: Record<string, CanvasScope> = {};
  const owners = new Map<string, { scopeId: string; cellId: string }>();
  for (const page of pages.slice(1)) {
    const candidates = pages.flatMap((parent) => parent.cells.filter((cell) => cell.targetPageId === page.id).map((cell) => ({ scopeId: parent.id, cellId: cell.id })));
    const owner = page.owner ?? candidates.find((item) => item.scopeId === page.parentId) ?? candidates[0];
    if (!owner) throw new Error(`Architecture scope has no owner: ${page.id}`);
    owners.set(page.id, owner);
  }
  for (const page of pages) {
    const owner = owners.get(page.id);
    scopes[page.id] = { id: page.id, title: page.title, level: page.level, purpose: page.purpose, note: page.note, ownerId: owner ? canvasId(owner.scopeId, owner.cellId) : undefined, parentScopeId: owner?.scopeId, cellIds: [] };
  }
  const aliases = new Map<string, string>();
  for (const page of pages) {
    for (const [id, target] of Object.entries(page.aliases ?? {})) aliases.set(canvasId(page.id, id), canvasId(target.scopeId, target.cellId));
    // Context occurrences in nested views resolve to the same ancestor cell.
    for (const cell of page.cells) {
      if (aliases.has(canvasId(page.id, cell.id))) continue;
      let parentId = scopes[page.id].parentScopeId;
      while (parentId) {
        const parent = pages.find((item) => item.id === parentId)!;
        const entityId = diagramNode(catalog, cell).entityId;
        const match = parent.cells.find((item) => item.instanceId === cell.instanceId && (item.sceneId === cell.sceneId || (entityId && diagramNode(catalog, item).entityId === entityId)) && canvasId(parent.id, item.id) !== scopes[page.id].ownerId);
        if (match) { aliases.set(canvasId(page.id, cell.id), canvasId(parent.id, match.id)); break; }
        parentId = scopes[parentId].parentScopeId;
      }
    }
  }
  function resolve(id: string): string {
    const seen = new Set<string>();
    while (aliases.has(id)) {
      if (seen.has(id)) throw new Error(`Cyclic architecture alias: ${id}`);
      seen.add(id);
      id = aliases.get(id)!;
    }
    return id;
  }
  const items: Record<string, CanvasItem> = {};
  for (const page of pages) for (const cell of page.cells) {
    const id = canvasId(page.id, cell.id);
    if (aliases.has(id)) continue;
    const childScopeId = Object.values(scopes).find((scope) => scope.ownerId === id)?.id;
    items[id] = { ...cell, componentType: componentTypeFor(catalog.id, page.id, cell, diagramNode(catalog, cell), Boolean(childScopeId)), id, localId: cell.id, scopeId: page.id, childScopeId };
    scopes[page.id].cellIds.push(id);
  }
  for (const page of pages) if (page.flow) scopes[page.id].flow = page.flow.map(row => row.map(id => items[canvasId(page.id, id)] ? canvasId(page.id, id) : ""));
  for (const page of pages) for (const cell of page.cells) {
    const id = canvasId(page.id, cell.id);
    if (aliases.has(id)) {
      const item = items[resolve(id)];
      if (!item) throw new Error(`Unresolved architecture alias: ${id}`);
      (item.aliases ??= []).push(cell);
    }
  }
  const edges = pages.flatMap((page) => page.edges.map((edge) => ({ ...edge, id: canvasId(page.id, edge.id), scopeId: page.id, from: resolve(canvasId(edge.fromScopeId ?? page.id, edge.from)), to: resolve(canvasId(edge.toScopeId ?? page.id, edge.to)) }))).filter((edge) => edge.from !== edge.to);
  const boundaries = pages.flatMap((page) => (page.boundaries ?? []).map((box) => ({
    id: canvasId(page.id, `boundary.${box.id}`), scopeId: page.id, label: box.label,
    members: page.cells.filter((cell) => cell.boundaryId ? cell.boundaryId === box.id : cell.x >= box.x && cell.y >= box.y && cell.x + cell.width <= box.x + box.width + 1 && cell.y + cell.height <= box.y + box.height + 1).map((cell) => canvasId(page.id, cell.id)).filter((id) => Boolean(items[id])),
  }))).filter((box) => box.members.length);
  return { rootScopeId, scopes, items, edges, boundaries };
}
