// Host-side /api/studio/* for both studio runtimes (Vite dev middleware and
// scripts/start-studio.mjs). The worker runtime has no real filesystem or
// process control, and the Python services read .env and .studio from disk.
import type { IncomingMessage, ServerResponse } from "node:http";
import { send } from "./studio-http.ts";
import { handleModels } from "./studio-models-api.ts";
import { handleSettings } from "./studio-settings-api.ts";
import { handleStatus } from "./studio-status-api.ts";

export { startMissing, stopAll } from "./studio-services.ts";

const ROUTES = {
  "/api/studio/models": (request: IncomingMessage, response: ServerResponse) => handleModels(request, response),
  "/api/studio/settings": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "settings"),
  "/api/studio/settings/check": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "check"),
  "/api/studio/services": (request: IncomingMessage, response: ServerResponse) => handleSettings(request, response, "services"),
  "/api/studio/status": (request: IncomingMessage, response: ServerResponse) => handleStatus(request, response),
} as const;

/** Handles the request when it targets the studio API; returns false otherwise. */
export function handleStudioApi(request: IncomingMessage, response: ServerResponse): boolean {
  const route = ROUTES[request.url?.split("?")[0] as keyof typeof ROUTES];
  if (!route) return false;
  route(request, response).catch(() => {
    if (!response.headersSent) send(response, 500, { error: "The studio could not complete that request." });
  });
  return true;
}
