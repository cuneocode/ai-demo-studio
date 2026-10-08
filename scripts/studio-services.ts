// The Python services and the interbank lab, as the studio sees them: health,
// start and restart for services the studio launched, and the lab rebuild job.
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { SETTING_FIELDS } from "../app/studio-settings.ts";
import { ROOT, envValue, readEnvFile, shellEnv } from "./studio-env.ts";
import { fetchText } from "./studio-http.ts";

export type ServiceSpec = { id: string; label: string; port: number; health: string; directory?: string; reads: string[] };

const MODEL_KEYS = ["OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY"];
const AIDEFENSE = ["AIDEFENSE_API_KEY", "AIDEFENSE_REGION"];
const OTEL = ["SPLUNK_REALM", "SPLUNK_ACCESS_TOKEN"];
const GALILEO = ["GALILEO_API_KEY", "GALILEO_CONSOLE_URL", "GALILEO_PROJECT", "GALILEO_LOG_STREAM"];

export const SERVICES: ServiceSpec[] = [
  { id: "banking", label: "Brahe Bank", port: 8011, health: "/api/banking/health", directory: "banking", reads: [...GALILEO, "AGENT_CONTROL_URL", ...AIDEFENSE, "AIDEFENSE_MODE", ...OTEL, ...MODEL_KEYS, "PINECONE_API_KEY"] },
  { id: "fraud", label: "Fraud scoring", port: 8012, health: "/api/fraud/health", directory: "fraud", reads: [...AIDEFENSE, "AIDEFENSE_MODE", ...OTEL, ...MODEL_KEYS] },
  { id: "briefing", label: "Company briefing", port: 8013, health: "/api/briefing/health", directory: "briefing", reads: [...AIDEFENSE, "BRIEFING_AIDEFENSE_MODE", ...OTEL, ...MODEL_KEYS, "SEC_USER_AGENT"] },
  { id: "wealth", label: "Wealth research and advisory", port: 8014, health: "/api/wealth/health", directory: "wealth", reads: [...GALILEO, ...AIDEFENSE, "WEALTH_AIDEFENSE_MODE", ...OTEL, ...MODEL_KEYS, "FRED_API_KEY"] },
];
export const INTERBANK: ServiceSpec = {
  id: "interbank", label: "Interbank lab (Docker)", port: 8088, health: "/api/health",
  reads: ["GALILEO_API_KEY", "GALILEO_CONSOLE_URL", "AGENT_CONTROL_URL", ...AIDEFENSE, ...MODEL_KEYS],
};
const SPECS = new Map([...SERVICES, INTERBANK].map((spec) => [spec.id, spec]));

type Job = { state: "idle" | "running" | "succeeded" | "failed"; log: string[]; startedAt?: string; finishedAt?: string };

type State = {
  children: Map<string, ChildProcess>;
  applied: Map<string, Record<string, string>>;
  interbank: Job;
  exitHook?: boolean;
};

// Survives Vite config reloads within one process.
const globalState = globalThis as typeof globalThis & { __studioServices?: State };
const state: State = globalState.__studioServices ??= { children: new Map(), applied: new Map(), interbank: { state: "idle", log: [] } };
if (!state.exitHook) {
  state.exitHook = true;
  process.on("exit", () => state.children.forEach((child) => child.kill("SIGTERM")));
}

/** Hashes of the settings a process started with, never the values. */
function settingHashes(): Record<string, string> {
  return Object.fromEntries(Object.keys(SETTING_FIELDS).map((name) => [name, createHash("sha256").update(envValue(name)).digest("hex")]));
}

/** Settings changed since the process last started from the studio, or null if unknown. */
function pendingFor(id: string): string[] | null {
  const applied = state.applied.get(id);
  if (!applied) return null;
  const now = settingHashes();
  return (SPECS.get(id)?.reads ?? Object.keys(now)).filter((name) => now[name] !== applied[name]);
}

const python = (spec: ServiceSpec) => `${ROOT}services/${spec.directory}/.venv/bin/python`;

async function healthy(spec: ServiceSpec): Promise<{ up: boolean; detail: string }> {
  try {
    const { status } = await fetchText(`http://127.0.0.1:${spec.port}${spec.health}`, { timeout: 1500 });
    return { up: status >= 200 && status < 500, detail: status < 500 ? "" : `Health answered ${status}` };
  } catch {
    return { up: false, detail: "" };
  }
}

function launch(spec: ServiceSpec) {
  // Services load .env themselves, so they get the shell environment without its keys.
  const env: NodeJS.ProcessEnv = { ...shellEnv(), PYTHONUNBUFFERED: "1" };
  for (const name of readEnvFile().keys()) delete env[name];
  const child = spawn(python(spec), ["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", String(spec.port)], {
    cwd: `${ROOT}services/${spec.directory}`, stdio: "inherit", env,
  });
  state.children.set(spec.id, child);
  state.applied.set(spec.id, settingHashes());
  child.on("exit", () => { if (state.children.get(spec.id) === child) state.children.delete(spec.id); });
}

function stop(id: string): Promise<void> {
  const child = state.children.get(id);
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

export async function stopAll() {
  await Promise.all([...state.children.keys()].map(stop));
}

/** Starts every installed service that is not already answering. */
export async function startMissing(ids = SERVICES.map((spec) => spec.id)) {
  const started: string[] = [];
  for (const spec of SERVICES.filter((item) => ids.includes(item.id))) {
    if (state.children.has(spec.id) || !existsSync(python(spec)) || (await healthy(spec)).up) continue;
    launch(spec);
    started.push(spec.id);
  }
  return started;
}

/** Restarts the services this studio launched and starts the rest; others are left alone. */
export async function apply(ids = SERVICES.map((spec) => spec.id)) {
  const restarted: string[] = [];
  for (const spec of SERVICES.filter((item) => ids.includes(item.id) && state.children.has(item.id))) {
    await stop(spec.id);
    launch(spec);
    restarted.push(spec.id);
  }
  return { restarted, started: await startMissing(ids) };
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

/** npm run interbank:up: rebuilds the image, refreshes vendor settings, recreates containers. */
export function rebuildInterbank() {
  if (state.interbank.state === "running") return false;
  const job: Job = { state: "running", log: [], startedAt: new Date().toISOString() };
  state.interbank = job;
  const snapshot = settingHashes();
  const child = spawn("npm", ["run", "interbank:up"], { cwd: ROOT, env: shellEnv(), stdio: ["ignore", "pipe", "pipe"] });
  const secrets = Object.values(SETTING_FIELDS).filter((field) => field.secret).map((field) => envValue(field.name)).filter((value) => value.length >= 8);
  const redact = (line: string) => secrets.reduce((text, secret) => text.split(secret).join("[redacted]"), line);
  const collect = (chunk: Buffer) => {
    job.log.push(...chunk.toString("utf8").replace(ANSI, "").split(/\r?\n/).filter((line) => line.trim()).map(redact));
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.on("error", () => { job.state = "failed"; job.finishedAt = new Date().toISOString(); });
  child.on("exit", (code) => {
    job.state = code === 0 ? "succeeded" : "failed";
    job.finishedAt = new Date().toISOString();
    if (code === 0) state.applied.set(INTERBANK.id, snapshot);
  });
  return true;
}

export async function serviceStatus() {
  const services = await Promise.all(SERVICES.map(async (spec) => {
    const health = await healthy(spec);
    const child = state.children.get(spec.id);
    return {
      id: spec.id, label: spec.label, port: spec.port, up: health.up, detail: health.detail,
      managed: Boolean(child), installed: existsSync(python(spec)),
      install: `npm run ${spec.directory}:install`, pending: pendingFor(spec.id),
    };
  }));
  const lab = await healthy(INTERBANK);
  return {
    services,
    interbank: {
      id: INTERBANK.id, label: INTERBANK.label, port: INTERBANK.port, up: lab.up, pending: pendingFor(INTERBANK.id),
      job: { state: state.interbank.state, startedAt: state.interbank.startedAt, finishedAt: state.interbank.finishedAt, log: state.interbank.log.slice(-40) },
    },
  };
}
