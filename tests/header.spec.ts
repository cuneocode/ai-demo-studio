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
  { title: "Market event → house-view update", section: "research-experience", cta: "Run the scenario" },
  { title: "Advisor meeting prep", section: "advisory-experience", cta: "Prepare meeting" },
  { title: "Interbank settlement investigation", section: "interbank-experience", cta: "Start investigation" },
];

for (const { title, section, cta } of LIVE_CASES) {
  test(`${title}: the header CTA focuses an enabled control in the demo`, async ({ page }) => {
    await openCase(page, title);
    await heading(page).getByRole("button", { name: cta }).click();
    await expect.poll(() => focused(page, section)).toMatchObject({ inside: true, enabled: true });
  });
}

test("the fraud header CTA reads 'Triage queue'", async ({ page }) => {
  await openCase(page, "Card fraud triage");
  await expect(heading(page).locator(".primary-button")).toHaveText(/^Triage queue/);
  await expect(heading(page).getByRole("button", { name: "Review next alert" })).toHaveCount(0);
});

test("the advisory header CTA focuses the selected household", async ({ page }) => {
  await openCase(page, "Advisor meeting prep");
  await heading(page).getByRole("button", { name: "Prepare meeting" }).click();
  await expect.poll(() => focused(page, "advisory-experience")).toMatchObject({ inside: true, enabled: true, tag: "INPUT" });
});

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
  await openCase(page, "Market event → house-view update");
  await expect(chip(page)).toHaveText(/^\s*Live · /);
});

test("a downed service never shows Live in the header", async ({ page }) => {
  const down = status({ services: [service("banking", "Brahe Bank", false), service("wealth", "Wealth", false), service("fraud", "Fraud scoring", true, false)], interbankUp: false });

  await openCase(page, "Market event → house-view update", down);
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
