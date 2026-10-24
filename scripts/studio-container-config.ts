// Materialize scoped configuration without placing credentials in images or command arguments.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { type RuntimeSpec } from "../config/use-cases.ts";
import { ROOT, envValue, readEnvFile, shellEnv } from "./studio-env.ts";

export const runtimeDirectory = () => process.env.STUDIO_RUNTIME_DIR ?? path.join(ROOT, ".studio/runtime");

export function containerUrl(value: string): string {
  try {
    const url = new URL(value);
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.hostname = "host.docker.internal";
    return url.toString().replace(/\/$/, value.endsWith("/") ? "/" : "");
  } catch { return value; }
}

function privateWrite(file: string, value: string) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, value, { mode: 0o600 });
  renameSync(temp, file);
  chmodSync(file, 0o600);
}

/** Directory mount preserves atomic model updates in running containers. Contains no keys. */
export function syncContainerModels() {
  const source = process.env.STUDIO_MODELS_FILE ?? path.join(ROOT, ".studio/models.json");
  const destination = path.join(runtimeDirectory(), "models/models.json");
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(source)) {
    writeFileSync(`${destination}.tmp`, readFileSync(source), { mode: 0o644 });
    renameSync(`${destination}.tmp`, destination);
    chmodSync(destination, 0o644);
  } else rmSync(destination, { force: true });
}

export function prepareContainerConfig(spec: RuntimeSpec) {
  const all = new Set([...Object.keys(shellEnv()), ...readEnvFile().keys()]);
  const allowed = (name: string) => spec.environment.some(rule => rule.endsWith("_") ? name.startsWith(rule) : name === rule);
  const values: Record<string, string> = {};
  for (const name of all) {
    if (!allowed(name) || !/^[A-Z][A-Z0-9_]*$/.test(name)) continue;
    const value = envValue(name);
    if (!value || /[\r\n\0]/.test(value)) continue;
    // The existing Interbank lab treats this former starter URL as a placeholder.
    const legacyControl = spec.id === "interbank" && name === "AGENT_CONTROL_URL" && /^http:\/\/localhost:8000\/?$/.test(value);
    values[name] = legacyControl ? value : /(?:URL|ENDPOINT)$/.test(name) ? containerUrl(value) : value;
  }
  // Container storage paths are defined by the package, independent of workstation paths.
  for (const name of ["WEALTH_CACHE", "BRIEFING_CACHE", "VULNERABILITY_RUNS_DIR", "STUDIO_MODELS_FILE"]) delete values[name];
  if (spec.id === "fraud" && !values.FRAUD_SCORE_URL) values.FRAUD_SCORE_URL = "http://host.docker.internal:8000";
  privateWrite(path.join(runtimeDirectory(), `${spec.id}.env`), Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  let certificates = [...tls.getCACertificates("default"), ...tls.getCACertificates("system")];
  const extra = envValue("EXTRA_CA_FILE");
  if (extra) certificates = [...certificates, readFileSync(extra, "utf8")];
  const ca = path.join(runtimeDirectory(), "ca.pem");
  writeFileSync(ca, [...new Set(certificates)].join("\n"), { mode: 0o644 });
  chmodSync(ca, 0o644);
  syncContainerModels();
}
