import { mockResearchGuide } from "./research-fixtures";
import { expect, test } from "@playwright/test";
import { mockStudio, openLibrary, setTheme, snapshot, statusWith, walk } from "./guide-helpers";

/** Main tours use deterministic API fixtures or reviewed recordings. External model calls are blocked. */
const TOURS = [
  { title: "Brahe Bank assistant", id: "brahe-bank", recorded: true },
  { title: "Card fraud triage", id: "fraud-modeling", recorded: true },
  { title: "Company briefing", id: "company-briefing", recorded: true },
  { title: "Market research", id: "market-research", recorded: false },
  { title: "Advisor meeting prep", id: "client-advisory", recorded: true },
  { title: "KYC processing", id: "kyc-processing", recorded: false },
  { title: "SAR investigation", id: "sar-support", recorded: true },
  { title: "Interbank settlement investigation", id: "interbank-a2a", recorded: true },
] as const;

const LAYOUTS = [
  { width: 1440, theme: "dark" },
  { width: 1100, theme: "light" },
  { width: 1440, theme: "light" },
  { width: 1100, theme: "dark" },
] as const;

test.describe.configure({ mode: "parallel" });

for (const tour of TOURS) {
  for (const layout of LAYOUTS) {
    test(`${tour.title} tour runs end to end at ${layout.width} ${layout.theme}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: layout.width, height: 900 });
      await setTheme(page, layout.theme);
      const paid = await mockStudio(page);
      if (tour.id === "market-research") await mockResearchGuide(page);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await openLibrary(page);
      await page.getByRole("button", { name: `Open ${tour.title} experience` }).first().click();
      await page.getByRole("button", { name: "Full walkthrough", exact: true }).click();
      await expect(page.getByRole("heading", { name: tour.title, level: 1 })).toBeVisible();

      const seen = await walk(page, { act: tour.id === "market-research" });
      expect(seen.length).toBeGreaterThan(4);
      expect(seen.at(-1)?.title).toBeTruthy();
      if (tour.id === "market-research") expect(seen.some(step => step.source === "Live run")).toBe(true);
      else if (tour.id === "client-advisory") expect(seen.some((step) => step.source === "Sample data · no model call")).toBe(true);
      else if (tour.recorded) expect(seen.some((step) => /^Recorded run · /.test(step.source)), "a recorded run is labelled with its date").toBe(true);
      else expect(seen.every((step) => step.source === "Illustrative prototype · no live service")).toBe(true);
      if (tour.id !== "market-research") expect(seen.some((step) => step.fits.some((fit) => fit.endsWith("=proposed") || fit.endsWith("=running") || fit.endsWith("=when-configured")))).toBe(true);
      await expect(page.locator(".guide-card")).toHaveCount(0);
      expect(paid, "no model or agent calls during a guided tour").toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("keys move through the tour, the architecture step switches tabs, and Esc returns focus", async ({ page }) => {
  await mockStudio(page);
  await openLibrary(page);
  await page.getByRole("button", { name: "Open Card fraud triage experience" }).first().click();
  const launch = page.locator(".case-guide-button");
  await launch.click();
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await expect(card).toContainText("Step 1 of");
  await page.keyboard.press("ArrowRight");
  await expect(card).toContainText("Step 2 of");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(card).toContainText("Step 1 of");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await page.keyboard.press("Enter");
  await expect(card).toContainText("Step 2 of");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await page.keyboard.press("Home");
  await expect(card).toContainText("Step 1 of");

  await page.goto("/?guide=fraud-modeling&step=fraud.architecture");
  await expect(page.getByRole("tab", { name: "Architecture" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-step", "fraud.architecture");
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-ready", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Use case demo" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".guide-dim")).toHaveCount(0);
});

test("G starts the open demo's tour and Esc restores focus to where it was", async ({ page }) => {
  await mockStudio(page);
  await openLibrary(page);
  await page.getByRole("button", { name: "Open Company briefing experience" }).first().click();
  const launch = page.locator(".case-guide-button");
  await launch.focus();
  await page.keyboard.press("g");
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-step", "briefing.problem");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(launch).toBeFocused();
});

test("a deep link opens the tour at a step and the URL follows the tour", async ({ page }) => {
  await mockStudio(page);
  await page.goto("/?guide=brahe-bank&step=banking.prompts");
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-step", "banking.prompts");
  await expect(page.getByRole("heading", { name: "Brahe Bank assistant", level: 1 })).toBeVisible();
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/guide=brahe-bank&step=banking\.ask/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/guide=/);
});

test("a step that needs a run's results resumes from the run step", async ({ page }) => {
  await mockStudio(page);
  await page.goto("/?guide=fraud-modeling&step=fraud.verdicts");
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-step", "fraud.run");
  await expect(page.getByRole("dialog").locator(".guide-actions .primary")).toBeVisible();
});

test("Cmd-K lists a guide per demo and starts it", async ({ page }) => {
  await mockStudio(page);
  await openLibrary(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByLabel("Search demos and pages").fill("Guide: SAR");
  await page.getByRole("listitem").filter({ hasText: "Guide: SAR investigation" }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-step", "sar.problem");
  await expect(page.getByRole("heading", { name: "SAR investigation", level: 1 })).toBeVisible();
});

test("the Cisco fit lines can be hidden, and the choice is remembered", async ({ page }) => {
  await mockStudio(page);
  await page.goto("/?guide=company-briefing&step=briefing.architecture");
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  const fit = card.locator(".guide-fit");
  await expect(fit).toHaveAttribute("data-cisco-status", "proposed");
  await expect(fit.locator("b")).toHaveText("Proposed");
  await card.getByRole("button", { name: "Tour options" }).click();
  await card.getByRole("menuitemcheckbox", { name: "Show Cisco fit" }).click();
  await expect(fit).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-ready", "true");
  await expect(page.getByRole("dialog").locator(".guide-fit")).toHaveCount(0);
});

test("Cisco fit lines follow live status: running, when configured, and always proposed", async ({ page }) => {
  await mockStudio(page);
  await page.goto("/?guide=company-briefing&step=briefing.trail");
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await expect(card.locator(".guide-fit")).toHaveAttribute("data-cisco-status", "when-configured");
  await expect(card.locator(".guide-fit")).toContainText("AI Defense is off for briefing on this machine");

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockStudio(page, statusWith("briefing", { aiDefense: { status: "configured", mode: "enforce" } }));
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-ready", "true");
  await expect(page.getByRole("dialog").locator(".guide-fit")).toHaveAttribute("data-cisco-status", "running");
});

test("recorded overview works while the live service is down", async ({ page }) => {
  const paid = await mockStudio(page, statusWith("banking", { up: false, ready: false, detail: "Not running" }));
  await openLibrary(page);
  await page.getByRole("button", { name: "Guided overview: Brahe Bank assistant" }).click();
  const seen = await walk(page);
  expect(seen.some(step => step.step === "banking.answer")).toBe(true);
  expect(seen.some(step => step.step === "offline")).toBe(false);
  expect(paid).toEqual([]);
});

test("leaving the demo mid-tour offers to resume where you were", async ({ page }) => {
  await mockStudio(page);
  await openLibrary(page);
  await page.getByRole("button", { name: "Guided overview: KYC processing" }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-ready", "true");
  await page.keyboard.press("ArrowRight");
  const step = await page.getByRole("dialog").getAttribute("data-guide-step");
  // The dim layer blocks the page, so leave the demo the way a script or browser history would.
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".side-nav button")].find((button) => button.textContent?.includes("Use case library"))?.click());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const toast = page.locator(".guide-toast");
  await expect(toast).toContainText("Resume guided tour: KYC processing");
  await toast.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-step", step!);
  await expect(page.getByRole("heading", { name: "KYC processing", level: 1 })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Resume at step/ })).toHaveCount(0);
});

test("an encore starts from the last card", async ({ page }) => {
  await mockStudio(page);
  await page.goto("/?guide=interbank-a2a&step=interbank.architecture");
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await card.getByRole("button", { name: "Attack: prompt-injection kickoff" }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-step", "interbank-kickoff.run");
  const seen = await walk(page);
  const blocked = seen.find((step) => step.step === "interbank-kickoff.report");
  expect(blocked?.fits).toEqual(["Cisco AI Defense=running"]);
  expect(blocked?.source).toMatch(/^Recorded run · /);
});

test("Present mode guides one moment on request and keeps the talk track otherwise", async ({ page }) => {
  await mockStudio(page);
  await openLibrary(page);
  await page.locator(".side-nav").getByRole("button", { name: /Story builder/ }).click();
  await page.getByRole("button", { name: "Present story" }).click();
  const bar = page.getByRole("region", { name: "Presenter controls" });
  await expect(bar.getByRole("list", { name: "Talk track" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Talk track", exact: true }).click();
  await expect(bar.getByRole("list", { name: "Talk track" })).toBeVisible();
  await expect(page.locator(".guide-card")).toHaveCount(0);

  await bar.getByRole("button", { name: "Guide this moment" }).click();
  const card = bar.locator(".guide-card");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await expect(card).toHaveClass(/mode-presenter/);
  await expect(bar.getByRole("list", { name: "Talk track" })).toHaveCount(0);
  const first = await snapshot(page);
  expect(first.step).toBe("kyc.label");
  await page.keyboard.press("ArrowRight");
  await expect(card).not.toHaveAttribute("data-guide-step", "kyc.label");

  await bar.getByRole("button", { name: "End guide" }).click();
  await expect(page.locator(".guide-card")).toHaveCount(0);
  await expect(bar.getByRole("list", { name: "Talk track" })).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await page.keyboard.press("ArrowRight");
  await expect(bar).toContainText("MOMENT 2 OF 4");
  await expect(page.locator(".guide-card")).toHaveCount(0);
  await expect(bar.getByRole("list", { name: "Talk track" }).locator("li").last()).toContainText("Right now");
});


test("guide live action uses the real endpoint and does not load a recording", async ({ page }) => {
  await mockStudio(page);
  let calls = 0;
  let replays = 0;
  await page.route("**/api/banking/health", route => route.fulfill({ json: { ready: true } }));
  await page.route("**/api/banking/chat", route => {
    calls++;
    expect(route.request().postDataJSON().message).toBe("What's my credit score?");
    return route.fulfill({ json: { answer: "Live endpoint test response", session_id: "test-live", sources: [], trace: [] } });
  });
  await page.goto("/?guide=brahe-bank&step=banking.ask");
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  // Banking preloads its fallback menu; count any later fetches separately.
  await page.waitForLoadState("networkidle");
  page.on("request", request => { if (/\/recordings\/banking\//.test(request.url())) replays++; });
  await expect(card.getByRole("button", { name: "Replay the recorded question" })).toBeHidden();
  await card.getByRole("button", { name: "Run live", exact: true }).click();
  await expect(page.locator(".chat-feed")).toContainText("Live endpoint test response");
  expect(calls).toBe(1);
  expect(replays).toBe(0);
  await expect(page.locator(".banking-demo")).toHaveAttribute("data-guide-source", "live");
});
