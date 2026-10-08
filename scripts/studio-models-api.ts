// Host-side /api/studio/models for both studio runtimes (Vite dev middleware and
// scripts/start-studio.mjs). The worker runtime has no real filesystem, and the
// Python services read the saved file from disk.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { KEY_NAMES, MODEL_USE_CASES, baseUrlProblem, defaultRegistry, validateRegistry, type ModelProvider } from "../app/studio-models.ts";

export const STUDIO_MODELS_PATH = "/api/studio/models";
const root = fileURLToPath(new URL("../", import.meta.url));
const registryFile = () => process.env.STUDIO_MODELS_FILE ?? path.join(root, ".studio", "models.json");

/** A setting from the environment or the studio's .env. */
function envValue(name: string): string {
  if (process.env[name]) return process.env[name]!;
  try {
    for (const line of readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (match?.[1] === name) return match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch { /* no .env */ }
  return "";
}

/** Only allowlisted key variables are ever read, and keys never reach the browser. */
const keyValue = (name: string) => ((KEY_NAMES as readonly string[]).includes(name) ? envValue(name) : "");

function snapshot() {
  const file = registryFile();
  let saved = false;
  let problem: string | null = null;
  let registry = defaultRegistry(envValue("MODEL_NAME") || undefined, envValue("NIM_MODEL") || undefined);
  if (existsSync(file)) {
    let parsed: ReturnType<typeof validateRegistry>;
    try { parsed = validateRegistry(JSON.parse(readFileSync(file, "utf8"))); } catch { parsed = { error: "The saved file is not valid JSON." }; }
    if ("registry" in parsed) { registry = parsed.registry; saved = true; } else problem = parsed.error;
  }
  return {
    saved,
    problem,
    file: path.relative(root, file) || file,
    registry,
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

/** System roots too, so the check works behind a TLS-inspecting proxy. */
const trustedRoots = () => {
  const bundled = tls.getCACertificates?.("default") ?? [...tls.rootCertificates];
  try { return [...bundled, ...tls.getCACertificates("system")]; } catch { return bundled; }
};

function listModels(base: string, key: string): Promise<{ status: number; ids: string[] }> {
  const url = new URL(`${base}/models`);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(url, {
      headers: key ? { authorization: `Bearer ${key}`, accept: "application/json" } : { accept: "application/json" },
      timeout: 6000,
      ...(url.protocol === "https:" ? { ca: trustedRoots() } : {}),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2_000_000) request.destroy(new Error("too large"));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        let ids: string[] = [];
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { data?: { id?: unknown }[] };
          ids = (body.data ?? []).map((item) => item.id).filter((id): id is string => typeof id === "string");
        } catch { /* not a model list */ }
        resolve({ status: response.statusCode ?? 0, ids });
      });
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("timeout"), { code: "TIMEOUT" })));
    request.on("error", reject);
    request.end();
  });
}

/** Checks a provider before saving: lists its models with the named key. */
async function check(input: unknown) {
  const provider = (input as { provider?: Partial<ModelProvider> } | null)?.provider;
  const base = typeof provider?.baseUrl === "string" ? provider.baseUrl.trim().replace(/\/+$/, "") : "";
  const problem = base ? baseUrlProblem(base) : "Enter a base URL.";
  if (problem) return { status: 422, body: { ok: false, detail: problem } };
  const key = keyValue(provider?.apiKeyEnv ?? "");
  if (provider?.kind === "openai" && !key) return { status: 200, body: { ok: false, detail: `${provider.apiKeyEnv || "The key variable"} is not set in .env.` } };
  try {
    const { status, ids } = await listModels(base, key);
    if (status === 401 || status === 403) return { status: 200, body: { ok: false, status, detail: "The endpoint rejected the key." } };
    if (status < 200 || status >= 300) return { status: 200, body: { ok: false, status, detail: `The endpoint answered ${status}.` } };
    const model = typeof provider?.model === "string" ? provider.model.trim() : "";
    const listed = ids.includes(model);
    return { status: 200, body: { ok: true, status, count: ids.length, listed, sample: listed ? [] : ids.slice(0, 8) } };
  } catch (error) {
    const code = (error as { code?: string }).code;
    const detail = code === "TIMEOUT" ? "No answer within 6 seconds."
      : code === "ECONNREFUSED" ? "Nothing is listening at that address."
      : code === "ENOTFOUND" ? "That host name does not resolve."
      : "The endpoint is unreachable from this machine.";
    return { status: 200, body: { ok: false, detail } };
  }
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 64_000) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > 64_000) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { resolve(null); }
    });
    request.on("error", () => resolve(null));
  });
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

/** Writes come only from the studio page itself, as JSON. */
function writeRefusal(request: IncomingMessage): string | null {
  if (!String(request.headers["content-type"] ?? "").includes("application/json")) return "Send JSON.";
  const origin = request.headers.origin;
  if (!origin) return null;
  try { return new URL(origin).host === request.headers.host ? null : "Cross-origin writes are not allowed."; } catch { return "Cross-origin writes are not allowed."; }
}

/** Handles the request when it targets the registry; returns false otherwise. */
export function handleStudioModels(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.url?.split("?")[0] !== STUDIO_MODELS_PATH) return false;
  void (async () => {
    try {
      if (request.method === "GET") return send(response, 200, snapshot());
      if (request.method !== "PUT" && request.method !== "POST") return send(response, 405, { error: "Use GET, PUT, or POST." });
      const refusal = writeRefusal(request);
      if (refusal) return send(response, refusal === "Send JSON." ? 415 : 403, { error: refusal });
      const body = await readJson(request);
      const result = request.method === "PUT" ? save(body) : await check(body);
      send(response, result.status, result.body);
    } catch {
      if (!response.headersSent) send(response, 500, { error: "The model registry could not be updated." });
    }
  })();
  return true;
}
