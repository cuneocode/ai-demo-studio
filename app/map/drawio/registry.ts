import { catalogs, type Catalog } from "../catalog.ts";
import { braheDiagramPages } from "./brahe-pages.ts";
import { genericDiagram } from "./generic-pages.ts";
import { interbankDiagram } from "./interbank-pages.ts";
import type { DiagramPage } from "./model.ts";
import { withPlatformViews } from "./platform-views.ts";
import { connectImplementationViews } from "./implementation-views.ts";

export type ArchitectureDiagram = { catalog: Catalog; pages: DiagramPage[]; asset: string };

/** Every architecture uses the same local draw.io viewer and evidence contract. */
export const architectureDiagrams: Record<string, ArchitectureDiagram> = Object.fromEntries(
  Object.entries(catalogs).map(([id, catalog]) => {
    const diagram = id === "brahe-bank" ? { catalog, pages: braheDiagramPages }
      : id === "interbank-a2a" ? interbankDiagram(catalog) : genericDiagram(catalog);
    return [id, { ...connectImplementationViews(withPlatformViews(diagram)), asset: `/diagrams/${id === "brahe-bank" ? "brahe" : id}.drawio` }];
  }),
);
