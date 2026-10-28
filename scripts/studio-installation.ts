// Keep Docker ownership stable when the product name or checkout directory changes.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./studio-env.ts";

export function installationNamespace(root = ROOT, file = process.env.STUDIO_INSTALLATION_FILE ?? path.join(process.env.STUDIO_RUNTIME_DIR ? path.dirname(process.env.STUDIO_RUNTIME_DIR) : path.join(root, ".studio"), "installation.json")) {
  if (existsSync(file)) {
    const value = JSON.parse(readFileSync(file, "utf8")) as { version?: number; namespace?: string };
    if (value.version !== 1 || !value.namespace || !/^[a-z0-9][a-z0-9-]{2,60}$/.test(value.namespace)) throw new Error("Invalid .studio/installation.json. Restore its namespace before operating containers.");
    return value.namespace;
  }
  // Adopt the pre-rebrand name exactly. Existing project volumes remain attached.
  const namespace = `fsi-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`;
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try { writeFileSync(file, JSON.stringify({ version: 1, namespace }, null, 2) + "\n", { mode: 0o600, flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; return installationNamespace(root, file); }
  return namespace;
}
