import { expect, test } from "@playwright/test";
import { mockStudio, openLibrary, setTheme, snapshot, statusWith, walk } from "./guide-helpers";

/** Each demo's main tour, launched from its library card. Recorded runs only; any model call is blocked and fails the test. */
const TOURS = [
  { title: "Brahe Bank assistant", id: "brahe-bank", recorded: true },
  { title: "Card fraud triage", id: "fraud-modeling", recorded: true },
  { title: "Company briefing", id: "company-briefing", recorded: true },
  { title: "Market event → house-view update", id: "market-research", recorded: true },
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
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await openLibrary(page);
      await page.getByRole("button", { name: `Guided tour: ${tour.title}` }).click();
      await expect(page.getByRole("heading", { name: tour.title, level: 1 })).toBeVisible();

      const seen = await walk(page);
      expect(seen.length).toBeGreaterThan(4);
      expect(seen.at(-1)?.title).toBeTruthy();
      if (tour.id === "client-advisory") expect(seen.some((step) => step.source === "Sample data · no model call")).toBe(true);
      else if (tour.recorded) expect(seen.some((step) => /^Recorded run · /.test(step.source)), "a recorded run is labelled with its date").toBe(true);
      else expect(seen.every((step) => step.source === "Illustrative prototype · no live service")).toBe(true);
      expect(seen.some((step) => step.fits.some((fit) => fit.endsWith("=proposed") || fit.endsWith("=running") || fit.endsWith("=when-configured")))).toBe(true);
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
  await page.keyboard.press("ArrowLeft");
  await expect(card).toContainText("Step 1 of");
  await page.keyboard.press("Enter");
  await expect(card).toContainText("Step 2 of");
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

test("a demo whose service is down gets the short offline tour", async ({ page }) => {
  await mockStudio(page, statusWith("banking", { up: false, ready: false, detail: "Not running" }));
  await openLibrary(page);
  await page.getByRole("button", { name: "Guided tour: Brahe Bank assistant" }).click();
  const card = page.getByRole("dialog");
  await expect(card).toContainText("Step 1 of 3");
  await page.keyboard.press("ArrowRight");
  await expect(card).toHaveAttribute("data-guide-step", "offline");
  await expect(card).toContainText("Brahe Bank is offline");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Architecture" })).toHaveAttribute("aria-selected", "true");
});

test("leaving the demo mid-tour offers to resume where you were", async ({ page }) => {
  await mockStudio(page);
  await openLibrary(page);
  await page.getByRole("button", { name: "Guided tour: KYC processing" }).click();
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
  await expect(page.locator(".case-guide-resume")).toHaveCount(0);
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
