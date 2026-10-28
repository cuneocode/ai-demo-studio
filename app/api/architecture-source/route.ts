import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evidence } from "../../map/evidence.ts";
import captured from "../../map/source-artifacts.json" with { type: "json" };

type Artifact = {
  id: string;
  path: string;
  symbol: string;
  revision: string;
  start: number;
  end: number;
  hash: string;
  highlightLines: number[];
  html: string;
  proves: string;
};

const artifacts = (captured as { artifacts: Record<string, Artifact> }).artifacts;

function repositoryRoot(relativeFile: string) {
  const starts = [process.cwd()];
  try { starts.push(path.dirname(fileURLToPath(import.meta.url))); } catch { /* bundled runtime */ }
  for (const start of starts) {
    let dir = start;
    for (let depth = 0; depth < 8; depth += 1) {
      if (existsSync(path.resolve(dir, relativeFile))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const item = evidence[id];
  const artifact = artifacts[id];
  if (!item || !artifact) return Response.json({ error: "Unknown evidence id." }, { status: 404 });
  let note = "Captured excerpt. This is not a live file read.";
  const root = repositoryRoot(item.file);
  if (root) {
    const full = path.resolve(root, item.file);
    if (full.startsWith(root + path.sep)) {
      try {
        const lines = readFileSync(full, "utf8").split(/\r?\n/);
        const excerpt = lines.slice(item.start - 1, item.end).join("\n");
        const hash = createHash("sha256").update(excerpt).digest("hex");
        note = hash === artifact.hash
          ? "Captured excerpt matches the file at this revision."
          : "Working tree differs from this capture.";
      } catch { /* keep the captured label */ }
    }
  }
  return Response.json({
    id: artifact.id,
    file: artifact.path,
    symbol: artifact.symbol,
    start: artifact.start,
    end: artifact.end,
    proves: item.proves,
    revision: artifact.revision,
    hash: artifact.hash,
    highlightLines: artifact.highlightLines,
    html: artifact.html,
    captured: true,
    note,
    integrationId: item.integrationId,
    proofRole: item.proofRole,
    evidenceKind: item.evidenceKind,
    dependencies: item.dependencies,
  });
}
