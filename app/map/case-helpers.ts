import type { CaseMap, Entity, Mode, Role, Scope } from "./types.ts";

export function row(ids: string[], y = 80, gap = 320): Scope["nodes"] {
  return ids.map((id, index) => ({ id, entityId: id, x: index * gap, y }));
}

export function chain(ids: string[], kind: Scope["edges"][number]["kind"] = "sequence"): Scope["edges"] {
  return ids.slice(1).map((id, index) => ({
    id: `${ids[index]}-${id}`,
    from: ids[index],
    to: id,
    label: "next",
    kind,
  }));
}

export function entity(id: string, title: string, subtitle: string, detail: string, role: Role, status: Entity["status"] = "implemented", extra: Partial<Entity> = {}): Entity {
  return { id, title, subtitle, detail, role, status, ...extra };
}

export function process(id: string, title: string, blurb: string, modes: Mode[], entities: Entity[], edgeKind: Scope["edges"][number]["kind"] = "sequence"): CaseMap {
  const scope: Scope = {
    id: `${id}.process`,
    title,
    level: 0,
    blurb,
    modes,
    nodes: row(entities.map((item) => item.id)),
    edges: chain(entities.map((item) => item.id), edgeKind),
  };
  return {
    id,
    root: scope.id,
    entities: Object.fromEntries(entities.map((item) => [item.id, item])),
    scopes: { [scope.id]: scope },
  };
}

export const proposed = (id: string, title: string, blurb: string, steps: [string, string, string, Role][]) => process(
  id,
  "Proposed process",
  blurb,
  ["proposed"],
  steps.map(([stepId, label, line, role]) => entity(
    stepId,
    label,
    line,
    `${label}. This use case is a proposed design in the studio, not a running integration.`,
    role,
    "proposed",
  )),
);
