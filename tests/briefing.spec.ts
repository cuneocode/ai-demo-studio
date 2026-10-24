import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const RECORDED = JSON.parse(readFileSync(resolve("services/briefing/data/recorded/halcyon-annual-report.json"), "utf8"));

const STATUS = {
  checkedAt: "2026-10-12T12:00:00.000Z",
  services: [],
  interbank: { up: true, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
  models: [],
  links: { agentObservability: null, splunkObservability: null },
  readiness: [],
};

const SERVED = { provider: "openai", label: "OpenAI API", model: "gpt-test", kind: "openai", private: false, external: true, fallback: false, reason: "" };

function briefing(extra: Record<string, unknown> = {}) {
  return {
    company: { name: "JPMORGAN CHASE & CO", ticker: "JPM", cik: "0000019617" },
    period: { form: "10-K", filedAt: "2026-02-14", periodOfReport: "2025-12-31", fiscalYear: 2025 },
    source: { kind: "edgar", label: "0001628280-26-008131", url: "https://www.sec.gov/x", accession: "0001628280-26-008131" },
    objectives: { status: "extracted", facts: [{ text: "Grow digital banking", item: "1", node_id: "n1", excerpt: "We will grow digital banking.", source_url: "" }] },
    risks: { status: "abstain", facts: [] },
    regulatory: { status: "abstain", facts: [] },
    ai_initiatives: { status: "abstain", facts: [] },
    metrics: [],
    trail: { path: "edgar", todos: [], nodes_read: [{ id: "n1", theme: "objectives", chars: 900 }], tools: ["fetch_annual_report", "build_filing_toc"] },
    grounding: { dropped_facts: 1, dropped_metrics: 0 },
    security: { mode: "off", status: "disabled", checks: 0, blocked: 0, errors: 0, event_ids: [] },
    usage: { llm_calls: 12, input_tokens: 40000, output_tokens: 2000 },
    served_by: SERVED,
    telemetry: { splunk: { status: "missing_configuration" } },
    cached: false,
    recorded_at: "2026-10-12T12:00:00+00:00",
    duration_ms: 60000,
    ...extra,
  };
}

async function extract(page: Page, payload: Record<string, unknown>) {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/briefing/health", (route) => route.fulfill({ json: {
    ready: true, model: "gpt-test", sec: { status: "configured", user_agent_set: true }, security: { status: "disabled", mode: "off", fail_open: false },
    splunk: { status: "missing_configuration" }, perimeter: "EDGAR + upload only",
  } }));
  await page.route("**/api/briefing/search*", (route) => route.fulfill({ json: { query: "JPM", candidates: [{ cik: "0000019617", ticker: "JPM", name: "JPMORGAN CHASE & CO" }] } }));
  await page.route("**/api/briefing/analyze", (route) => route.fulfill({ json: payload }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Company briefing experience" }).first().click();
  await page.getByLabel("Company name or ticker").fill("JPM");
  await page.getByRole("tabpanel", { name: "Use case demo" }).getByRole("button", { name: "Extract briefing" }).click();
  const review = page.locator(".briefing-review-head");
  await expect(review.locator("h2")).toContainText((payload.company as { name: string }).name);
  return review;
}

test("a live extract names the model that answered", async ({ page }) => {
  const review = await extract(page, briefing());
  await expect(review.locator("[data-provenance='live']")).toContainText("Answered by OpenAI API · gpt-test");
  await expect(review.locator("[data-provenance='recorded']")).toHaveCount(0);
  await expect(page.locator(".briefing-trail")).toContainText("AI Defense: disabled");
});

test("a cached replay is labelled as a recorded run with its date, never as live", async ({ page }) => {
  const review = await extract(page, briefing({
    cached: true, recorded_at: "2026-10-08T21:33:55+00:00", usage: { llm_calls: 0, input_tokens: 0, output_tokens: 0 },
    security: { mode: "off", status: "disabled", checks: 0, blocked: 0, errors: 0, event_ids: [], replay: true },
    telemetry: { splunk: { status: "not_reexported", reason: "cached replay" } },
  }));
  await expect(review.locator("[data-provenance='recorded']")).toContainText(/Recorded run · Oct \d+, 2026 · OpenAI API/);
  await expect(review.locator("[data-provenance='live']")).toHaveCount(0);
  await expect(review).toContainText("no model ran this time");
  await expect(page.locator(".briefing-trail")).toContainText("AI Defense (original run): disabled");
  const stats = page.getByRole("region", { name: "Live run stats" });
  await expect(stats.locator(".run-stats-status")).toHaveText("Cached replay");
});

test("a synthetic upload is labelled synthetic", async ({ page }) => {
  const review = await extract(page, briefing({
    company: { name: "Halcyon Interconnect, Inc.", ticker: "HCYN", cik: null },
    source: { kind: "upload", label: "Uploaded · annual-report-fy2025.html", url: null, filename: "annual-report-fy2025.html", accession: null, synthetic: true },
  }));
  await expect(review.locator(".briefing-synthetic-chip")).toHaveText("Synthetic document · fictional issuer · not an SEC filing");
});

test("a real filing carries no synthetic label", async ({ page }) => {
  const review = await extract(page, briefing());
  await expect(review.locator(".briefing-synthetic-chip")).toHaveCount(0);
});

test("the committed recorded extract replays as recorded, runs no model, and can still be accepted", async ({ page }) => {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/briefing/health", (route) => route.fulfill({ json: {
    ready: true, model: "gpt-test", sec: { status: "configured", user_agent_set: true }, security: { status: "disabled", mode: "off", fail_open: false },
    splunk: { status: "missing_configuration" }, perimeter: "EDGAR + upload only",
  } }));
  await page.route("**/api/briefing/recordings", (route) => route.fulfill({ json: { recordings: [{ name: RECORDED.name, title: RECORDED.title, recorded_at: RECORDED.recorded_at, served_by: RECORDED.served_by, events: 0, synthetic: true }] } }));
  await page.route(`**/api/briefing/recordings/${RECORDED.name}`, (route) => route.fulfill({ json: RECORDED }));
  let analyzed = 0;
  await page.route("**/api/briefing/analyze", (route) => { analyzed += 1; return route.fulfill({ status: 500, json: { detail: "not expected" } }); });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Company briefing experience" }).first().click();
  await expect(page.locator(".briefing-demo")).toHaveAttribute("data-guide-source", "none");
  await page.locator(".briefing-demo .demo-fallback > summary").click();
  await page.locator("#briefing-replay").click();
  const review = page.locator(".briefing-review-head");
  await expect(review.locator("h2")).toContainText("Halcyon Interconnect");
  await expect(review.locator("[data-provenance='recorded']")).toContainText(/Recorded run · Oct \d+, 2026 · OpenAI API/);
  await expect(review.locator("[data-provenance='live']")).toHaveCount(0);
  await expect(review).toContainText("no model ran this time");
  await expect(page.locator(".briefing-trail")).toContainText("AI Defense (original run): disabled");
  await expect(page.locator(".briefing-demo")).toHaveAttribute("data-guide-source", "recorded");
  await review.getByRole("button", { name: "Use this company" }).click();
  await expect(review.locator(".briefing-accepted")).toContainText("Using this company");
  expect(analyzed).toBe(0);
});
