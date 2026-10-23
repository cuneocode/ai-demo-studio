import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHighlighter } from "shiki";
import { evidence } from "../app/map/evidence.ts";

const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const highlighter = await createHighlighter({ themes: ["github-dark"], langs: ["python", "yaml", "sql", "typescript"] });
const prefix = process.argv.find((arg) => arg.startsWith("--prefix="))?.slice("--prefix=".length);
const selected = Object.values(evidence).filter((item) => !prefix || item.id.startsWith(prefix));
if (!selected.length) throw new Error(`No evidence matches ${prefix}`);
const artifacts: Record<string, unknown> = prefix
  ? JSON.parse(readFileSync("app/map/source-artifacts.json", "utf8")).artifacts : {};
const languages: Record<string, "python" | "yaml" | "sql" | "typescript"> = { py: "python", yaml: "yaml", yml: "yaml", sql: "sql", ts: "typescript" };

for (const item of selected) {
  const lang = languages[item.file.split(".").pop() ?? ""];
  if (!lang) throw new Error(`${item.id} has no highlighter for ${item.file}`);
  const text = readFileSync(item.file, "utf8");
  const lines = text.split(/\r?\n/);
  if (item.start < 1 || item.end > lines.length || item.end < item.start) {
    throw new Error(`${item.id} range ${item.start}-${item.end} is outside ${item.file}`);
  }
  const excerpt = lines.slice(item.start - 1, item.end).join("\n");
  const symbol = item.symbol.split(".").pop() ?? item.symbol;
  const nearby = lines.slice(Math.max(0, item.start - 80), item.end).join("\n");
  if (!nearby.includes(symbol)) throw new Error(`${item.id} range ${item.start}-${item.end} does not look like ${item.symbol}`);
  const { tokens } = highlighter.codeToTokens(excerpt, { lang, theme: "github-dark" });
  const html = tokens.map((line, index) => {
    const spans = line.map((token) => `<span style="color:${token.color ?? "#e4edf8"}">${escapeHtml(token.content)}</span>`).join("");
    const lineNo = item.start + index;
    return `<div class="src-line" data-line="${lineNo}"><span class="src-no">${lineNo}</span><span class="src-text">${spans}</span></div>`;
  }).join("");
  artifacts[item.id] = {
    id: item.id,
    path: item.file,
    symbol: item.symbol,
    revision,
    start: item.start,
    end: item.end,
    hash: createHash("sha256").update(excerpt).digest("hex"),
    highlightLines: Array.from({ length: item.end - item.start + 1 }, (_, index) => item.start + index),
    html,
    proves: item.proves,
  };
}

writeFileSync("app/map/source-artifacts.json", JSON.stringify({ revision, artifacts }));
console.log(`captured ${selected.length} excerpts at ${revision}`);

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char] ?? char));
}
