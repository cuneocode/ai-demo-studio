import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/* SAR investigation, served from the committed golden recordings: every /api/sar call is mocked, so no model or AI Defense call is made. */

const RECORDED = join(process.cwd(), "services/sar/data/recorded");
type Recording = {
  name: string; title: string; scenario: string; recorded_at: string; served_by: unknown; synthetic: boolean; card: Record<string, unknown>;
  run: Record<string, unknown>; events: { id: string; kind: string; data?: Record<string, unknown> }[]; result: Record<string, unknown>;
};
const RECORDINGS: Recording[] = readdirSync(RECORDED).filter((file) => file.endsWith(".json")).sort()
  .map((file) => JSON.parse(readFileSync(join(RECORDED, file), "utf8")));
const golden = (scenario: string) => RECORDINGS.find((item) => item.scenario === scenario)!;
const ORDER = ["mule-reyes", "structuring-harbor", "explained-novak", "injection-reyes"];

const STATUS = {
  checkedAt: "2026-10-09T12:00:00.000Z",
  services: [],
  interbank: { up: true, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
  models: [],
  links: { agentObservability: null, splunkObservability: null },
  readiness: [],
};

const HOSTED = { status: "reachable", provider: "openai", label: "OpenAI API", model: "gpt-5.6-luna", private: false, fallback: true, reason: "Sparky vLLM unreachable (connection refused)" };
const DOWN = { status: "down", label: "No model reachable", private: true, fallback: false, reason: "Sparky is down and no hosted model key is set" };
const CONTROLS = { status: "enforcing", execution: "server", names: ["sar.narrative_cited", "sar.no_tipping_off", "sar.file_requires_approval"], detail: "Hosted Splunk Agent Control: SAR controls bound to the studio log stream.", fail_open: false };
const health = (model: object) => ({
  ready: true, agent: "deepagents", model, nim: model, hosted_fallback: "allowed with AI Defense enforce",
  security: { status: "configured", mode: "enforce", fail_open: false }, controls: CONTROLS, galileo: "configured",
  splunk: { status: "missing_configuration" }, recordings: RECORDINGS.length, sample: "available",
  filing: "Simulated BSA E-Filing (nothing is sent to FinCEN)", error: null, detail: null,
});

const HANDOFF = {
  id: "handoff-cpp-orbit-1", kind: "fraud-case", createdAt: "2026-10-09T15:04:00.000Z", customerId: "chuck-robbins", caseId: "cpp-orbit",
  title: "Orbit Digital Goods compromise · escalated", summary: "Cards bought at Orbit Digital Goods funded P2P pushes to a new account.",
  disposition: "escalate", score: 0.94, band: "High risk",
  evidence: [{ label: "Common point of purchase", value: "412 cards · 37 confirmed fraud", source: "Fraud triage" }],
  transactions: [{ id: "txn-cpp-1", at: "2026-10-01T18:22:00Z", amount: 480, currency: "USD", merchant: "P2P push", channel: "p2p" }],
};

type Mock = { starts: { scenario: string; input: { mode: string; handoff?: { caseId: string } } }[]; decisions: Record<string, unknown>[]; contacts: number };

/** Plays a golden recording as a live run: events stop at each human request until the page posts that decision. */
async function mockSar(page: Page, { model = HOSTED as object, down = false } = {}): Promise<Mock> {
  const mock: Mock = { starts: [], decisions: [], contacts: 0 };
  const runs = new Map<string, Recording>();
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/sar/health", (route) => down ? route.fulfill({ status: 502, body: "down" }) : route.fulfill({ json: health(model) }));
  await page.route("**/api/sar/scenarios", (route) => route.fulfill({ json: {
    scenarios: ORDER.map((id) => golden(id).card), media_source: { name: "FinCrime Wire (fictional newswire)" },
  } }));
  await page.route("**/api/sar/recordings", (route) => route.fulfill({ json: { recordings: RECORDINGS.map(({ name, title, scenario, recorded_at, served_by, synthetic, events }) => ({ name, title, scenario, recorded_at, served_by, synthetic, events: events.length })) } }));
  await page.route("**/api/sar/recordings/*", (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()!);
    return route.fulfill({ json: RECORDINGS.find((item) => item.name === name) });
  });
  await page.route((url) => url.pathname === "/api/sar/runs", async (route) => {
    const body = route.request().postDataJSON() as Mock["starts"][number] & { run_id: string };
    mock.starts.push(body);
    runs.set(body.run_id, golden(body.scenario));
    await route.fulfill({ json: { run_id: body.run_id } });
  });
  await page.route((url) => /\/api\/sar\/runs\/[^/]+\/(review|qa)$/.test(url.pathname), async (route) => {
    mock.decisions.push({ step: new URL(route.request().url()).pathname.split("/").pop(), ...route.request().postDataJSON() });
    await route.fulfill({ json: { ok: true } });
  });
  await page.route((url) => /\/api\/sar\/runs\/[^/]+\/contact$/.test(url.pathname), async (route) => {
    mock.contacts += 1;
    await route.fulfill({ json: { allowed: false, policy: "sar.no_tipping_off", engine: "hosted", reason: "The investigation may not contact the subject or reveal that a review or SAR exists. Nothing was sent." } });
  });
  await page.route((url) => /\/api\/sar\/runs\/[^/]+$/.test(url.pathname), (route) => {
    const url = new URL(route.request().url());
    const runId = decodeURIComponent(url.pathname.split("/").pop()!);
    const recording = runs.get(runId);
    if (!recording) return route.fulfill({ status: 404, json: { detail: "Unknown run." } });
    const stops = recording.events.flatMap((event, index) => event.kind === "hitl.request" ? [index] : []);
    const done = mock.decisions.length >= stops.length;
    const visible = done ? recording.events : recording.events.slice(0, stops[mock.decisions.length] + 1);
    const after = Number(url.searchParams.get("after") ?? 0);
    return route.fulfill({ json: {
      run: { ...recording.run, id: runId, status: done ? recording.run.status : "running", finished_at: done ? recording.run.finished_at : null, result: done ? recording.result : undefined },
      events: visible.slice(after).map((event) => ({ ...event, run_id: runId })), total: visible.length,
    } });
  });
  return mock;
}

async function openSar(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open SAR investigation experience" }).first().click();
  const panel = page.locator("#case-panel-demo");
  await expect(panel.getByRole("heading", { name: "Does this case need a report?" })).toBeVisible();
  return panel;
}

async function investigate(page: Page, scenario?: RegExp) {
  const panel = page.locator("#case-panel-demo");
  if (scenario) await panel.getByRole("group", { name: "SAR scenarios" }).getByRole("button", { name: scenario }).click();
  await panel.locator("#sar-investigate").click();
  await expect(panel.locator("#sar-decision-heading")).toHaveText("Investigator review", { timeout: 20000 });
  return panel;
}

test("a case run streams a cited narrative and filing waits for a separate QA approval", async ({ page }) => {
  const mock = await mockSar(page);
  const panel = await openSar(page);
  await expect(panel.getByRole("region", { name: "SAR runtime" })).toContainText("Simulated e-filing only");
  await expect(panel.locator(".sar-clock")).toContainText("Filing deadline");

  await investigate(page);
  expect(mock.starts[0]).toMatchObject({ scenario: "mule-reyes", input: { mode: "live" } });
  const narrative = panel.locator(".sar-narrative");
  await expect(narrative.locator(".rt-badge")).toContainText("OpenAI API");
  await expect(narrative).toContainText("Case data inspected by Cisco AI Defense (enforce)");
  const sentences = narrative.locator(".sar-sentence");
  expect(await sentences.count()).toBeGreaterThan(6);
  for (const sentence of await sentences.all()) expect(await sentence.locator(".sar-cite").count()).toBeGreaterThan(0);
  await expect(narrative.locator(".sar-pill.ok")).toContainText(/(\d+) of \1 sentences verified/);
  await expect(panel.locator(".sar-recommendation")).toContainText("Prepare a suspicious activity report");

  const cite = sentences.first().locator(".sar-cite").first();
  const id = (await cite.textContent())!;
  await cite.click();
  await expect(panel.locator(`.sar-evidence [data-evidence="${id}"]`)).toHaveClass(/is-focus/);
  await expect(panel.locator(".sar-typology.matched")).toContainText("Money mule");

  const decision = panel.locator(".sar-decision");
  await decision.getByRole("button", { name: "Message the customer…" }).click();
  await expect(decision.locator(".sar-denied")).toContainText("Agent Control · sar.no_tipping_off · deny");
  expect(mock.contacts).toBe(1);

  await expect(decision.getByRole("radio", { name: "Report suspicious activity" })).toHaveAttribute("aria-checked", "true");
  await decision.getByRole("button", { name: "Send report to QA" }).click();
  await expect.poll(() => mock.decisions[0]).toMatchObject({ step: "review", request_id: "investigator-1", decision: "file", by: "Theo Marsh" });
  await expect(decision.locator("#sar-decision-heading")).toHaveText("Waiting for second-line QA");
  await expect(decision.locator(".sar-policies li.deny")).toContainText("sar.file_requires_approval");
  await expect(decision.locator(".sar-filed")).toHaveCount(0);

  await decision.getByRole("button", { name: "Switch to QA (Lena Ortiz)" }).click();
  await decision.getByRole("button", { name: "Approve filing" }).click();
  await expect.poll(() => mock.decisions[1]).toMatchObject({ step: "qa", request_id: "qa-1", decision: "approve", by: "Lena Ortiz" });
  await expect(decision.locator(".sar-filed")).toContainText("SIM-BSA-", { timeout: 15000 });
  await expect(decision.locator(".sar-filed")).toContainText("nothing is sent to FinCEN");
  await expect(decision.locator(".sar-policies li.allow").last()).toContainText("sar.file_requires_approval");
  const audit = panel.locator(".sar-audit");
  await expect(audit).toContainText("Theo Marsh");
  await expect(audit).toContainText("Lena Ortiz");
});

test("the injection case withholds the flagged text and the typology rules still say file", async ({ page }) => {
  await mockSar(page);
  const panel = await openSar(page);
  const attack = panel.getByRole("group", { name: "SAR scenarios" }).getByRole("button", { name: /injected instruction/ });
  await expect(attack).toHaveClass(/kind-attack/);
  await investigate(page, /injected instruction/);
  await expect(panel.locator(".sar-case")).toHaveClass(/is-attack/);
  await expect(panel.locator(".sar-narrative .sar-pill.deny")).toContainText("3 segments withheld");
  await expect(panel.locator(".sar-recommendation")).toContainText("Prepare a suspicious activity report");
  await panel.locator(".sar-filter select").selectOption("withheld");
  await expect(panel.locator(".sar-evidence li")).toHaveCount(3);
  await expect(panel.locator(".sar-evidence li.is-withheld")).toHaveCount(2);
  await expect(panel.locator(".sar-evidence li.is-withheld").first()).toContainText("Withheld from the agent");
  await expect(panel.locator(".sar-evidence li.is-flagged")).toContainText("Memo withheld from the agent · AI Defense · Prompt Injection");
  await expect(panel.locator(".sar-evidence")).not.toContainText(/ignore (all )?(previous|prior) instructions/i);
  await expect(panel.getByLabel("SAR investigation steps", { exact: true })).toContainText("Prompt Injection");
  await expect(panel.getByLabel("SAR investigation steps", { exact: true })).toContainText("AI DEFENSE");
});

test("a fraud referral shows in the inbox and goes to the agent with the money-mule case", async ({ page }) => {
  await page.addInitScript((handoff) => window.localStorage.setItem("fsi-studio.handoffs", JSON.stringify([handoff])), HANDOFF);
  const mock = await mockSar(page);
  const panel = await openSar(page);
  const inbox = panel.locator(".sar-inbox");
  await expect(inbox.getByRole("heading", { name: "Escalated from card fraud triage" })).toBeVisible();
  await expect(inbox).toContainText("Fraud case cpp-orbit");
  await inbox.getByRole("button", { name: "Open the linked money-mule case" }).click();
  await expect(inbox.getByRole("button", { name: "Attached to the money-mule case" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator(".sar-case .sar-tag.referral")).toHaveText("Fraud referral attached");
  await investigate(page);
  expect(mock.starts[0].scenario).toBe("mule-reyes");
  expect(mock.starts[0].input.handoff).toMatchObject({ id: HANDOFF.id, caseId: "cpp-orbit", kind: "fraud-case" });
});

test("never dead: service down, model down, sample narrative, and a labelled recorded replay", async ({ page }) => {
  await mockSar(page, { down: true });
  let panel = await openSar(page);
  await expect(panel).toContainText("Source records could not be loaded");
  await expect(panel.getByText("Fallback: recorded demo", { exact: true })).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });
  const mock = await mockSar(page, { model: DOWN });
  panel = await openSar(page);
  await expect(panel.getByRole("region", { name: "SAR runtime" })).toContainText("No model reachable");
  await expect(panel.locator("#sar-investigate")).toBeDisabled();

  await panel.locator(".sar-actions").getByText("Fallback: sample narrative", { exact: true }).click();
  await panel.locator(".sar-actions").getByRole("button", { name: "Run with sample narrative" }).click();
  await expect.poll(() => mock.starts[0]?.input.mode).toBe("sample");

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  panel = await openSar(page);
  await panel.getByText("Fallback: recorded demo", { exact: true }).click();
  await panel.getByRole("button", { name: "Replay recording", exact: true }).click();
  await panel.getByRole("button", { name: "Skip replay" }).click();
  const narrative = panel.locator(".sar-narrative");
  await expect(narrative.locator(".sar-tag")).toHaveText("Recorded run");
  await expect(narrative.locator('.rt-badge[data-provenance="recorded"]')).toContainText("Recorded run");
  await expect(panel.locator(".sar-decision .sar-filed")).toContainText("SIM-BSA-", { timeout: 30000 });
  await expect(panel.getByRole("region", { name: "SAR runtime" })).not.toContainText("Measured now");
  const stats = page.getByRole("region", { name: "Live run stats" });
  await expect(stats).not.toContainText(/Recorded in Splunk AO|OTLP export/);
  await expect(stats.locator(".run-stats-kicker")).toHaveText("RUN STATS · RECORDED RUN");
  await expect(stats.locator(".run-stats-chip").filter({ hasText: /^Live$/ })).toHaveCount(0);
  await expect(stats.locator(".run-stats-chip").filter({ hasText: /^Recorded$/ }).first()).toBeVisible();
  await expect(stats.getByRole("article", { name: "Splunk Agent Observability stats" })).toContainText("Not traced now (recorded run)");
});

test("an investigation in progress survives a switch to the Architecture tab", async ({ page }) => {
  const mock = await mockSar(page);
  await openSar(page);
  const panel = await investigate(page);
  const before = await panel.locator(".sar-narrative .sar-sentence").count();
  await page.getByRole("tab", { name: "Architecture" }).click();
  await expect(page.getByRole("tab", { name: "Architecture" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Use case demo" }).click();
  await expect(panel.locator("#sar-decision-heading")).toHaveText("Investigator review");
  await expect(panel.locator(".sar-narrative .sar-sentence")).toHaveCount(before);
  await panel.locator(".sar-decision").getByRole("button", { name: "Send report to QA" }).click();
  await expect.poll(() => mock.decisions.length).toBe(1);
});
