// Host-side /api/studio/* for both studio runtimes (Vite dev middleware and
// scripts/start-studio.mjs). The worker runtime has no real filesystem or
// process control, and the Python services read .env and .studio from disk.
import { readdir, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { send } from "./studio-http.ts";
import { handleModels } from "./studio-models-api.ts";
import { handleSettings } from "./studio-settings-api.ts";
import { reviewedRecording } from "./recording-review.ts";
import { handleStatus } from "./studio-status-api.ts";
import { handleContent } from "./studio-content-api.ts";
import { handlePlanner } from "./studio-planner-api.ts";
import { runtimeById, runtimeForPath } from "../config/use-cases.ts";
import { requestScope, ScopeError } from "./studio-scope.ts";

export { startMissing, stopAll } from "./studio-services.ts";

const ROUTES = {
  "/api/studio/content/modules": handleContent,
  "/api/studio/content": handleContent,
  "/api/motion/content": handleContent,
  "/api/studio/catalog": async (request: IncomingMessage, response: ServerResponse) => { send(response, 200, requestScope(request)); },
  "/api/studio/models": (request: IncomingMessage, response: ServerResponse) => handleModels(request, response),
  "/api/studio/settings": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "settings"),
  "/api/studio/settings/check": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "check"),
  "/api/studio/services": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "services"),
  "/api/studio/status": (request: IncomingMessage, response: ServerResponse) => handleStatus(request, response),
  "/api/studio/planner": (request: IncomingMessage, response: ServerResponse) => handlePlanner(request, response),
} as const;

// Serve committed recordings without requiring the corresponding live services.
// Read-only; same list shape and name rule as services/common/runs.py.
const RECORDINGS: Record<string, URL[]> = Object.fromEntries([
  ...["banking", "fraud", "briefing", "sar", "interbank"].map(id => [
    id, [new URL(`../${runtimeById(id)!.source}/${id === "interbank" ? "" : "data/"}recorded/`, import.meta.url)],
  ]),
  ["wealth", ["client-advisory", "market-research"].map(id => new URL(`../demos/${id}/fixtures/recorded/`, import.meta.url))],
]);
// Only committed demo data is exposed. Never proxy arbitrary paths into the filesystem.
const EXAMPLES: Record<string, string> = {
  "/api/studio/examples/fraud/scenarios": "../demos/fraud-modeling/backend/data/scenarios.json",
  "/api/studio/examples/fraud/cases": "../demos/fraud-modeling/backend/data/cases.json",
  "/api/studio/examples/wealth/households": "../demos/client-advisory/fixtures/presentation-households.json",
  "/api/studio/examples/sar/scenarios": "../demos/sar-support/fixtures/presentation-scenarios.json",
};
async function handleExample(request: IncomingMessage, response: ServerResponse, path: string) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." });
  const owner = path.includes("/fraud/") ? "fraud" : path.includes("/sar/") ? "sar" : "research";
  const scope = requestScope(request);
  if (!scope.runtimeIds.includes(owner) && !(owner === "research" && scope.runtimeIds.includes("advisory"))) throw new ScopeError("These examples are outside this app's library.", 403);
  const value = JSON.parse(await readFile(new URL(EXAMPLES[path], import.meta.url), "utf8"));
  return send(response, 200, path.endsWith("/cases") ? { cases: value, synthetic: true } : value);
}
const RECORDING = /^[a-z0-9][a-z0-9-]{1,80}$/;
const RECORDINGS_PATH = /^\/api\/studio\/recordings\/([a-z]+)(?:\/([^/]+))?$/;

type Json = Record<string, unknown>;

async function readRecording(directories: URL[], name: string): Promise<Json | null> {
  for (const directory of directories) {
    try {
      const value = JSON.parse(await readFile(fileURLToPath(new URL(`${name}.json`, directory)), "utf8"));
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Json;
    } catch { /* Try the next source. */ }
  }
  return null;
}

async function recordingMetas(directories: URL[]) {
  const files = await Promise.all(directories.map(directory => readdir(fileURLToPath(directory)).catch(() => [])));
  const names = new Set(files.flat().filter(file => file.endsWith(".json")).map(file => file.slice(0, -5)));
  const items = [];
  for (const name of [...names].filter(item => RECORDING.test(item)).sort()) {
    const doc = await readRecording(directories, name);
    if (!doc) continue;
    const events = Array.isArray(doc.events) ? doc.events as Json[] : [];
    const stamps = events.map((event) => event?.ns).filter((ns): ns is number => typeof ns === "number");
    items.push({
      name, title: doc.title ?? name, scenario: doc.scenario ?? null, recorded_at: doc.recorded_at ?? null, served_by: doc.served_by ?? null,
      events: events.length, duration_ms: stamps.length ? Math.round(Math.max(...stamps) / 1_000_000) : null, synthetic: Boolean(doc.synthetic),
    });
  }
  return items;
}

async function handleRecordings(request: IncomingMessage, response: ServerResponse, service: string, name?: string) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." });
  const scope = requestScope(request);
  if (!scope.runtimeIds.includes(service) && !(service === "wealth" && scope.runtimeIds.some(id => ["research", "advisory"].includes(id)))) throw new ScopeError("These recordings are outside this app's library.", 403);
  const directories = RECORDINGS[service];
  if (!directories) return send(response, 404, { error: "No recordings for that service." });
  if (name === undefined) return send(response, 200, { recordings: await recordingMetas(directories) });
  const doc = RECORDING.test(name) ? await readRecording(directories, name) : null;
  return doc ? send(response, 200, reviewedRecording(service, name, doc)) : send(response, 404, { error: "Unknown recording." });
}

/** Handles the request when it targets the studio API; returns false otherwise. */
export function handleStudioApi(request: IncomingMessage, response: ServerResponse): boolean {
  let path = request.url?.split("?")[0] ?? "";
  if (/^\/api\/(?:studio\/content(?:\/modules)?|motion\/content)\/$/.test(path)) path = path.slice(0, -1);
  // Vite reserves the module query parameter. Canonical page URLs use content.
  const pageUrl = new URL(request.url || "/", "http://studio.local");
  const legacyModule = pageUrl.searchParams.get("module");
  if (legacyModule && /^[a-z0-9][a-z0-9-]{0,79}$/.test(legacyModule) && (path === "/" || /^\/(?:apps|studio|select)(?:\/|$)/.test(path))) {
    pageUrl.searchParams.set("content", pageUrl.searchParams.get("content") || legacyModule);
    pageUrl.searchParams.delete("module");
    response.writeHead(302, { location: pageUrl.pathname + pageUrl.search }); response.end(); return true;
  }
  const selected = /^\/select\/([a-z0-9][a-z0-9-]{0,79})\/?$/.exec(path);
  if (path === "/studio" || path === "/studio/" || selected) {
    response.writeHead(302, { location: selected ? `/?content=${selected[1]}` : "/" });
    response.end(); return true;
  }
  const runtime = runtimeForPath(path);
  if (runtime) {
    try {
      if (!requestScope(request).runtimeIds.includes(runtime.id)) {
        send(response, 403, { detail: "This runtime is outside the enabled app catalog." });
        return true;
      }
    } catch (error) {
      send(response, error instanceof ScopeError ? error.status : 422, { error: (error as Error).message });
      return true;
    }
  }
  if (process.env.STUDIO_PREVIEW === "1" && (runtimeForPath(path) || /^\/api\/wealth(?:\/|$)/.test(path))) {
    send(response, 503, { detail: "Recorded preview: live execution is disabled. Start npm run dev:studio for live services." });
    return true;
  }
  const recordings = RECORDINGS_PATH.exec(path);
  const route = EXAMPLES[path] ? (req: IncomingMessage, res: ServerResponse) => handleExample(req, res, path) : recordings
    ? (req: IncomingMessage, res: ServerResponse) => handleRecordings(req, res, recordings[1], recordings[2])
    : ROUTES[path as keyof typeof ROUTES];
  if (!route) return false;
  route(request, response).catch((error) => {
    if (!response.headersSent) send(response, error instanceof ScopeError ? error.status : 500, { error: error instanceof ScopeError ? error.message : "The studio could not complete that request." });
  });
  return true;
}
