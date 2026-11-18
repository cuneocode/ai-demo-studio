import { createElement } from "react";
import { Building2, CircleGauge, Factory, FileSearch, Fingerprint, HeartPulse, Landmark, LockKeyhole, Network, ReceiptText, ShieldCheck, ShoppingBag, WalletCards, Boxes, type LucideIcon } from "lucide-react";
import { appById, appForDemo } from "../../config/apps.ts";
import { demoDefinitions, demoById } from "../../config/demos.ts";
import type { DemoDefinition } from "../../config/demo-contract.ts";

const icons: Record<string, LucideIcon> = { Building2, CircleGauge, Factory, FileSearch, Fingerprint, HeartPulse, Landmark, LockKeyhole, Network, ReceiptText, ShieldCheck, ShoppingBag, WalletCards, Boxes };
export const iconFor = (key: string): LucideIcon => icons[key] ?? Boxes;
export type Category = string;
export type UseCase = DemoDefinition & { category: string; icon: LucideIcon; content?: import("../../config/content/contract.ts").ContentEntry };
const stageOrder = { Interactive: 0, "In development": 1, Planned: 2 };

export function catalogForApp(id: string | null): UseCase[] {
  const applications = id ? [appById(id)].filter(Boolean) : [];
  const definitions = id ? applications.flatMap(app => app!.catalog.map(entry => demoById(entry.demoId)!)) : demoDefinitions;
  return definitions.map(demo => {
    const app = appById(id) ?? appForDemo(demo.id);
    const entry = app?.catalog.find(item => item.demoId === demo.id);
    return { ...demo, icon: iconFor(demo.iconKey), category: app?.categories.find(category => category.id === entry?.categoryId)?.label ?? "General" };
  }).sort((a, b) => stageOrder[a.stage] - stageOrder[b.stage]);
}
export const allUseCases = catalogForApp(null);

export function CatalogIcon({ name, size = 18 }: { name: string; size?: number }) { return createElement(iconFor(name), { size }); }

/** Presentation overlays never alter executable definitions or backend scope. */
export function resolvedCatalogForApp(id: string | null, entries: import('../../config/content/contract.ts').ContentEntry[] = [], audience: 'customer' | 'specialist' = 'customer'): UseCase[] {
  const catalog = new Map(catalogForApp(id).map(demo => [demo.id, demo]));
  for (const entry of entries.filter(entry => !id || entry.appId === id)) {
    const native = entry.nativeDemoId ? catalog.get(entry.nativeDemoId) : undefined;
    if (entry.nativeDemoId && !native) continue;
    const definition: DemoDefinition = native ?? { id: entry.id, title: entry.title, description: entry.description, outcome: entry.objective, iconKey: 'Boxes', accent: 'blue', solutions: [], signal: entry.repo ?? 'Linked application', stage: 'Interactive', mode: 'illustrative', architectureId: '', assets: { ui: null, narrative: '', presenter: '' } };
    const view = entry[audience];
    catalog.set(entry.id, { ...definition, title: typeof view.title === "string" ? view.title : entry.title, description: typeof view.tagline === "string" ? view.tagline : entry.description, outcome: entry.objective, category: entry.category, icon: native?.icon ?? iconFor('Boxes'), content: entry });
  }
  return [...catalog.values()];
}
