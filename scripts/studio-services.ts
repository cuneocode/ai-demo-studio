// Trusted host operator. Only registered Compose projects can be controlled by the dashboard.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createConnection } from "node:net";
import { runtimes, useCasePackages, type RuntimeSpec } from "../config/use-cases.ts";
import { ROOT, envValue, readEnvFile, shellEnv } from "./studio-env.ts";
import { fetchText } from "./studio-http.ts";
import { prepareContainerConfig, runtimeDirectory } from "./studio-container-config.ts";

export const SERVICES = runtimes.filter(spec => spec.id !== "interbank");
export const INTERBANK = runtimes.find(spec => spec.id === "interbank")!;
export type ServiceSpec = RuntimeSpec;
export type Operation = "start" | "stop" | "restart" | "build" | "controls" | "start-component" | "stop-component";
type Job = { state: "running" | "succeeded" | "failed"; operation: Operation; log: string[]; startedAt: string; finishedAt?: string };
type State = { jobs: Map<string, Job>; active: Map<string, Promise<void>>; queue?: Promise<void> };
const globalState = globalThis as typeof globalThis & { __studioContainers?: State };
const state: State = globalState.__studioContainers ??= { jobs: new Map(), active: new Map() };
const checkout = createHash("sha256").update(ROOT).digest("hex").slice(0, 8);
export const projectName = (spec: RuntimeSpec) => `fsi-${checkout}-${spec.id}`;
const snapshotFile = (spec: RuntimeSpec) => path.join(runtimeDirectory(), `${spec.id}.applied.json`);

function logRedactor() {
  const names = new Set([...readEnvFile().keys(), ...Object.keys(shellEnv())]);
  const secrets: string[] = [];
  for (const name of names) {
    if (!/(?:KEY|TOKEN|SECRET|PASSWORD)/.test(name)) continue;
    const value = envValue(name);
    if (value.length >= 4) secrets.push(value);
  }
  return (value: string) => {
    for (const secret of secrets) value = value.split(secret).join("[redacted]");
    return value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  };
}
const redact = (value: string) => logRedactor()(value);

function execute(args: string[], job?: Job, timeout = 1_800_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.STUDIO_DOCKER_BIN || "docker", args, {
      cwd: ROOT, env: { ...shellEnv(), STUDIO_RUNTIME_DIR: runtimeDirectory(), LAB_UID: String(process.getuid?.() ?? 10001), LAB_GID: String(process.getgid?.() ?? 10001), COMPOSE_BAKE: "false", COMPOSE_PARALLEL_LIMIT: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let pendingLine = "";
    const cleanLog = logRedactor();
    const append = (value: string) => {
      const clean = cleanLog(value);
      output = (output + clean).slice(-500_000);
      if (job) { job.log.push(...clean.split(/\r?\n/).filter(Boolean)); job.log.splice(0, Math.max(0, job.log.length - 150)); }
    };
    const collect = (chunk: Buffer) => {
      pendingLine += chunk.toString("utf8");
      const end = pendingLine.lastIndexOf("\n");
      if (end >= 0) { append(pendingLine.slice(0, end + 1)); pendingLine = pendingLine.slice(end + 1); }
      if (pendingLine.length > 500_000) pendingLine = "[Oversized log line omitted]";
    };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Docker operation timed out. Check the stack logs.")); }, timeout);
    child.on("error", () => { clearTimeout(timer); reject(new Error("Docker is unavailable. Install Docker with Compose and start its engine.")); });
    child.on("close", code => { clearTimeout(timer); append(pendingLine); if (code === 0) resolve(output); else reject(new Error(output.trim().split("\n").slice(-8).join("\n") || `Docker exited with status ${code}.`)); });
  });
}

export const composeArgs = (spec: RuntimeSpec, args: string[]) => ["compose", "--project-name", projectName(spec), "--project-directory", path.dirname(path.join(ROOT, spec.compose)), "--file", path.join(ROOT, spec.compose), ...args];
const compose = (spec: RuntimeSpec, args: string[], job?: Job) => execute(composeArgs(spec, args), job, ["ps", "logs", "config"].includes(args[0]) ? 10_000 : 1_800_000);

function hashes(spec: RuntimeSpec) {
  const keys = new Set([...readEnvFile().keys(), ...Object.keys(shellEnv())]);
  return Object.fromEntries([...keys].filter(key => spec.environment.some(rule => rule.endsWith("_") ? key.startsWith(rule) : key === rule)).sort().map(key => [key, createHash("sha256").update(envValue(key)).digest("hex")]));
}
function pending(spec: RuntimeSpec): string[] | null {
  try {
    const applied = JSON.parse(readFileSync(snapshotFile(spec), "utf8")) as Record<string, string>;
    const current = hashes(spec);
    return [...new Set([...Object.keys(applied), ...Object.keys(current)])].filter(key => applied[key] !== current[key]);
  } catch { return null; }
}

async function health(spec: RuntimeSpec) {
  try {
    const response = await fetchText(`http://127.0.0.1:${spec.port}${spec.health}`, { timeout: 2000 });
    const body = response.status === 200 ? JSON.parse(response.text) : null;
    const controlsBlocked = body?.controls?.status === "unavailable";
    return { up: Boolean(body && typeof body === "object"), ready: Boolean(body && body.ready !== false && !controlsBlocked), detail: body?.error || body?.detail || (controlsBlocked ? body.controls.detail || "Hosted controls are unavailable." : "") };
  } catch { return { up: false, ready: false, detail: "" }; }
}

function portInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (open: boolean) => { socket.destroy(); resolve(open); };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}

type Container = { Service: string; State: string; Health?: string; Name?: string };
async function containers(spec: RuntimeSpec): Promise<Container[]> {
  // Discovery must work before scoped env files exist on a fresh checkout.
  const output = await execute(["ps", "--all", "--filter", `label=com.docker.compose.project=${projectName(spec)}`, "--format", "{{json .}}"], undefined, 10_000);
  if (!output.trim()) return [];
  return output.trim().split("\n").flatMap(line => {
    const value = JSON.parse(line);
    const rows: Record<string, unknown>[] = Array.isArray(value) ? value : [value];
    return rows.map(row => ({
      Service: String(row.Labels ?? "").split(",").find(label => label.startsWith("com.docker.compose.service="))?.split("=")[1] ?? "",
      State: String(row.State ?? ""), Name: String(row.Names ?? ""),
    }));
  });
}

async function prepare(spec: RuntimeSpec, job?: Job, initialize = true) {
  prepareContainerConfig(spec);
  if (spec.id !== "interbank") return;
  const directory = path.join(ROOT, "services/interbank/.runtime");
  mkdirSync(directory, { recursive: true });
  for (const relative of ["runs", "telemetry/bank-a", "telemetry/bank-b"]) mkdirSync(path.join(ROOT, "services/interbank/evidence", relative), { recursive: true });
  for (const file of ["vendor.env", "model.env"]) if (!existsSync(path.join(directory, file))) writeFileSync(path.join(directory, file), "", { mode: 0o600 });
  // The Python services share one image. Build it once before the helper runs.
  await compose(spec, ["build", "bank-a-agent"], job);
  if (initialize) await compose(spec, ["run", "--rm", "--no-deps", "setup"], job);
}

/** Stop preserves named volumes and saved runs. Registration of hosted controls is explicit. */
export async function perform(spec: RuntimeSpec, operation: Operation, job?: Job, componentId?: string) {
  if (state.active.size > 1) job?.log.push("Queued behind the current container operation.");
  const active = (state.queue ?? Promise.resolve()).then(() => performNow(spec, operation, job, componentId));
  state.queue = active.catch(() => {});
  return active;
}

async function performNow(spec: RuntimeSpec, operation: Operation, job?: Job, componentId?: string) {
  if (process.env.STUDIO_PREVIEW === "1") throw new Error("Container controls are disabled in recorded preview.");
  await execute(["info", "--format", "{{.ServerVersion}}"], undefined, 10_000);
  if (operation !== "stop" && operation !== "stop-component") {
    const disk = statfsSync(ROOT);
    const available = disk.bavail * disk.bsize / 1024 ** 3;
    const minimum = Number(process.env.STUDIO_MIN_FREE_GB ?? 15);
    if (available < minimum) throw new Error(`Free disk space is ${available.toFixed(1)} GB. Container operations require at least ${minimum} GB free; allow 30 GB for the full suite.`);
  }
  if (operation === "stop") { await compose(spec, ["--profile", "*", "stop", "--timeout", "25"], job); return; }
  if (operation === "stop-component") {
    const component = spec.components?.find(item => item.id === componentId);
    if (!component) throw new Error("Choose a registered component.");
    await compose(spec, ["--profile", component.profile, "stop", "--timeout", "25", ...component.services], job);
    return;
  }
  if (operation === "start" || operation === "restart" || operation === "controls") {
    const owned = await containers(spec);
    const ownsApi = owned.some(container => container.Service === spec.service && container.State === "running");
    if (!ownsApi && await portInUse(spec.port)) throw new Error(`Port ${spec.port} is used by a service outside this stack. Stop that service before starting this package.`);
  }
  await prepare(spec, job, operation !== "build");
  if (operation === "start-component") {
    const component = spec.components?.find(item => item.id === componentId);
    if (!component) throw new Error("Choose a registered component.");
    await compose(spec, ["--profile", component.profile, "up", "--detach", ...component.services], job);
    return;
  }
  if (operation === "build") { if (spec.id !== "interbank") await compose(spec, ["build"], job); return; }
  if (operation === "controls") {
    if (!spec.controls) throw new Error("This package has no hosted policy registration.");
    await compose(spec, ["run", "--build", "--rm", "--no-deps", spec.id === "interbank" ? "setup" : spec.service, ...spec.controls], job);
    return;
  }
  await compose(spec, ["up", "--detach", spec.id === "interbank" ? "--no-build" : "--build", "--wait", "--wait-timeout", "240", ...(operation === "restart" ? ["--force-recreate"] : [])], job);
  if (!(await health(spec)).up) throw new Error("Containers started, but the application API is not responding. Open the stack logs.");
  writeFileSync(snapshotFile(spec), JSON.stringify(hashes(spec)), { mode: 0o600 });
}

export function queueOperation(ids: string[], operation: Operation, componentId?: string) {
  const selected = runtimes.filter(spec => ids.includes(spec.id));
  if (!selected.length || ids.some(id => !runtimes.some(spec => spec.id === id))) throw new Error("Choose a registered use-case runtime.");
  if (selected.some(spec => state.active.has(spec.id))) throw new Error("A selected stack already has an operation in progress.");
  for (const spec of selected) {
    const job: Job = { state: "running", operation, log: [], startedAt: new Date().toISOString() };
    state.jobs.set(spec.id, job);
    const active = perform(spec, operation, job, componentId).then(() => { job.state = "succeeded"; }).catch(error => { job.state = "failed"; job.log.push(redact((error as Error).message)); }).finally(() => { job.finishedAt = new Date().toISOString(); state.active.delete(spec.id); });
    state.active.set(spec.id, active);
  }
  return selected.map(spec => spec.id);
}

export async function runtimeLogs(id: string) {
  const spec = runtimes.find(item => item.id === id);
  if (!spec) throw new Error("Unknown use-case runtime.");
  return redact(await compose(spec, ["logs", "--no-color", "--tail", "80"]));
}

let statusRequest: Promise<Awaited<ReturnType<typeof loadServiceStatus>>> | undefined;
export function serviceStatus() {
  if (!statusRequest) {
    statusRequest = loadServiceStatus().finally(() => { statusRequest = undefined; });
  }
  return statusRequest;
}

async function loadServiceStatus() {
  let docker = { ready: true, detail: "Docker Compose available" };
  if (process.env.STUDIO_PREVIEW === "1") docker = { ready: false, detail: "Recorded preview" };
  else try { await execute(["info", "--format", "{{.ServerVersion}}"], undefined, 5000); }
  catch (error) { docker = { ready: false, detail: (error as Error).message }; }
  const services = await Promise.all(runtimes.map(async spec => {
    const [current, owned] = await Promise.all([process.env.STUDIO_PREVIEW === "1" ? Promise.resolve({ up: false, ready: false, detail: "Recorded preview" }) : health(spec), docker.ready ? containers(spec).catch(() => []) : Promise.resolve([])]);
    const job = state.jobs.get(spec.id);
    return { id: spec.id, label: spec.label, port: spec.port, ...current, managed: owned.length > 0, installed: true,
      project: projectName(spec), pending: owned.length ? pending(spec) : null, containers: owned, controls: Boolean(spec.controls), components: spec.components,
      state: job?.state === "running" ? job.operation === "stop" ? "stopping" : job.operation === "build" ? "building" : "starting" : owned.some(item => item.State === "running") ? current.ready ? "ready" : "blocked" : "stopped",
      job: job ?? { state: "idle", log: [] }, install: "npm run studio:install" };
  }));
  return { docker, services, interbank: services.find(spec => spec.id === "interbank")!, packages: useCasePackages.map(({ id, title, mode, runtime }) => ({ id, title, mode, runtime: runtime?.id ?? null })) };
}

// Every demo starts through an explicit dashboard action. Containers outlive the dashboard.
export async function startMissing(ids: string[] = []) { return ids.length ? queueOperation(ids, "start") : []; }
export async function apply(ids?: string[]) {
  const status = await serviceStatus();
  const selected = status.services.filter(row => row.managed && row.up && (!ids || ids.includes(row.id))).map(row => row.id);
  return { restarted: selected.length ? queueOperation(selected, "restart") : [], started: [] };
}
export async function stopAll() { /* Stop is an explicit per-stack operation. */ }
export function rebuildInterbank() { return queueOperation(["interbank"], "restart").length > 0; }
