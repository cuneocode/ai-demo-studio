// /api/studio/settings and /api/studio/services. Secrets are write-only.
import type { IncomingMessage, ServerResponse } from "node:http";
import { SETTING_FIELDS, readiness, settingProblem, type SettingState } from "../app/studio-settings.ts";
import { modelState } from "./studio-models-api.ts";
import { envValue, updateEnvFile } from "./studio-env.ts";
import { fetchText, networkProblem, readJson, send, writeRefusal } from "./studio-http.ts";
import { apply, queueOperation, runtimeLogs, serviceStatus, type Operation } from "./studio-services.ts";

function settingStates(): Record<string, SettingState> {
  return Object.fromEntries(Object.values(SETTING_FIELDS).map((field) => {
    const value = envValue(field.name);
    return [field.name, field.secret ? { set: Boolean(value) } : { set: Boolean(value), value }];
  }));
}

export function settingsSnapshot() {
  const settings = settingStates();
  return { file: ".env", settings, readiness: readiness(settings, modelState) };
}

function save(input: unknown) {
  const body = input as { set?: Record<string, unknown>; clear?: unknown[] } | null;
  const set: Record<string, string> = {};
  for (const [name, raw] of Object.entries(body?.set ?? {})) {
    if (typeof raw !== "string") return { status: 422, body: { error: `${name} must be text.` } };
    const value = raw.trim();
    const problem = settingProblem(name, value);
    if (problem) return { status: 422, body: { error: problem } };
    if (value) set[name] = value;
  }
  const clear = (body?.clear ?? []).filter((name): name is string => typeof name === "string");
  const unknown = clear.find((name) => !SETTING_FIELDS[name]);
  if (unknown) return { status: 422, body: { error: `${unknown} is not a studio setting.` } };
  const emptied = Object.entries(body?.set ?? {}).filter(([, raw]) => typeof raw === "string" && !raw.trim()).map(([name]) => name);
  updateEnvFile(set, [...clear, ...emptied]);
  return { status: 200, body: settingsSnapshot() };
}

/** A value typed but not yet saved, else the saved one. */
const pick = (overrides: Record<string, unknown>, name: string) =>
  typeof overrides[name] === "string" && (overrides[name] as string).trim() ? (overrides[name] as string).trim() : envValue(name);

const AI_DEFENSE_HOSTS: Record<string, string> = { "us-west-2": "us", "eu-central-1": "eu", "ap-northeast-1": "ap" };

async function check(input: unknown) {
  const body = input as { target?: string; values?: Record<string, unknown> } | null;
  const values = body?.values ?? {};
  for (const [name, raw] of Object.entries(values)) {
    const problem = typeof raw === "string" ? settingProblem(name, raw.trim()) : `${name} must be text.`;
    if (problem) return { ok: false, detail: problem };
  }
  const get = (name: string) => pick(values, name);
  try {
    if (body?.target === "splunk-ao") {
      const key = get("GALILEO_API_KEY");
      const consoleUrl = get("GALILEO_CONSOLE_URL") || "https://console.multitenant.galileocloud.io";
      if (!key) return { ok: false, detail: "Set the API key first." };
      const api = consoleUrl.replace(/\/+$/, "").replace("://console.", "://api.");
      const { status } = await fetchText(`${api}/current_user`, { headers: { "Galileo-API-Key": key } });
      return status === 200 ? { ok: true, detail: `Key accepted by ${new URL(api).host}.` }
        : { ok: false, detail: status === 401 || status === 403 ? "The key was rejected." : `The API answered ${status}.` };
    }
    if (body?.target === "ai-defense") {
      const key = get("AIDEFENSE_API_KEY");
      const host = AI_DEFENSE_HOSTS[get("AIDEFENSE_REGION") || "us-west-2"];
      if (!key) return { ok: false, detail: "Set the API key first." };
      const { status, text } = await fetchText(`https://${host}.api.inspect.aidefense.security.cisco.com/api/v1/inspect/chat`, {
        method: "POST",
        headers: { "X-Cisco-AI-Defense-API-Key": key, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "What is a savings account?" }], metadata: { src_app: "fsi-ai-studio-settings-check" } }),
      });
      if (status !== 200) return { ok: false, detail: status === 401 || status === 403 ? "The key was rejected." : `Inspection answered ${status}.` };
      const verdict = JSON.parse(text) as { is_safe?: unknown };
      return typeof verdict.is_safe === "boolean" ? { ok: true, detail: `Inspection works in ${get("AIDEFENSE_REGION") || "us-west-2"}.` } : { ok: false, detail: "Inspection returned no verdict." };
    }
    if (body?.target === "splunk-otel") {
      const realm = get("SPLUNK_REALM");
      const token = get("SPLUNK_ACCESS_TOKEN");
      if (!realm || !token) return { ok: false, detail: "Set the realm and token first." };
      // An empty OTLP export: accepted with a valid ingest token, nothing is stored.
      const { status } = await fetchText(`https://ingest.${realm}.observability.splunkcloud.com/v2/trace/otlp`, {
        method: "POST", headers: { "X-SF-Token": token, "content-type": "application/x-protobuf" }, body: Buffer.alloc(0),
      });
      return status >= 200 && status < 300 ? { ok: true, detail: `Token accepted by ${realm} ingest.` }
        : { ok: false, detail: status === 401 || status === 403 ? "The token was rejected." : `Ingest answered ${status}.` };
    }
    return { ok: false, detail: "Unknown check." };
  } catch (error) {
    return { ok: false, detail: networkProblem(error) };
  }
}

async function services(input: unknown) {
  const body = input as { action?: string; ids?: unknown[]; component?: string } | null;
  if (process.env.STUDIO_PREVIEW === "1") return { status: 409, body: { error: "Container controls are disabled in recorded preview." } };
  if (body?.ids && (!Array.isArray(body.ids) || body.ids.some(id => typeof id !== "string"))) return { status: 422, body: { error: "Choose registered runtime ids." } };
  const ids = body?.ids as string[] | undefined;
  try {
    if (body?.action === "apply") return { status: 202, body: { ...(await apply(ids)), ...(await serviceStatus()) } };
    if (body?.action === "logs" && ids?.length === 1) return { status: 200, body: { log: await runtimeLogs(ids[0]) } };
    if (["start", "stop", "restart", "build", "controls", "start-component", "stop-component"].includes(body?.action ?? "") && ids?.length) {
      queueOperation(ids, body!.action as Operation, body?.component);
      return { status: 202, body: await serviceStatus() };
    }
    return { status: 422, body: { error: "Choose a stack and Start, Stop, Restart, Build, or Logs." } };
  } catch (error) { return { status: 409, body: { error: (error as Error).message } }; }
}

export async function handleSettings(request: IncomingMessage, response: ServerResponse, route: "settings" | "check" | "services") {
  if (request.method === "GET" && route === "settings") return send(response, 200, settingsSnapshot());
  if (request.method === "GET" && route === "services") return send(response, 200, await serviceStatus());
  if (request.method !== (route === "settings" ? "PUT" : "POST")) return send(response, 405, { error: "Method not allowed." });
  const refusal = writeRefusal(request);
  if (refusal) return send(response, refusal.status, { error: refusal.error });
  const body = await readJson(request);
  if (route === "check") return send(response, 200, await check(body));
  const result = route === "settings" ? save(body) : await services(body);
  send(response, result.status, result.body);
}
