import { expect, test, type Page } from "@playwright/test";

const STATUS = {
  checkedAt: "2026-10-09T12:00:00.000Z",
  services: [],
  interbank: { up: true, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
  models: [],
  links: { agentObservability: null, splunkObservability: null },
  readiness: [],
};

const HINT = "This is the GNN story: presenter-only wording.";
const CASES = [
  { id: "txn-compromised-merchant", label: "First purchase at a compromised merchant", account: "****1188", merchant: "Orbit Digital Goods", amount: 286.4, channel: "cnp", neighborhood: "412 cards bought here; 37 later had confirmed fraud.", hint: HINT },
  { id: "txn-clean-pos", label: "Neighborhood grocery · card present", account: "****4421", merchant: "Harbor Market #18", amount: 42.18, channel: "pos", neighborhood: "Merchant dispute rate 0.4%.", hint: HINT },
];

type Backend = "live" | "cache" | "fixture";
const LABEL: Record<Backend, string> = { live: "GNN on Sparky (live)", cache: "Recorded scores", fixture: "Sample scores" };
const RECORDED_AT = "2026-10-02T21:00:00+00:00";

function health(backend: Backend) {
  return {
    ready: true, backend, backend_label: LABEL[backend], engine: backend === "live" ? "sidecar" : null,
    model: backend === "fixture" ? "Sample scores (synthetic)" : "gnn-xgb-tabformer", detail: "mocked", threshold: 0.5, cases: CASES.length,
    sidecar: { status: backend === "live" ? "up" : "down", url: "http://127.0.0.1:8000" },
    recorded_at: backend === "cache" ? RECORDED_AT : null,
    narrative: { status: "disabled", model: null, ready: false },
    security: { status: "configured", mode: "enforce", fail_open: false },
    splunk: { status: "missing_configuration" },
  };
}

function events(runId: string, backend: Backend) {
  const at = (ms: number) => new Date(Date.parse("2026-10-09T12:00:00.000Z") + ms).toISOString();
  const base = { v: 1, run_id: runId, component: "fraud-triage" };
  return [
    { ...base, id: "e1", at: at(0), kind: "run", status: "started", lane: "agent", title: "Scoring First purchase at a compromised merchant", body: "Synthetic payment" },
    { ...base, id: "e2", at: at(5), kind: "agent.tool_call", status: "info", lane: "tools", title: "Look up the payment", data: { tool: "get_case" } },
    { ...base, id: "e3", at: at(9), kind: "tool.result", status: "ok", lane: "tools", title: "Payment found · ****1188 at Orbit Digital Goods" },
    { ...base, id: "e4", at: at(12), kind: "agent.tool_call", status: "info", lane: "tools", title: "Score the payment's graph neighborhood", data: { tool: "score_payment" } },
    { ...base, id: "e5", at: at(20), kind: "tool.result", status: "flagged", lane: "tools", title: `${LABEL[backend]} · probability 0.74 · High risk`, data: { backend } },
    { ...base, id: "e6", at: at(25), kind: "result", status: "flagged", lane: "agent", title: "High risk · Contact customer, then block and reissue" },
  ];
}

async function openFraud(page: Page, backend: Backend, { sidecarDown = backend !== "live" } = {}) {
  const runs = new Map<string, Backend>();
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/fraud/health", (route) => route.fulfill({ json: { ...health(backend), sidecar: { status: sidecarDown ? "down" : "up" } } }));
  await page.route("**/api/fraud/cases", (route) => route.fulfill({ json: { cases: CASES, threshold: 0.5 } }));
  await page.route("**/api/fraud/recordings", (route) => route.fulfill({ json: { recordings: [] } }));
  await page.route("**/api/fraud/score", async (route) => {
    const body = route.request().postDataJSON() as { case_id: string; run_id?: string };
    const runId = body.run_id ?? "fraud-mock-run-001";
    runs.set(runId, backend);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: {
      case: CASES[0], probability: 0.74, threshold: 0.5, risk_band: "high", risk_label: "High risk",
      suggested_action: "Contact customer, then block and reissue", decision: "hold",
      shap: [
        { feature: "merchant_neighborhood", label: "Merchant's network of linked cards", value: 0.41, direction: "risk" },
        { feature: "account_gnn_embedding", label: "Card's own graph history", value: -0.06, direction: "protective" },
      ],
      backend, backend_label: LABEL[backend], engine: backend === "live" ? "sidecar" : null,
      recorded_at: backend === "cache" ? RECORDED_AT : null, fallback: [], synthetic: true,
      narrative: { status: "disabled", text: null, security: { mode: "enforce", status: "not_checked", checks: 0, blocked: 0, errors: 0, event_ids: [] } },
      security: { mode: "enforce", status: "not_checked", checks: 0, blocked: 0, errors: 0, event_ids: [] },
      duration_ms: 18, run_id: runId,
    } });
  });
  await page.route("**/api/fraud/runs/*", (route) => {
    const runId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()!);
    const kind = runs.get(runId);
    if (!kind) return route.fulfill({ status: 404, json: { detail: "Unknown run." } });
    const after = Number(new URL(route.request().url()).searchParams.get("after") ?? 0);
    const all = events(runId, kind);
    return route.fulfill({ json: {
      run: { id: runId, service: "fraud", status: "completed", started_at: "2026-10-09T12:00:00.000Z", finished_at: "2026-10-09T12:00:00.030Z" },
      events: all.slice(after), total: all.length,
    } });
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Open (Transaction fraud scoring|Card fraud triage) experience$/ }).first().click();
  const panel = page.locator("#case-panel-demo");
  await expect(panel.getByRole("button", { name: /First purchase at a compromised merchant/ })).toBeVisible();
  return panel;
}

test("with the sidecar down, sample scores still score, say so, and focus the result", async ({ page }) => {
  const panel = await openFraud(page, "fixture");
  const banner = panel.locator(".fraud-status");
  await expect(banner).toContainText("The live GNN scoring sidecar on Sparky is offline");
  await expect(banner).toContainText("Sample scores for the synthetic payments");
  await expect(banner.getByRole("button", { name: "Studio settings" })).toBeVisible();
  await expect(panel).not.toContainText(HINT);

  const scoreButton = panel.locator("#score-payment");
  await expect(scoreButton).toBeEnabled();
  await expect(panel.getByRole("button", { name: "On", exact: true })).toBeDisabled();
  await expect(panel.locator("#fraud-narrative-hint")).toContainText("no summary model is configured");
  await scoreButton.click();

  const heading = panel.getByRole("heading", { name: "High risk" });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(panel.locator('.score-result [data-provenance="sample"]')).toContainText("Sample data");
  await expect(panel.locator(".suggested-action")).toContainText("Contact customer, then block and reissue");
  await expect(panel.locator(".score-source")).toContainText("Scored by Sample scores");
  await expect(panel.getByRole("list", { name: "What moved the score" })).toContainText("Merchant's network of linked cards");
  await expect(panel.getByRole("list", { name: "Scoring steps" })).toContainText("Sample scores · probability 0.74 · High risk");
  await expect(panel.locator(".score-result")).toHaveAttribute("aria-live", "polite");

  await expect(panel).not.toContainText(/\bhold\b/i);
  await expect(panel.locator(".decision-pill")).toHaveCount(0);
  await expect(panel).not.toContainText("merchant_neighborhood");
  await expect(panel).not.toContainText(HINT);
  await expect(page.getByRole("region", { name: "Live run stats" }).locator(".run-stats-model")).toContainText("Sample data");

  const badChildren = await panel.locator('ul, ol, [role="list"]').evaluateAll((lists) => lists.flatMap((list) =>
    [...list.children].filter((child) => child.tagName !== "LI" && child.getAttribute("role") !== "listitem").map((child) => child.outerHTML.slice(0, 80))));
  expect(badChildren).toEqual([]);
});

test("recorded scores are labelled as recorded, with their date", async ({ page }) => {
  const panel = await openFraud(page, "cache");
  await expect(panel.locator(".fraud-status")).toContainText("Recorded scores from the GNN");
  await panel.locator("#score-payment").click();
  await expect(panel.getByRole("heading", { name: "High risk" })).toBeFocused();
  await expect(panel.locator(".score-source")).toContainText("Scored by Recorded scores · recorded");
  const badge = panel.locator('.score-result [data-provenance="recorded"]');
  await expect(badge).toContainText("Recorded run");
  await expect(badge).toContainText("2026");
  await expect(page.getByRole("region", { name: "Live run stats" }).locator(".run-stats-model")).toContainText("Recorded run");
  await expect(panel).not.toContainText(/\bhold\b/i);
});

test("the live model shows no offline banner and names the GNN that answered", async ({ page }) => {
  const panel = await openFraud(page, "live");
  await panel.locator("#score-payment").click();
  await expect(panel.getByRole("heading", { name: "High risk" })).toBeFocused();
  await expect(panel.locator(".fraud-status")).toHaveCount(0);
  await expect(panel.locator('.score-result [data-provenance="live"]')).toContainText("GNN on Sparky");
  await expect(panel.locator(".score-source")).toContainText("Scored by GNN on Sparky (live)");
});

test("an unreachable service gets a banner, and scoring errors are announced next to the button", async ({ page }) => {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/fraud/health", (route) => route.fulfill({ status: 502, body: "down" }));
  await page.route("**/api/fraud/cases", (route) => route.fulfill({ json: { cases: CASES, threshold: 0.5 } }));
  await page.route("**/api/fraud/score", (route) => route.fulfill({ status: 503, json: { detail: "No scoring backend is available." } }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Open (Transaction fraud scoring|Card fraud triage) experience$/ }).first().click();
  const panel = page.locator("#case-panel-demo");
  await expect(panel.locator(".fraud-status")).toContainText("The fraud scoring service is not answering");
  await panel.locator("#score-payment").click();
  await expect(panel.locator(".review-card").getByRole("alert")).toContainText("No scoring backend is available.");
});
