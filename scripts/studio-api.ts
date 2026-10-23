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

export { startMissing, stopAll } from "./studio-services.ts";

const ROUTES = {
  "/api/studio/models": (request: IncomingMessage, response: ServerResponse) => handleModels(request, response),
  "/api/studio/settings": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "settings"),
  "/api/studio/settings/check": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "check"),
  "/api/studio/services": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "services"),
  "/api/studio/status": (request: IncomingMessage, response: ServerResponse) => handleStatus(request, response),
} as const;

// Serve committed recordings without requiring the corresponding live services.
// Read-only; same list shape and name rule as services/common/runs.py.
const RECORDINGS: Record<string, URL> = Object.fromEntries(
  ["banking", "fraud", "briefing", "wealth", "sar", "interbank"].map((id) => [id,
    new URL(`../services/${id}/${id === "interbank" ? "" : "data/"}recorded/`, import.meta.url)]),
);
// Only committed demo data is exposed. Never proxy arbitrary paths into the filesystem.
const EXAMPLES: Record<string, string> = {
  "/api/studio/examples/fraud/scenarios": "../services/fraud/data/scenarios.json",
  "/api/studio/examples/fraud/cases": "../services/fraud/data/cases.json",
  "/api/studio/examples/wealth/households": "../fixtures/studio/wealth-households.json",
  "/api/studio/examples/sar/scenarios": "../fixtures/studio/sar-scenarios.json",
};
async function handleExample(request: IncomingMessage, response: ServerResponse, path: string) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." });
  const value = JSON.parse(await readFile(new URL(EXAMPLES[path], import.meta.url), "utf8"));
  return send(response, 200, path.endsWith("/cases") ? { cases: value, synthetic: true } : value);
}
const RECORDING = /^[a-z0-9][a-z0-9-]{1,80}$/;
const RECORDINGS_PATH = /^\/api\/studio\/recordings\/([a-z]+)(?:\/([^/]+))?$/;

type Json = Record<string, unknown>;

async function readRecording(directory: URL, name: string): Promise<Json | null> {
  try {
    const value = JSON.parse(await readFile(fileURLToPath(new URL(`${name}.json`, directory)), "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
  } catch {
    return null;
  }
}

async function recordingMetas(directory: URL) {
  let names: string[] = [];
  try { names = (await readdir(fileURLToPath(directory))).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)).sort(); } catch { /* none yet */ }
  const items = [];
  for (const name of names.filter((item) => RECORDING.test(item))) {
    const doc = await readRecording(directory, name);
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
  const directory = RECORDINGS[service];
  if (!directory) return send(response, 404, { error: "No recordings for that service." });
  if (name === undefined) return send(response, 200, { recordings: await recordingMetas(directory) });
  const doc = RECORDING.test(name) ? await readRecording(directory, name) : null;
  return doc ? send(response, 200, reviewedRecording(service, name, doc)) : send(response, 404, { error: "Unknown recording." });
}

/** Handles the request when it targets the studio API; returns false otherwise. */
export function handleStudioApi(request: IncomingMessage, response: ServerResponse): boolean {
  const path = request.url?.split("?")[0] ?? "";
  if (process.env.STUDIO_PREVIEW === "1" && /^\/api\/(banking|fraud|briefing|wealth|sar|vulnerability|interbank)(?:\/|$)/.test(path)) {
    send(response, 503, { detail: "Recorded preview: live execution is disabled. Start npm run dev:studio for live services." });
    return true;
  }
  const recordings = RECORDINGS_PATH.exec(path);
  const route = EXAMPLES[path] ? (req: IncomingMessage, res: ServerResponse) => handleExample(req, res, path) : recordings
    ? (req: IncomingMessage, res: ServerResponse) => handleRecordings(req, res, recordings[1], recordings[2])
    : ROUTES[path as keyof typeof ROUTES];
  if (!route) return false;
  route(request, response).catch(() => {
    if (!response.headersSent) send(response, 500, { error: "The studio could not complete that request." });
  });
  return true;
}
