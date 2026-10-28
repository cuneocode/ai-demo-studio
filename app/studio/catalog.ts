import { createElement } from "react";
import { Building2, CircleGauge, Factory, FileSearch, Fingerprint, HeartPulse, Landmark, LockKeyhole, Network, ReceiptText, ShieldCheck, ShoppingBag, WalletCards, Boxes, type LucideIcon } from "lucide-react";
import { appById, appForDemo } from "../../config/apps.ts";
import { demoDefinitions, demoById } from "../../config/demos.ts";
import type { DemoDefinition } from "../../config/demo-contract.ts";

const icons: Record<string, LucideIcon> = { Building2, CircleGauge, Factory, FileSearch, Fingerprint, HeartPulse, Landmark, LockKeyhole, Network, ReceiptText, ShieldCheck, ShoppingBag, WalletCards, Boxes };
export const iconFor = (key: string): LucideIcon => icons[key] ?? Boxes;
export type Category = string;
export type UseCase = DemoDefinition & { category: string; icon: LucideIcon };
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
