import { readEnvFile } from "./studio-env.ts";
import type { IncomingMessage } from "node:http";
import { apps, appById } from "../config/apps.ts";
import { useCasePackages } from "../config/use-cases.ts";

export type StudioScope = { appId: string | null; appIds: string[]; useCaseIds: string[]; runtimeIds: string[]; key: string };
export class ScopeError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status = status; }
}

export function resolveScope(appId?: unknown): StudioScope {
  const configured = process.env.STUDIO_ENABLED_APPS ?? readEnvFile().get("STUDIO_ENABLED_APPS");
  const enabled = configured === undefined ? apps.map(app => app.id) : configured.split(",").map(id => id.trim()).filter(Boolean);
  if (enabled.some(id => !appById(id))) throw new ScopeError("STUDIO_ENABLED_APPS names an unknown industry app.", 503);
  if (appId !== undefined && appId !== null && (typeof appId !== "string" || !appById(appId))) throw new ScopeError("Choose a registered industry app.");
  if (typeof appId === "string" && !enabled.includes(appId)) throw new ScopeError("This industry app is disabled in this installation.", 403);
  const appIds = typeof appId === "string" ? [appId] : enabled;
  const useCaseIds = [...new Set(apps.filter(app => appIds.includes(app.id)).flatMap(app => app.catalog.map(entry => entry.demoId)))];
  const runtimeIds = useCasePackages.filter(item => useCaseIds.includes(item.id) && item.runtime).map(item => item.runtime!.id);
  return { appId: typeof appId === "string" ? appId : null, appIds, useCaseIds, runtimeIds: [...new Set(runtimeIds)], key: `${appIds.join(",")}:${useCaseIds.join(",")}` };
}

export function requestScope(request: Pick<IncomingMessage, "url">, body?: unknown): StudioScope {
  const values = new URL(request.url ?? "/", "http://studio.local").searchParams.getAll("app");
  if (values.length > 1) throw new ScopeError("Specify one industry app.");
  const explicit = body && typeof body === "object" && "appId" in body ? (body as { appId?: unknown }).appId : undefined;
  if (values.length && explicit !== undefined && explicit !== values[0]) throw new ScopeError("The request contains conflicting app scopes.");
  return resolveScope(values.length ? values[0] : explicit);
}

export function scopedRuntimeIds(input: unknown, scope: StudioScope): string[] {
  if (!Array.isArray(input) || !input.length || input.some(id => typeof id !== "string")) throw new ScopeError("Choose one or more runtime ids.");
  const ids = [...new Set(input as string[])];
  if (ids.some(id => !scope.runtimeIds.includes(id))) throw new ScopeError("A selected runtime is outside this app's library.", 403);
  return ids;
}

export function scopedUseCaseIds(ids: string[], scope: StudioScope) {
  if (ids.some(id => !scope.useCaseIds.includes(id))) throw new ScopeError("A selected use case is outside this app's library.", 403);
  return ids;
}

export function requireGlobalScope(scope: StudioScope) {
  if (scope.appId !== null) throw new ScopeError("Shared providers and credentials are managed in platform settings.", 403);
}
