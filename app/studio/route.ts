import { appById, appForDemo, demoIdsForApp } from "../../config/apps.ts";
import type { AppId } from "../../config/app-contract.ts";

export type StudioView = "apps" | "overview" | "library" | "stories" | "briefing" | "settings" | "controls" | "telemetry" | "unavailable";
export type StudioRoute = { appId: AppId | null; view: StudioView; demoId: string | null; tab: "demo" | "architecture" | "capacity"; valid: boolean };
const views = ["overview", "library", "stories", "briefing", "settings", "controls", "telemetry"];
export function parseStudioRoute(pathname: string, search = ""): StudioRoute {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const base: StudioRoute = { appId: null, view: "apps", demoId: null, tab: tab === "architecture" || tab === "capacity" ? tab : "demo", valid: true };
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length || (parts.length === 1 && parts[0] === "apps")) {
    if (params.has("guide")) return { ...base, appId: "fsi", view: "overview" };
    return base;
  }
  if (parts.length === 1 && ["settings", "controls", "telemetry"].includes(parts[0])) return { ...base, view: parts[0] as StudioView };
  if (parts[0] !== "apps" || !appById(parts[1])) return { ...base, view: "unavailable", valid: false };
  const app = appById(parts[1])!;
  const result = { ...base, appId: app.id, view: "overview" as StudioView };
  if (parts.length === 2) return result;
  if (parts.length === 4 && parts[2] === "demos" && demoIdsForApp(app.id).includes(parts[3])) return { ...result, demoId: parts[3] };
  if (parts.length === 3 && views.includes(parts[2]) && (parts[2] !== "briefing" || app.context === "company")) return { ...result, view: parts[2] as StudioView };
  return { ...result, view: "unavailable", valid: false };
}
export function studioPath(appId: string | null, view: StudioView = "overview", demoId?: string | null): string {
  if (demoId) {
    const owner = appById(appId) ?? appForDemo(demoId);
    if (!owner || !owner.catalog.some(entry => entry.demoId === demoId)) throw new Error("That demo is outside this app's library.");
    return `/apps/${owner.id}/demos/${encodeURIComponent(demoId)}`;
  }
  if (view === "apps") return "/";
  if (!appId) return view === "overview" ? "/" : `/${view}`;
  return `/apps/${appId}${view === "overview" ? "" : `/${view}`}`;
}
