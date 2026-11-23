import { catalogs, type Catalog } from "../catalog.ts";
import { braheDiagramPages } from "../../../demos/brahe-bank/architecture/pages.ts";
import { genericDiagram } from "./generic-pages.ts";
import { interbankDiagram } from "../../../demos/interbank-a2a/architecture/pages.ts";
import type { DiagramPage } from "./model.ts";
import { withPlatformViews } from "./platform-views.ts";
import { connectImplementationViews } from "./implementation-views.ts";
import { connectPlatformComponents } from "./platform-connections.ts";

export type ArchitectureDiagram = { catalog: Catalog; pages: DiagramPage[]; asset: string; sourceAsset: string };

/** Every architecture uses the same local draw.io viewer and evidence contract. */
export const architectureDiagrams: Record<string, ArchitectureDiagram> = Object.fromEntries(
  Object.entries(catalogs).map(([id, catalog]) => {
    const diagram = id === "brahe-bank" ? { catalog, pages: braheDiagramPages }
      : id === "interbank-a2a" ? interbankDiagram(catalog) : genericDiagram(catalog);
    const file = `${id === "brahe-bank" ? "brahe" : id}.drawio`;
    return [id, {
      ...connectPlatformComponents(connectImplementationViews(withPlatformViews(diagram))),
      asset: `/diagrams/${file}`,
      sourceAsset: `demos/${id}/architecture/${file}`,
    }];
  }),
);
