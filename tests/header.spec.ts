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

const focused = (page: Page, section: string) => page.evaluate((id) => {
  const element = document.activeElement as HTMLElement | null;
  return {
    inside: Boolean(element && document.getElementById(id)?.contains(element)),
    enabled: Boolean(element && !element.matches(":disabled")),
    tag: element?.tagName ?? "",
  };
}, section);

const LIVE_CASES = [
  { title: "Brahe Bank assistant", section: "banking-experience", cta: "Open assistant" },
  { title: "Card fraud triage", section: "fraud-experience", cta: "Triage queue" },
  { title: "Company briefing", section: "briefing-experience", cta: "Extract briefing" },
  { title: "Wealth market research", section: "research-experience", cta: "Analyze ticker" },
  { title: "Client advisory", section: "advisory-experience", cta: "Prepare meeting brief" },
  { title: "Interbank settlement investigation", section: "interbank-experience", cta: "Start investigation" },
];

for (const { title, section, cta } of LIVE_CASES) {
  test(`${title}: the header CTA focuses an enabled control in the demo`, async ({ page }) => {
    await openCase(page, title);
    await heading(page).getByRole("button", { name: cta }).click();
    await expect.poll(() => focused(page, section)).toMatchObject({ inside: true, enabled: true });
  });
}

test("the fraud header CTA reads 'Score selected payment'", async ({ page }) => {
  await openCase(page, "Card fraud triage");
  await expect(heading(page).locator(".primary-button")).toHaveText(/^Score selected payment/);
  await expect(heading(page).getByRole("button", { name: "Review next alert" })).toHaveCount(0);
});

test("the advisory header CTA focuses the first holding or household input", async ({ page }) => {
  await openCase(page, "Client advisory");
  await heading(page).getByRole("button", { name: "Prepare meeting brief" }).click();
  await expect.poll(() => focused(page, "advisory-experience")).toMatchObject({ inside: true, enabled: true, tag: "INPUT" });
});

test("'advisory' + Enter in the launcher opens Client advisory", async ({ page }) => {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: status() }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByLabel("Search demos and pages").fill("advisory");
  await expect(page.getByRole("list", { name: "Search results" }).getByRole("listitem").first()).toContainText("Client advisory");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Client advisory", level: 1 })).toBeVisible();
});

test("the header says Live only when the use case's service is up and ready", async ({ page }) => {
  await openCase(page, "Wealth market research");
  await expect(chip(page)).toHaveText(/^\s*Live · /);
});

test("a downed service never shows Live in the header", async ({ page }) => {
  const down = status({ services: [service("banking", "Brahe Bank", false), service("wealth", "Wealth", false), service("fraud", "Fraud scoring", true, false)], interbankUp: false });

  await openCase(page, "Wealth market research", down);
  await expect(chip(page)).toHaveText(/Offline · recorded runs available/);
  await expect(chip(page)).not.toHaveText(/^\s*Live/);

  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).first().click();
  await expect(chip(page)).toHaveText(/^\s*Offline/);
  await expect(chip(page)).toHaveAttribute("title", /not running/);

  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Open Card fraud triage experience" }).first().click();
  await expect(chip(page)).not.toHaveText(/^\s*Live/);
  await expect(chip(page)).toHaveAttribute("title", /not answering/);

  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Open Interbank settlement investigation experience" }).first().click();
  await expect(chip(page)).toHaveText(/^\s*Offline/);
});

test("an unreachable studio status API does not claim Live", async ({ page }) => {
  await page.route("**/api/studio/status", (route) => route.fulfill({ status: 503, body: "" }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Company briefing experience" }).first().click();
  await expect(chip(page)).toHaveText(/Checking live service/);
});
