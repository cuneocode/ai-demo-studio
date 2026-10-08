// /api/studio/models: the model registry. Python services read the saved file from disk.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { KEY_NAMES, MODEL_USE_CASES, baseUrlProblem, defaultRegistry, providerFor, validateRegistry, type ModelProvider, type ModelRegistry } from "../app/studio-models.ts";
import type { ModelState } from "../app/studio-settings.ts";
import { ROOT, envValue } from "./studio-env.ts";
import { fetchText, networkProblem, readJson, send, writeRefusal } from "./studio-http.ts";

export const STUDIO_MODELS_PATH = "/api/studio/models";
const registryFile = () => process.env.STUDIO_MODELS_FILE ?? path.join(ROOT, ".studio", "models.json");

/** Only allowlisted key variables are ever read, and keys never reach the browser. */
const keyValue = (name: string) => ((KEY_NAMES as readonly string[]).includes(name) ? envValue(name) : "");

export function loadRegistry(): { saved: boolean; problem: string | null; registry: ModelRegistry } {
  const file = registryFile();
  const fallback = defaultRegistry(envValue("MODEL_NAME") || undefined, envValue("NIM_MODEL") || undefined);
  if (!existsSync(file)) return { saved: false, problem: null, registry: fallback };
  let parsed: ReturnType<typeof validateRegistry>;
  try { parsed = validateRegistry(JSON.parse(readFileSync(file, "utf8"))); } catch { parsed = { error: "The saved file is not valid JSON." }; }
  return "registry" in parsed ? { saved: true, problem: null, registry: parsed.registry } : { saved: false, problem: parsed.error, registry: fallback };
}

/** Whether a use case's model has what it needs, from the registry or each service's .env fallback. */
export function modelState(useCase: string): ModelState {
  const { saved, registry } = loadRegistry();
  if (!saved) {
    if (useCase === "market-research" || useCase === "client-advisory") return { label: "Local vLLM (.env)", ok: true, detail: "" };
    if (useCase === "fraud-modeling") return { label: ".env settings", ok: true, detail: "" };
    return envValue("OPENAI_API_KEY")
      ? { label: ".env settings", ok: true, detail: "" }
      : { label: ".env settings", ok: false, detail: "OPENAI_API_KEY" };
  }
  const { provider } = providerFor(registry, useCase);
  if (!provider) return { label: "Unknown", ok: false, detail: "A model provider" };
  if (provider.kind === "openai" && !keyValue(provider.apiKeyEnv)) return { label: provider.label, ok: false, detail: `${provider.apiKeyEnv || "A key"} for ${provider.label}` };
  return { label: provider.label, ok: true, detail: "" };
}

function snapshot() {
  return {
    ...loadRegistry(),
    file: path.relative(ROOT, registryFile()) || registryFile(),
    keys: Object.fromEntries(KEY_NAMES.map((name) => [name, Boolean(keyValue(name))])),
    useCases: MODEL_USE_CASES,
  };
}

function save(input: unknown) {
  const result = validateRegistry(input);
  if ("error" in result) return { status: 422, body: { error: result.error } };
  const file = registryFile();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(result.registry, null, 2)}\n`, { mode: 0o644 });
  renameSync(temporary, file);
  return { status: 200, body: snapshot() };
}

/** Checks a provider before saving: lists its models with the named key. */
async function check(input: unknown) {
  const provider = (input as { provider?: Partial<ModelProvider> } | null)?.provider;
  const base = typeof provider?.baseUrl === "string" ? provider.baseUrl.trim().replace(/\/+$/, "") : "";
  const problem = base ? baseUrlProblem(base) : "Enter a base URL.";
  if (problem) return { status: 422, body: { ok: false, detail: problem } };
  const key = keyValue(provider?.apiKeyEnv ?? "");
  if (provider?.kind === "openai" && !key) return { status: 200, body: { ok: false, detail: `${provider.apiKeyEnv || "The key variable"} is not set.` } };
  try {
    const { status, text } = await fetchText(`${base}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
    if (status === 401 || status === 403) return { status: 200, body: { ok: false, status, detail: "The endpoint rejected the key." } };
    if (status < 200 || status >= 300) return { status: 200, body: { ok: false, status, detail: `The endpoint answered ${status}.` } };
    let ids: string[] = [];
    try {
      const body = JSON.parse(text) as { data?: { id?: unknown }[] };
      ids = (body.data ?? []).map((item) => item.id).filter((id): id is string => typeof id === "string");
    } catch { /* not a model list */ }
    const model = typeof provider?.model === "string" ? provider.model.trim() : "";
    const listed = ids.includes(model);
    return { status: 200, body: { ok: true, status, count: ids.length, listed, sample: listed ? [] : ids.slice(0, 8) } };
  } catch (error) {
    return { status: 200, body: { ok: false, detail: networkProblem(error) } };
  }
}

export async function handleModels(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "GET") return send(response, 200, snapshot());
  if (request.method !== "PUT" && request.method !== "POST") return send(response, 405, { error: "Use GET, PUT, or POST." });
  const refusal = writeRefusal(request);
  if (refusal) return send(response, refusal.status, { error: refusal.error });
  const body = await readJson(request);
  const result = request.method === "PUT" ? save(body) : await check(body);
  send(response, result.status, result.body);
}
