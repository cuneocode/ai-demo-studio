// The repository .env: read by every service and labctl, edited by Studio settings.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const envFile = () => process.env.STUDIO_ENV_FILE ?? path.join(ROOT, ".env");

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;
const HEADER = "# Added by Studio settings";

function parseValue(raw: string) {
  const value = raw.trim();
  const quoted = /^(['"])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value.replace(/\s+#.*$/, "");
}

/** Keys in the .env file; the last assignment wins, as in python-dotenv. */
export function readEnvFile(): Map<string, string> {
  const values = new Map<string, string>();
  if (!existsSync(envFile())) return values;
  for (const line of readFileSync(envFile(), "utf8").split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (match && !line.trimStart().startsWith("#")) values.set(match[1], parseValue(match[2]));
  }
  return values;
}

/**
 * The environment the studio started with, without values copied in from .env
 * (Vite loads it into process.env and never unloads keys removed later).
 */
export function shellEnv(): NodeJS.ProcessEnv {
  const store = globalThis as typeof globalThis & { __studioShellEnv?: NodeJS.ProcessEnv };
  if (!store.__studioShellEnv) {
    const file = readEnvFile();
    store.__studioShellEnv = Object.fromEntries(Object.entries(process.env).filter(([name, value]) => file.get(name) !== value));
  }
  return store.__studioShellEnv;
}

/** The file wins; anything else comes from the shell the studio started in. */
export function envValue(name: string): string {
  return readEnvFile().get(name) ?? shellEnv()[name] ?? "";
}

const format = (value: string) => (/^[A-Za-z0-9_./:@+=,-]*$/.test(value) ? value : `"${value}"`);

/**
 * Sets and clears keys in place: the first assignment is rewritten, repeats are
 * dropped, and comments and unrelated lines are kept. Values must already be
 * validated (single line, no quotes or backslashes). The file stays 0600.
 */
export function updateEnvFile(set: Record<string, string>, clear: string[]) {
  const file = envFile();
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const pending = new Map(Object.entries(set));
  const removed = new Set(clear.filter((name) => !pending.has(name)));
  const written = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const match = line.trimStart().startsWith("#") ? null : LINE.exec(line);
    const name = match?.[1];
    if (!name || !(pending.has(name) || removed.has(name) || written.has(name))) { out.push(line); continue; }
    if (pending.has(name)) {
      out.push(`${name}=${format(pending.get(name)!)}`);
      pending.delete(name);
      written.add(name);
    }
  }
  while (out.length && (out[out.length - 1] === "" || out[out.length - 1] === HEADER)) out.pop();
  if (pending.size) {
    if (!out.includes(HEADER)) out.push("", HEADER);
    for (const [name, value] of pending) out.push(`${name}=${format(value)}`);
  }
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${out.join("\n")}\n`, { mode: 0o600 });
  renameSync(temporary, file);
  chmodSync(file, 0o600);
}
