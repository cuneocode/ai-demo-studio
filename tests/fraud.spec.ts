import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/* Card fraud triage, served from the committed golden recordings so every run is deterministic and needs no model. */

const DATA = join(process.cwd(), "services/fraud/data");
const SCENARIOS = JSON.parse(readFileSync(join(DATA, "scenarios.json"), "utf8"));
type Recording = { name: string; title: string; scenario: string; recorded_at: string; served_by: unknown; synthetic: boolean; run: Record<string, unknown>; events: { kind: string; data?: Record<string, unknown> }[] };
const RECORDINGS: Recording[] = readdirSync(join(DATA, "recorded")).filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(join(DATA, "recorded", file), "utf8")));
const golden = (name: string) => RECORDINGS.find((item) => item.name === name)!;

const STATUS = {
  checkedAt: "2026-10-09T12:00:00.000Z",
  services: [],
  interbank: { up: true, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
  models: [],
  links: { agentObservability: null, splunkObservability: null },
  readiness: [],
};

const HEALTH = {
  ready: true, backend: "fixture", backend_label: "Sample scores", engine: null, model: "Sample scores (synthetic)",
  detail: "The live GNN sidecar is offline and no recorded scores exist. Showing sample scores.", threshold: 0.5, cases: 5,
  sidecar: { status: "down" }, recorded_at: null,
  agent: { status: "ready", label: "Deep Agent · OpenAI API", served_by: { provider: "openai", label: "OpenAI API", model: "gpt", external: true, fallback: true } },
  controls: { status: "enforcing", source: "agent_control", reason: null, policies: ["fraud.note_pii", "fraud.take_action"] },
  security: { status: "configured", mode: "enforce", fail_open: false },
  splunk: { status: "missing_configuration", galileo: "configured" },
  model_card: "not_measured",
};

type Mock = { decisions: { request_id: string; decision: string; by?: string; note?: string }[]; notes: { note: string }[] };

/** Plays a golden recording as a live run: events stop at each analyst request until the page posts the decision. */
async function mockFraud(page: Page, { healthDown = false } = {}): Promise<Mock> {
  const mock: Mock = { decisions: [], notes: [] };
  const runs = new Map<string, Recording>();
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/fraud/health", (route) => healthDown ? route.fulfill({ status: 502, body: "down" }) : route.fulfill({ json: HEALTH }));
  await page.route("**/api/fraud/scenarios", (route) => route.fulfill({ json: SCENARIOS }));
  await page.route("**/api/fraud/cases", (route) => route.fulfill({ json: { cases: [], threshold: 0.5 } }));
  await page.route("**/api/fraud/model-card", (route) => route.fulfill({ json: { status: "not_measured", source: null, tag: "Not measured yet — run on Sparky", headline: {}, missing: [] } }));
  await page.route("**/api/fraud/recordings", (route) => route.fulfill({ json: { recordings: RECORDINGS.map(({ name, title, scenario, recorded_at, served_by, synthetic, events }) => ({ name, title, scenario, recorded_at, served_by, synthetic, events: events.length })) } }));
  await page.route("**/api/fraud/recordings/*", (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()!);
    return route.fulfill({ json: golden(name) });
  });
  await page.route("**/api/fraud/notes", async (route) => {
    const body = route.request().postDataJSON() as { note: string };
    mock.notes.push(body);
    const pan = /\b(?:\d[ -]?){13,19}\b/.test(body.note);
    const ssn = /\b\d{3}-\d{2}-\d{4}\b/.test(body.note);
    const masked = body.note.replace(/\b(?:\d[ -]?){9,15}(\d{4})\b/g, "card ending $1").replace(/\b\d{3}-\d{2}-(\d{4})\b/g, "SSN ending $1");
    await route.fulfill({ json: {
      saved: !pan && !ssn, run_id: null,
      ai_defense: pan ? { status: "blocked", rules: ["PCI"] } : { status: "allowed", rules: [] },
      policy: { engine_label: "Agent Control", decision: pan || ssn ? "deny" : "allow", entities: [...(pan ? ["card number"] : []), ...(ssn ? ["SSN"] : [])] },
      masked: pan || ssn ? masked : null,
    } });
  });
  await page.route((url) => /\/api\/fraud\/runs\/[^/]+\/decision$/.test(url.pathname), async (route) => {
    mock.decisions.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.route((url) => url.pathname === "/api/fraud/runs", async (route) => {
    const body = route.request().postDataJSON() as { scenario: string };
    const recording = RECORDINGS.find((item) => item.scenario === body.scenario && item.name.endsWith("-scripted"))!;
    const runId = `fraud-mock-${body.scenario}`;
    runs.set(runId, recording);
    await route.fulfill({ json: { run_id: runId } });
  });
  await page.route((url) => /\/api\/fraud\/runs\/[^/]+$/.test(url.pathname), (route) => {
    const url = new URL(route.request().url());
    const runId = decodeURIComponent(url.pathname.split("/").pop()!);
    const recording = runs.get(runId);
    if (!recording) return route.fulfill({ status: 404, json: { detail: "Unknown run." } });
    const stops = recording.events.flatMap((event, index) => event.kind === "hitl.request" ? [index] : []);
    const decided = mock.decisions.length;
    const done = decided >= stops.length;
    const visible = done ? recording.events : recording.events.slice(0, stops[decided] + 1);
    const after = Number(url.searchParams.get("after") ?? 0);
    return route.fulfill({ json: {
      run: { ...recording.run, id: runId, status: done ? "completed" : "running", finished_at: done ? recording.run.finished_at : null, result: undefined },
      events: visible.slice(after).map((event) => ({ ...event, run_id: runId })), total: visible.length,
    } });
  });
  return mock;
}

async function openFraud(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Card fraud triage experience" }).first().click();
  const panel = page.locator("#case-panel-demo");
  await expect(panel.getByRole("region", { name: "Business problem" })).toBeVisible();
  return panel;
}

async function triage(page: Page, scenarioTitle: RegExp) {
  const panel = page.locator("#case-panel-demo");
  await panel.getByRole("region", { name: "Scenarios" }).getByRole("button", { name: scenarioTitle }).click();
  await panel.locator("#triage-queue").click();
  await expect(panel.getByRole("group", { name: "Analyst disposition" }).locator("button:enabled").first()).toBeVisible({ timeout: 20000 });
  return panel;
}

test("the CPP scenario: rules approve, the graph model flags, the network and reasons explain why", async ({ page }) => {
  await mockFraud(page);
  const panel = await openFraud(page);
  const band = panel.getByRole("region", { name: "Business problem" });
  await expect(band).toContainText("Maya");
  await expect(band.locator(".fx-tag.illustrative").first()).toBeVisible();
  await expect(band).toContainText("Not measured yet");
  await expect(panel.locator(".fx-mule")).toContainText("Illustrative");

  await triage(page, /Compromised merchant/);
  await expect(panel.locator(".fx-queue tbody tr")).toHaveCount(5);
  await expect(panel.locator(".fx-queue")).toContainText("Sample scores");
  await expect(panel.locator(".fx-aha")).toContainText("Rules approve what the graph model flags");
  await expect(panel.locator(".fx-gauge").first()).toContainText("Approve");
  await expect(panel.locator(".fx-gauge").nth(1)).toContainText("High risk");
  await expect(panel.locator(".fx-gauge").nth(1)).toContainText("sample score, no model ran");
  await expect(panel.locator(".fx-gauge").nth(1)).not.toContainText("GraphSAGE");
  await expect(panel.locator(".fx-reasons li").first()).toBeVisible();
  await expect(panel.locator(".fx-reasons")).toContainText("log-odds");
  await expect(panel.locator(".fx-reasons h4")).toContainText("Illustrative · not model output");
  await expect(panel).not.toContainText(/Captum|Shapley/);

  await panel.locator("#show-network").click();
  await expect(panel.getByRole("img", { name: /Network of Orbit Digital Goods/ })).toBeVisible();
  await expect(panel.locator(".fx-network")).toContainText("only payments before this one count");
  await expect(panel.locator(".fx-network")).toContainText("Illustrative layout");
  await expect(panel.locator(".fx-summary")).toContainText("Citations");
  await expect(panel.locator(".fx-backtest")).toContainText("Not measured yet");
  await expect(panel).not.toContainText(/tabformer_label|Label reveal/);
});

test("disposition is gated: the analyst decides, the policy records the approval, the label shows only afterwards", async ({ page }) => {
  const mock = await mockFraud(page);
  const panel = await openFraud(page);
  await triage(page, /Compromised merchant/);
  const decision = panel.getByRole("group", { name: "Analyst disposition" });
  await expect(decision.locator('[data-action="block_and_reissue"]')).toBeEnabled();
  await expect(panel.locator(".fx-decision")).toContainText("fraud.take_action");
  await expect(panel.locator(".fx-audit")).toContainText("deny · requires analyst approval");

  await decision.locator('[data-action="block_and_reissue"]').click();
  await expect.poll(() => mock.decisions[0]).toMatchObject({ request_id: "disposition", decision: "block_and_reissue", by: "Maya (analyst)" });
  const bulk = panel.getByRole("group", { name: "Approve proactive reissue" });
  await expect(bulk).toBeVisible({ timeout: 10000 });
  await bulk.getByRole("button", { name: /Reissue/ }).click();
  await expect.poll(() => mock.decisions[1]).toMatchObject({ request_id: "bulk_reissue", decision: "approve" });

  await expect(panel.locator(".fx-audit")).toContainText("allow · approved by Maya (analyst)", { timeout: 10000 });
  await expect(decision.locator("button:enabled")).toHaveCount(0);
  await expect(panel.locator('.fx-queue tr.open')).toContainText("Block and reissue");
  await expect(page.getByRole("region", { name: "Live run stats" })).toContainText("Tool calls");
});

test("AI Defense blocks the instruction injected into the dispute note, and the agent never sees it", async ({ page }) => {
  await mockFraud(page);
  const panel = await openFraud(page);
  await triage(page, /injected dispute note/i);
  const dispute = panel.locator(".fx-dispute");
  await expect(dispute).toHaveClass(/blocked/);
  await expect(dispute).toContainText("Untrusted input");
  await expect(dispute).toContainText("Prompt Injection");
  await expect(dispute).toContainText("the agent never sees it");
  await expect(panel.locator('[data-action="false_positive"]')).not.toHaveClass(/recommended/);
});

test("a full card number in the case note is blocked by AI Defense and the policy, then saved masked", async ({ page }) => {
  const mock = await mockFraud(page);
  const panel = await openFraud(page);
  await triage(page, /card number in a case note/);
  const note = panel.locator("#fx-note-text");
  await expect(note).toHaveValue(/4111 1111 1111 1111/);
  await panel.getByRole("button", { name: "Save note" }).click();
  const chips = panel.locator(".fx-note .fx-badges");
  await expect(chips).toContainText("AI Defense · PCI · blocked");
  await expect(chips).toContainText("Agent Control · fraud.note_pii · deny · card number, SSN");
  await expect(chips).toContainText("Not saved");
  await panel.getByRole("button", { name: /Use masked note/ }).click();
  await expect(note).toHaveValue(/card ending 1111/);
  await expect(note).not.toHaveValue(/4111 1111 1111 1111|000-12-3456/);
  await panel.getByRole("button", { name: "Save note" }).click();
  await expect(chips).toContainText("Saved");
  expect(mock.notes).toHaveLength(2);
});

test("escalating saves a SAR handoff for Dana and opens SAR investigation", async ({ page }) => {
  const mock = await mockFraud(page);
  const panel = await openFraud(page);
  await triage(page, /card number in a case note/);
  await panel.locator('[data-action="escalate"]').click();
  await expect.poll(() => mock.decisions[0]?.decision).toBe("escalate");
  await expect(panel.locator(".fx-handoff")).toContainText("SAR referral drafted", { timeout: 10000 });
  await panel.locator("#escalate-to-sar").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("fsi-studio.handoffs") ?? "[]"));
  expect(saved[0]).toMatchObject({ kind: "fraud-case", customerId: "dana-whitfield", caseId: "cpp-orbit", disposition: "escalate" });
  expect(saved[0].evidence.length).toBeGreaterThan(2);
  expect(JSON.stringify(saved[0])).not.toMatch(/4111 1111 1111 1111|000-12-3456/);
  await expect(page.locator("#sar-experience")).toBeVisible();
});

test("never dead: a replay is labelled recorded and cannot decide; a down service says what still works", async ({ page }) => {
  await mockFraud(page);
  const panel = await openFraud(page);
  await expect(panel.locator(".fraud-status")).toContainText("The live GNN scorer on Sparky is offline");
  await expect(panel.locator(".fraud-status")).toContainText("sample scores");
  await panel.locator(".rt-replay select").selectOption("cpp-orbit-live");
  await expect(panel.locator(".fx-summary")).toContainText("Recorded run", { timeout: 15000 });
  await expect(panel.locator(".fx-summary")).toContainText("OpenAI API");
  await expect(panel.locator(".fx-queue")).toContainText("scores: Sample scores");
  await expect(panel.locator(".fx-decision")).toContainText("as recorded");
  await expect(panel.getByRole("group", { name: "Analyst disposition" }).locator("button:enabled")).toHaveCount(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockFraud(page, { healthDown: true });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Card fraud triage experience" }).first().click();
  await expect(page.locator("#case-panel-demo .fraud-status")).toContainText("The fraud triage service is not answering");
  await expect(page.locator("#case-panel-demo .fraud-status")).toContainText("Studio settings");
});

test("a run in progress survives a switch to the Architecture tab", async ({ page }) => {
  await mockFraud(page);
  const panel = await openFraud(page);
  await triage(page, /Compromised merchant/);
  const heading = panel.locator("#fx-casefile-title");
  await expect(heading).toContainText("Orbit Digital Goods");
  await page.getByRole("tab", { name: "Architecture" }).click();
  await expect(page.locator("#case-panel-architecture")).toBeVisible();
  await page.getByRole("tab", { name: "Use case demo" }).click();
  await expect(heading).toContainText("Orbit Digital Goods");
  await expect(panel.locator('[data-action="block_and_reissue"]')).toBeEnabled();
});
