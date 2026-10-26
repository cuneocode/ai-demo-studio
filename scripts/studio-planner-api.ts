import type { IncomingMessage, ServerResponse } from "node:http";
import { validatePlannerConnection } from "../app/planner-integration.ts";
import { envValue } from "./studio-env.ts";
import { send } from "./studio-http.ts";

export async function handlePlanner(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." });
  const connection = validatePlannerConnection(envValue("STUDIO_PLANNER_BUNDLE_URL"), envValue("STUDIO_PLANNER_API_BASE_URL"));
  return send(response, 200, connection);
}
