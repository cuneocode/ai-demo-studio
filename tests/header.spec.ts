import { expect, test, type Page } from "@playwright/test";

const service = (id: string, label: string, up = true, ready = up) => ({
  id, label, up, ready, detail: up ? (ready ? "" : "Model endpoint is not answering") : "Not running",
  aiDefense: null, agentControl: null, tracing: null, otel: null,
});

const status = (overrides: { services?: ReturnType<typeof service>[]; interbankUp?: boolean } = {}) => ({
  checkedAt: "2026-10-08T12:00:00.000Z",
  services: overrides.services ?? [
    service("banking", "Brahe Bank"), service("fraud", "Fraud scoring"),
    service("briefing", "Company briefing"), service("wealth", "Wealth"),
  ],
  interbank: { up: overrides.interbankUp ?? true, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
  models: [],
  links: { agentObservability: "https://console.example.test", splunkObservability: null },
  readiness: [],
});

async function openCase(page: Page, title: string, json: unknown = status()) {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Open ${title} experience` }).first().click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

const heading = (page: Page) => page.locator(".case-frame-heading");
const chip = (page: Page) => heading(page).locator(".live-status-chip");

const LIVE_CASES = ["Brahe Bank assistant", "Card fraud triage", "Company briefing", "Market research", "Advisor meeting prep", "SAR investigation", "Interbank settlement investigation"];
for (const title of LIVE_CASES) {
  test(`${title}: live controls lead, recordings require explicit fallback selection`, async ({ page }) => {
    await openCase(page, title);
    await expect(heading(page).locator(".primary-button")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Replay recording", exact: true })).toBeHidden();
    await expect(page.getByText(/^Fallback: recorded (demo|extract)$/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Guided overview", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Full walkthrough", exact: true })).toBeVisible();
    const stats = page.getByRole("region", { name: "Live run stats", exact: true });
    await expect(stats).toBeVisible();
    expect(await stats.evaluate((element) => Boolean(element.closest("details")))).toBe(false);
  });
}

test("'meeting prep' + Enter in the launcher opens Advisor meeting prep", async ({ page }) => {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: status() }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByLabel("Search demos and pages").fill("meeting prep");
  await expect(page.getByRole("list", { name: "Search results" }).getByRole("listitem").first()).toContainText("Advisor meeting prep");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Advisor meeting prep", level: 1 })).toBeVisible();
});

test("the header says Live only when the use case's service is up and ready", async ({ page }) => {
  await openCase(page, "Market research");
  await expect(chip(page)).toHaveText(/^\s*Live ready/);
});

test("a downed service never shows Live in the header", async ({ page }) => {
  const down = status({ services: [service("banking", "Brahe Bank", false), service("wealth", "Wealth", false), service("fraud", "Fraud scoring", true, false)], interbankUp: false });

  await openCase(page, "Market research", down);
  await expect(chip(page)).toHaveText(/Live unavailable/);
  await expect(chip(page)).not.toHaveText(/^\s*Live ready/);

  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).first().click();
  await expect(chip(page)).toHaveText(/^\s*Live unavailable/);
  await expect(chip(page)).toHaveAttribute("title", /not running/);

  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Open Card fraud triage experience" }).first().click();
  await expect(chip(page)).not.toHaveText(/^\s*Live ready/);
  await expect(chip(page)).toHaveAttribute("title", /not answering/);

  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Open Interbank settlement investigation experience" }).first().click();
  await expect(chip(page)).toHaveText(/^\s*Live unavailable/);
});

test("an unreachable studio status API does not claim Live", async ({ page }) => {
  await page.route("**/api/studio/status", (route) => route.fulfill({ status: 503, body: "" }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Company briefing experience" }).first().click();
  await expect(chip(page)).toHaveText(/Live unavailable/);
});


test("failed live fraud triage stays failed until a fallback is explicitly chosen", async ({ page }) => {
  let replayLoads = 0;
  await page.route("**/api/fraud/runs", route => route.fulfill({ status: 503, json: { detail: "Service unavailable" } }));
  page.on("request", request => { if (/\/recordings\/fraud\//.test(request.url())) replayLoads++; });
  await openCase(page, "Card fraud triage");
  await page.locator("#triage-queue").click();
  await expect(page.getByRole("alert")).toContainText("did not start the run");
  await expect(page.locator(".fraud-demo")).not.toHaveAttribute("data-guide-source", "recorded");
  expect(replayLoads).toBe(0);
});
