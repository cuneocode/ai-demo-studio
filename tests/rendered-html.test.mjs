import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Studio shell and navigation", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>FSI AI Demo Studio<\/title>/);
  assert.match(html, /aria-label="Main navigation"/);
  assert.match(html, /Use case library/);
  assert.match(html, /Studio settings/);
  assert.doesNotMatch(html, /Your site is taking shape|Codex is building the first version/);
});

test("wealth UI and service messages carry no env-var names, script paths, or raw divergence ids (U6)", async () => {
  const banned = /FRED_API_KEY|serve\.sh|BEAT_VS_SPY/;
  const ui = ["MarketResearch.tsx", "ClientAdvisory.tsx", "research-note.ts", "advisory-brief.ts", "wealth-stats.ts", "wealth-evidence.tsx"];
  for (const name of ui) {
    const source = await readFile(new URL(`app/${name}`, templateRoot), "utf8");
    assert.doesNotMatch(source, banned, name);
    assert.doesNotMatch(source, /NIM meeting brief|Entitled context|ENTITLED CONTEXT|>Conflicts</, name);
  }
  const service = new URL("services/wealth/", templateRoot);
  const python = ["server.py", "cache.py", "research.py", "advisory.py", "research_agent.py", "advisory_agent.py", "nim.py", "security.py", "providers/fred.py", "tools/conflicts.py"];
  for (const name of python) {
    // Reading a variable is fine; naming it in a message the audience sees is not.
    const source = (await readFile(new URL(name, service), "utf8")).replace(/os\.getenv\(\s*"[A-Z_]+"[^)]*\)/g, "");
    assert.doesNotMatch(source, banned, name);
  }
  const recorded = new URL("data/recorded/", service);
  for (const name of (await readdir(recorded)).filter((file) => file.endsWith(".json"))) {
    const doc = await readFile(new URL(name, recorded), "utf8");
    assert.doesNotMatch(doc, banned, name);
    assert.doesNotMatch(doc, /[A-Z][A-Z0-9]+_API_KEY/, name);
  }
});
