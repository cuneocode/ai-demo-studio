// /api/studio/models: the model registry. Python services read the saved file (or the
// committed defaults) from disk, so this module applies the same rules as
// services/llm/studio_models.py: same defaults file, same .env overrides, same probe.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { KEY_NAMES, MODEL_USE_CASES, baseUrlProblem, chainFor, chainLabel, validateRegistry, type ModelProvider, type ModelRegistry } from "../app/studio-models.ts";
import type { ModelState } from "../app/studio-settings.ts";
import { ROOT, envValue } from "./studio-env.ts";
import { fetchText, networkProblem, readJson, send, writeRefusal } from "./studio-http.ts";
import { requestScope, requireGlobalScope, ScopeError, scopedUseCaseIds, type StudioScope } from "./studio-scope.ts";
import { syncContainerModels } from "./studio-container-config.ts";

export const STUDIO_MODELS_PATH = "/api/studio/models";
const registryFile = () => process.env.STUDIO_MODELS_FILE ?? path.join(ROOT, ".studio", "models.json");
const defaultsFile = () => process.env.STUDIO_MODELS_DEFAULT_FILE ?? path.join(ROOT, "config", "studio-models.default.json");

/** Only allowlisted key variables are ever read, and keys never reach the browser. */
const keyValue = (name: string) => ((KEY_NAMES as readonly string[]).includes(name) ? envValue(name) : "");

type EnvSpec = { baseUrl?: string[]; model?: string[]; requires?: "baseUrl" | "model" };
const firstEnv = (names?: string[]) => (names ?? []).map((name) => envValue(name).trim()).find(Boolean) ?? "";

/** The committed defaults with .env applied, and the providers .env does not configure. */
function defaults(): { registry: ModelRegistry; unconfigured: Record<string, string> } {
  const raw = JSON.parse(readFileSync(defaultsFile(), "utf8")) as Record<string, unknown> & { env?: Record<string, EnvSpec>; providers: Record<string, ModelProvider> };
  const providers = Object.fromEntries(Object.entries(raw.providers).map(([id, provider]) => [id, { ...provider }]));
  const unconfigured: Record<string, string> = {};
  for (const [id, spec] of Object.entries(raw.env ?? {})) {
    if (!providers[id]) continue;
    const baseUrl = firstEnv(spec.baseUrl);
    const model = firstEnv(spec.model);
    if (baseUrl) providers[id].baseUrl = baseUrl;
    if (model) providers[id].model = model;
    if (spec.requires && !firstEnv(spec[spec.requires])) unconfigured[id] = `not configured in .env (${spec[spec.requires]?.[0]})`;
  }
  const parsed = validateRegistry({ ...raw, providers });
  if ("error" in parsed) throw new Error(`config/studio-models.default.json: ${parsed.error}`);
  return { registry: parsed.registry, unconfigured };
}

export function loadRegistry(): { saved: boolean; problem: string | null; registry: ModelRegistry; unconfigured: Record<string, string> } {
  const file = registryFile();
  const fallback = defaults();
  if (!existsSync(file)) return { saved: false, problem: null, ...fallback };
  let parsed: ReturnType<typeof validateRegistry>;
  try { parsed = validateRegistry(JSON.parse(readFileSync(file, "utf8"))); } catch { parsed = { error: "The saved file is not valid JSON." }; }
  return "registry" in parsed ? { saved: true, problem: null, registry: parsed.registry, unconfigured: {} } : { saved: false, problem: parsed.error, ...fallback };
}

const configuredProblem = (provider: ModelProvider) =>
  provider.kind === "openai" && !keyValue(provider.apiKeyEnv) ? `${provider.apiKeyEnv || "A key"} is not set` : null;

/** Whether a use case's chain has at least one configured backend. */
export function modelState(useCase: string): ModelState {
  const { registry, unconfigured } = loadRegistry();
  const entries = chainFor(registry, useCase).providers.filter(({ id }) => !unconfigured[id]);
  const label = chainLabel(registry, useCase, unconfigured) || "No backend";
  if (entries.some(({ provider }) => provider && !configuredProblem(provider))) return { label, ok: true, detail: "" };
  const first = entries[0]?.provider;
  return { label, ok: false, detail: first ? `${first.apiKeyEnv || "A key"} for ${first.label}` : "A model provider" };
}

type Health = { up: boolean; detail: string };
let healthCache: { at: number; key: string; value: Promise<Record<string, Health>> } | null = null;

/** GET {baseUrl}/models for every provider, as the services probe them (cached 10 s). */
export function providerHealth(registry: ModelRegistry, unconfigured: Record<string, string>): Promise<Record<string, Health>> {
  const key = JSON.stringify([registry.providers, unconfigured]);
  if (healthCache && healthCache.key === key && Date.now() - healthCache.at < 10_000) return healthCache.value;
  const value = Promise.all(Object.entries(registry.providers).map(async ([id, provider]): Promise<[string, Health]> => {
    if (unconfigured[id]) return [id, { up: false, detail: unconfigured[id] }];
    const missing = configuredProblem(provider);
    if (missing) return [id, { up: false, detail: missing }];
    const secret = keyValue(provider.apiKeyEnv);
    try {
      const { status } = await fetchText(`${provider.baseUrl}/models`, { timeout: 2000, headers: secret ? { authorization: `Bearer ${secret}` } : {} });
      if (status === 401 || status === 403) return [id, { up: false, detail: "rejected the key" }];
      return [id, status >= 200 && status < 300 ? { up: true, detail: "answering" } : { up: false, detail: `answered ${status}` }];
    } catch (error) {
      return [id, { up: false, detail: networkProblem(error) }];
    }
  })).then(Object.fromEntries);
  healthCache = { at: Date.now(), key, value };
  return value;
}

/** Per use case: the chain .env leaves configured, and the provider that would answer right now. */
function routes(registry: ModelRegistry, unconfigured: Record<string, string>, health: Record<string, Health>) {
  return Object.fromEntries(MODEL_USE_CASES.map((useCase) => {
    const ids = chainFor(registry, useCase.id).ids.filter((id) => !unconfigured[id]);
    const active = ids.find((id) => health[id]?.up) ?? null;
    return [useCase.id, { chain: ids, active, fallback: Boolean(active && ids.indexOf(active) > 0) }];
  }));
}

export const registryRevision = (registry: ModelRegistry) => createHash("sha256").update(JSON.stringify(registry)).digest("hex");

async function snapshot(scope: StudioScope) {
  const loaded = loadRegistry();
  const health = await providerHealth(loaded.registry, loaded.unconfigured);
  return {
    ...loaded,
    scope, revision: registryRevision(loaded.registry),
    file: path.relative(ROOT, registryFile()) || registryFile(),
    defaultsFile: path.relative(ROOT, defaultsFile()),
    keys: Object.fromEntries(KEY_NAMES.map((name) => [name, Boolean(keyValue(name))])),
    useCases: MODEL_USE_CASES.filter(item => scope.useCaseIds.includes(item.id)),
    health,
    routes: Object.fromEntries(Object.entries(routes(loaded.registry, loaded.unconfigured, health)).filter(([id]) => scope.useCaseIds.includes(id))),
  };
}

export function mergeModelUpdate(input: unknown, current: ModelRegistry, scope: StudioScope, method: "PUT" | "PATCH") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ScopeError("Expected a model update.");
  const body = input as { revision?: string; registry?: unknown; routes?: Record<string, unknown> };
  if (!body.revision) throw new ScopeError("Reload models before saving. A registry revision is required.", 428);
  if (body.revision !== registryRevision(current)) throw new ScopeError("Models changed in another window. Reload models and reapply your changes.", 409);
  if (method === "PUT") { requireGlobalScope(scope); return body.registry; }
  if (Object.keys(body).some(key => !["revision", "routes", "appId"].includes(key))) throw new ScopeError("App updates can change model routes only.");
  if (!body.routes || typeof body.routes !== "object" || Array.isArray(body.routes)) throw new ScopeError("Provide the changed use-case routes.");
  scopedUseCaseIds(Object.keys(body.routes), scope);
  const useCases = { ...current.useCases };
  for (const [id, route] of Object.entries(body.routes)) {
    if (route === null) delete useCases[id];
    else useCases[id] = route as ModelRegistry["useCases"][string];
  }
  return { ...current, useCases };
}

async function save(input: unknown, scope: StudioScope, method: "PUT" | "PATCH") {
  const result = validateRegistry(mergeModelUpdate(input, loadRegistry().registry, scope, method));
  if ("error" in result) return { status: 422, body: { error: result.error } };
  const file = registryFile();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(result.registry, null, 2)}\n`, { mode: 0o644 });
  renameSync(temporary, file);
  syncContainerModels();
  healthCache = null;
  return { status: 200, body: await snapshot(scope) };
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
  if (request.method === "GET") return send(response, 200, await snapshot(requestScope(request)));
  if (request.method !== "PUT" && request.method !== "POST" && request.method !== "PATCH") return send(response, 405, { error: "Use GET, PUT, PATCH, or POST." });
  const refusal = writeRefusal(request);
  if (refusal) return send(response, refusal.status, { error: refusal.error });
  const body = await readJson(request);
  const scope = requestScope(request, body);
  if (request.method === "POST") requireGlobalScope(scope);
  const result = request.method === "PUT" || request.method === "PATCH" ? await save(body, scope, request.method) : await check(body);
  send(response, result.status, result.body);
}
