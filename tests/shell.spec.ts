import { expect, test, type Page } from "@playwright/test";
import type { StudioStatus } from "../app/studio-status.ts";

const ready = (id: string, title: string) => ({ id, title, ready: true, missing: [], notes: [] });

const STATUS: StudioStatus = {
  checkedAt: "2026-10-08T12:00:00.000Z",
  services: [
    { id: "banking", label: "Brahe Bank", up: true, ready: true, detail: "", aiDefense: { status: "configured", mode: "enforce" }, agentControl: { status: "enforcing", names: ["Banking scope"] }, tracing: "configured", otel: "missing_configuration" },
    { id: "fraud", label: "Fraud scoring", up: true, ready: false, detail: "Start scripts/serve.sh.", aiDefense: { status: "configured", mode: "enforce" }, agentControl: null, tracing: null, otel: "missing_configuration" },
    { id: "briefing", label: "Company briefing", up: false, ready: false, detail: "Not running", aiDefense: null, agentControl: null, tracing: null, otel: null },
    { id: "wealth", label: "Wealth research and advisory", up: true, ready: true, detail: "", aiDefense: { status: "disabled", mode: "off" }, agentControl: null, tracing: "configured", otel: "exporting" },
  ],
  interbank: {
    up: true, aiDefense: { mode: "enforce, fail closed", region: "us-west-2", hops: 5 }, agentControl: "<bank>.send_a2a_message",
    project: "Interbank A2A Settlement Demo", stream: "Interbank settlement investigations",
    runs: [{ id: "inv-1", status: "completed", startedAt: "2026-10-08T11:50:00.000Z", traceId: "abc123", prompt: "Investigate failed settlement TRD-847." }],
  },
  models: [{ id: "sparky-vllm", label: "Sparky vLLM", host: "127.0.0.1:8003", up: false }],
  links: { agentObservability: "https://console.example.test", splunkObservability: null },
  readiness: [
    ready("brahe-bank", "Brahe Bank assistant"), ready("company-briefing", "Company briefing"), ready("fraud-modeling", "Transaction fraud scoring"),
    ready("market-research", "Wealth market research"),
    { id: "client-advisory", title: "Client advisory", ready: false, missing: ["OPENAI_API_KEY"], notes: [] },
    ready("interbank-a2a", "Interbank settlement investigation"),
  ],
};

async function open(page: Page) {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.goto("/", { waitUntil: "networkidle" });
}

test("top bar tabs open live Controls and Telemetry pages", async ({ page }) => {
  await open(page);
  await page.locator(".product-nav").getByRole("button", { name: "Controls" }).click();
  const controls = page.getByRole("table", { name: "Runtime controls by use case" });
  await expect(controls.getByRole("row", { name: /Brahe Bank assistant/ })).toContainText("Banking scope");
  await expect(controls.getByRole("row", { name: /Company briefing/ })).toContainText("Service not running");
  await expect(controls.getByRole("row", { name: /Interbank/ })).toContainText("5 gateway hops");

  await page.locator(".product-nav").getByRole("button", { name: "Telemetry" }).click();
  await expect(page.getByRole("link", { name: /Open Splunk Agent Observability/ })).toHaveAttribute("href", "https://console.example.test");
  await expect(page.getByRole("table", { name: "Telemetry by use case" }).getByRole("row", { name: /Wealth market research/ })).toContainText("exporting");
  await expect(page.getByRole("table", { name: "Recent interbank investigations" })).toContainText("inv-1");

  await page.getByRole("button", { name: "Open", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Brahe Bank assistant", level: 1 })).toBeVisible();
});

test("the bell lists what is down and help shows the setup checklist", async ({ page }) => {
  await open(page);
  const bell = page.getByRole("button", { name: /Service status, 3 need attention/ });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Service status" });
  await expect(panel).toContainText("Start scripts/serve.sh.");
  await expect(panel).toContainText("Nothing answering at 127.0.0.1:8003");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "User profile" })).toHaveCount(0);

  await page.getByRole("button", { name: "Help: run this demo" }).click();
  const help = page.getByRole("dialog", { name: "Run this demo" });
  await expect(help).toContainText("Needs OPENAI_API_KEY");
  await help.getByRole("button", { name: "Open Studio settings" }).click();
  await expect(page.getByRole("heading", { name: "Studio settings", level: 1 })).toBeVisible();
});

test("Cisco platform rows navigate and the sidebar collapse persists", async ({ page }) => {
  await open(page);
  const platform = page.locator(".sidebar-platform");
  await expect(platform.getByRole("button", { name: /AI Defense/ })).toContainText("3 protected");
  await platform.getByRole("button", { name: /Agent Observability/ }).click();
  await expect(page.getByRole("heading", { name: "Telemetry", level: 1 })).toBeVisible();
  await platform.getByRole("button", { name: /AI Defense/ }).click();
  await expect(page.getByRole("heading", { name: "Runtime controls", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/sidebar-collapsed/);
});

test("Cmd-K searches use cases and pages, and library filters narrow the grid", async ({ page }) => {
  await open(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByLabel("Search demos and pages").fill("telemetry");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Telemetry", level: 1 })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByLabel("Search demos and pages").fill("settlement");
  await page.getByRole("listitem").filter({ hasText: "Interbank settlement investigation" }).click();
  await expect(page.getByRole("heading", { name: "Interbank settlement investigation", level: 1 })).toBeVisible();

  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  const count = page.locator(".library-summary strong");
  const all = Number(await count.textContent());
  await page.getByRole("button", { name: "Live only" }).click();
  await expect(page.getByRole("button", { name: /Open KYC processing/ })).toHaveCount(0);
  await page.getByLabel("Cisco solution", { exact: true }).selectOption("AI Infrastructure");
  expect(Number(await count.textContent())).toBeLessThan(all);
  await page.getByRole("button", { name: "Live only" }).click();
  await page.getByLabel("Cisco solution", { exact: true }).selectOption("");
  await expect(count).toHaveText(String(all));
});

test("the story is reordered, scored from live readiness, and presented full screen", async ({ page }) => {
  await open(page);
  await page.locator(".side-nav").getByRole("button", { name: /Story builder/ }).click();
  await expect(page.locator(".story-score strong")).toHaveText("67%");
  await expect(page.locator(".story-outline")).toContainText("Needs OPENAI_API_KEY");

  await page.getByRole("button", { name: "Edit sequence" }).click();
  await page.getByRole("button", { name: "Move Client advisory up" }).click();
  await expect(page.locator(".outline-item strong").nth(1)).toHaveText("Client advisory");
  await page.getByRole("button", { name: "Remove Client advisory from the story" }).click();
  await expect(page.locator(".story-score strong")).toHaveText("100%");
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Present story" }).click();
  const bar = page.getByRole("region", { name: "Presenter controls" });
  await expect(bar).toContainText("MOMENT 1 OF 2");
  await expect(page.locator(".topbar")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(bar).toContainText("MOMENT 2 OF 2");
  await expect(page.getByRole("heading", { name: "SAR reporting support", level: 1 })).toBeVisible();
  await bar.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Build a demo story", level: 1 })).toBeVisible();
});

test("prototype queue rows select the workbench item", async ({ page }) => {
  await open(page);
  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  await page.getByRole("button", { name: /Open KYC processing/ }).click();
  await expect(page.locator(".workbench-body h3")).toHaveText("Northstar Imports LLC");
  await page.getByRole("row", { name: /Avery Chen/ }).click();
  await expect(page.getByRole("row", { name: /Avery Chen/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".workbench-body h3")).toHaveText("Avery Chen");
  await expect(page.getByRole("button", { name: "Queue settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Continue/ })).toHaveCount(0);
  await page.getByRole("button", { name: "View evidence in the architecture" }).click();
  await expect(page.locator("#architecture-explorer")).toBeInViewport();
});
