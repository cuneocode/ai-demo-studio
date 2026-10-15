import { readFileSync } from "node:fs";
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
    { id: "sar", label: "SAR investigation", up: true, ready: true, detail: "", aiDefense: null, agentControl: null, tracing: null, otel: null },
  ],
  interbank: {
    up: true, aiDefense: { mode: "enforce, fail closed", region: "us-west-2", hops: 5 }, agentControl: "<bank>.send_a2a_message",
    project: "Interbank A2A Settlement Demo", stream: "Interbank settlement investigations",
    runs: [{ id: "inv-1", status: "completed", startedAt: "2026-10-08T11:50:00.000Z", traceId: "abc123", prompt: "Investigate failed settlement TRD-847." }],
  },
  models: [{ id: "sparky-vllm", label: "Sparky vLLM", host: "127.0.0.1:8003", up: false }],
  links: { agentObservability: "https://console.example.test", splunkObservability: null },
  readiness: [
    ready("brahe-bank", "Brahe Bank assistant"), ready("company-briefing", "Company briefing"), ready("fraud-modeling", "Card fraud triage"),
    ready("market-research", "Market research"),
    { id: "client-advisory", title: "Advisor meeting prep", ready: false, missing: ["OPENAI_API_KEY"], notes: [] },
    ready("interbank-a2a", "Interbank settlement investigation"),
    ready("sar-support", "SAR investigation"),
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
  await expect(page.getByRole("table", { name: "Telemetry by use case" }).getByRole("row", { name: /Market research/ })).toContainText("exporting");
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
  await expect(platform.getByRole("button", { name: /Agent Observability/ })).toContainText("3 configured to trace");
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
  await page.getByRole("listitem").filter({ hasText: "Interbank settlement investigation", hasNotText: "Guide:" }).click();
  await expect(page.getByRole("heading", { name: "Interbank settlement investigation", level: 1 })).toBeVisible();

  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  const count = page.locator(".library-summary strong");
  const all = Number(await count.textContent());
  await page.getByRole("button", { name: "Live ready" }).click();
  await expect(page.getByRole("button", { name: /Open KYC processing/ })).toHaveCount(0);
  await page.getByLabel("Cisco solution", { exact: true }).selectOption("AI Infrastructure");
  expect(Number(await count.textContent())).toBeLessThan(all);
  await page.getByRole("button", { name: "Live ready" }).click();
  await page.getByLabel("Cisco solution", { exact: true }).selectOption("");
  await expect(count).toHaveText(String(all));
});

test("the story is reordered, scored from live readiness, and presented full screen", async ({ page }) => {
  await open(page);
  await page.locator(".side-nav").getByRole("button", { name: /Story builder/ }).click();
  await expect(page.locator(".outline-item strong")).toHaveText(["KYC processing", "Card fraud triage", "SAR investigation", "Advisor meeting prep"]);
  await expect(page.locator(".story-score strong")).toHaveText("25%");
  await expect(page.locator(".story-outline")).toContainText("Needs OPENAI_API_KEY");
  await expect(page.locator(".story-outline")).toContainText("Illustrative prototype · no live service");

  await page.getByRole("button", { name: "Edit sequence" }).click();
  await page.getByRole("button", { name: "Move Advisor meeting prep up" }).click();
  await expect(page.locator(".outline-item strong").nth(2)).toHaveText("Advisor meeting prep");
  await page.getByRole("button", { name: "Remove Advisor meeting prep from the story" }).click();
  await expect(page.locator(".story-score strong")).toHaveText("33%");
  await page.getByRole("button", { name: "Remove Card fraud triage from the story" }).click();
  await expect(page.locator(".story-score strong")).toHaveText("50%");
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Present story" }).click();
  const bar = page.getByRole("region", { name: "Presenter controls" });
  await expect(bar).toContainText("MOMENT 1 OF 2");
  await expect(page.locator(".topbar")).toBeHidden();
  await page.getByRole("tab", { name: "Use case demo" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Architecture" })).toHaveAttribute("aria-selected", "true");
  await expect(bar).toContainText("MOMENT 1 OF 2");
  await page.getByRole("heading", { level: 1 }).click();
  await page.keyboard.press("ArrowRight");
  await expect(bar).toContainText("MOMENT 2 OF 2");
  await expect(page.getByRole("heading", { name: "SAR investigation", level: 1 })).toBeVisible();
  await bar.getByRole("button", { name: "Talk track", exact: true }).click();
  const now = bar.getByRole("list", { name: "Talk track" }).locator("li").last();
  await expect(now).toContainText("Right now");
  await expect(now).toContainText("AI Defense is off here, so don't claim inspections");
  await expect(now).toContainText("no Agent Observability trace, so don't claim one");
  await expect(page.getByRole("tab", { name: "Use case demo" })).toHaveAttribute("aria-selected", "true");
  await bar.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Build a demo story", level: 1 })).toBeVisible();
});

test("prototype queue rows select the workbench item", async ({ page }) => {
  await open(page);
  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  const card = page.getByRole("button", { name: /Open KYC processing/ });
  await expect(card.locator(".stage-label")).toHaveText("Prototype");
  await expect(card).toContainText("In development");
  await card.click();
  await expect(page.locator(".live-status-chip")).toContainText("Illustrative prototype · no live service");
  await expect(page.locator(".case-metrics small")).toHaveText([/Illustrative$/, /Illustrative$/, /Illustrative$/]);
  await expect(page.locator(".workbench-body h3")).toHaveText("Chuck Robbins (fictional demo profile)");
  await page.getByRole("row", { name: /Avery Chen/ }).click();
  await expect(page.getByRole("row", { name: /Avery Chen/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".workbench-body h3")).toHaveText("Avery Chen");
  await expect(page.getByRole("button", { name: "Queue settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Continue/ })).toHaveCount(0);
  await page.getByRole("button", { name: "View evidence in the architecture" }).click();
  await expect(page.getByRole("tab", { name: "Architecture" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#architecture-explorer")).toBeInViewport();
  await expect(page.locator("#case-panel-demo")).toBeHidden();

  await page.getByRole("tab", { name: "Use case demo" }).click();
  await expect(page.getByRole("row", { name: /Avery Chen/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".workbench-body h3")).toHaveText("Avery Chen");
});

test("use case tabs are a keyboard tablist and opening another case resets to the demo", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Open Transaction intelligence experience" }).click();
  const demo = page.getByRole("tab", { name: "Use case demo" });
  const architecture = page.getByRole("tab", { name: "Architecture" });
  await expect(demo).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("architecture-explorer")).toHaveCount(0);

  await demo.focus();
  await page.keyboard.press("ArrowRight");
  await expect(architecture).toBeFocused();
  await expect(architecture).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Architecture" })).toBeVisible();
  await expect(page.getByTestId("architecture-explorer")).toHaveAttribute("data-system-id", "transaction-llm");
  await page.keyboard.press("Home");
  await expect(demo).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#illustrative-experience")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByLabel("Search demos and pages").fill("KYC processing");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "KYC processing", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Use case demo" })).toHaveAttribute("aria-selected", "true");
});

test("a run started in the demo keeps going on the Architecture tab and is intact on return", async ({ page }) => {
  const golden = JSON.parse(readFileSync("services/fraud/data/recorded/cpp-orbit-scripted.json", "utf8")) as { run: Record<string, unknown>; events: { kind: string }[] };
  const pause = golden.events.findIndex((event) => event.kind === "hitl.request");
  let startedAt = 0;
  let served = false;
  await page.route("**/api/fraud/health", (route) => route.fulfill({ json: { ready: true, backend: "fixture", backend_label: "Sample scores", model: "Sample scores (synthetic)", threshold: 0.5, agent: { status: "ready" } } }));
  await page.route("**/api/fraud/scenarios", (route) => route.fulfill({ json: { scenarios: [{ id: "cpp-orbit", title: "Compromised merchant", kind: "story", situation: "Clean card at a compromised merchant.", expected: "Rules approve; the graph flags." }], illustrative: {} } }));
  await page.route("**/api/fraud/cases", (route) => route.fulfill({ json: { cases: [] } }));
  await page.route("**/api/fraud/recordings", (route) => route.fulfill({ json: { recordings: [] } }));
  await page.route((url) => url.pathname === "/api/fraud/runs", (route) => { startedAt = Date.now(); return route.fulfill({ json: { run_id: "fraud-tab-run" } }); });
  await page.route((url) => url.pathname === "/api/fraud/runs/fraud-tab-run", (route) => {
    const ready = Date.now() - startedAt > 2500;
    served ||= ready;
    const events = golden.events.slice(0, ready ? pause + 1 : 2);
    const after = Number(new URL(route.request().url()).searchParams.get("after") ?? 0);
    return route.fulfill({ json: { run: { ...golden.run, id: "fraud-tab-run", status: "running", finished_at: null }, events: events.slice(after), total: events.length } });
  });
  await open(page);
  await page.getByRole("button", { name: "Open Card fraud triage experience" }).click();
  const demoPanel = page.locator("#case-panel-demo");
  await page.locator("#triage-queue").click();
  await expect(page.locator("#triage-queue")).toContainText("Triaging");

  await page.getByRole("tab", { name: "Architecture" }).click();
  await expect(demoPanel).toBeHidden();
  const explorer = page.getByTestId("architecture-explorer");
  await expect(explorer).toBeVisible();
  await expect(explorer).toHaveAttribute("data-system-id", "fraud-modeling");
  await expect.poll(() => served, { timeout: 10_000 }).toBe(true);
  await expect(demoPanel.locator(".fx-aha")).toHaveText(/Rules approve what the graph model flags/);
  const zoom = await explorer.getAttribute("data-zoom");
  expect(Number(zoom)).toBeGreaterThan(0.4);

  await page.getByRole("tab", { name: "Use case demo" }).click();
  await expect(explorer).toBeHidden();
  await expect(demoPanel.locator("#fx-casefile-title")).toContainText("Orbit Digital Goods");
  await expect(demoPanel.locator('[data-action="block_and_reissue"]')).toBeEnabled();
  await expect(page.locator("#triage-queue")).toContainText("Waiting for the analyst");

  await page.getByRole("tab", { name: "Architecture" }).click();
  await expect(page.locator(".react-flow")).toHaveCount(1);
  await expect(explorer).toHaveAttribute("data-zoom", zoom!);

  await page.getByRole("tab", { name: "Use case demo" }).click();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.getByRole("tab", { name: "Architecture" }).click();
  const camera = () => page.locator(".react-flow__viewport").evaluate((element) => (element as HTMLElement).style.transform);
  await page.waitForTimeout(500);
  const refit = await camera();

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Card fraud triage experience" }).click();
  await page.getByRole("tab", { name: "Architecture" }).click();
  await expect.poll(camera).toBe(refit);
});

test("the theme toggle switches to light mode and the choice survives a reload", async ({ page }) => {
  await open(page);
  const background = () => page.evaluate(() => getComputedStyle(document.querySelector(".sidebar")!).backgroundColor);
  const dark = await background();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await background()).not.toBe(dark);

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");
  expect(await background()).toBe(dark);
});
