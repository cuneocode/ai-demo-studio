import { expect, test } from "@playwright/test";
import { mockStudio, openLibrary } from "./guide-helpers";

test("the card is a labelled dialog, announces each step, and starts with focus on its title", async ({ page }) => {
  await mockStudio(page);
  await openLibrary(page);
  await page.getByRole("button", { name: "Guided tour: Card fraud triage" }).click();
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  await expect(card).toHaveAttribute("aria-modal", "false");
  await expect(card).toHaveAccessibleName(/Fraud you can explain|.+/);
  const title = card.locator("h2");
  await expect(card).toHaveAccessibleName((await title.textContent())!);
  await expect(card).toHaveAccessibleDescription(/\w+/);
  await expect(title).toBeFocused();
  await expect(page.locator(".guide-sr")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator(".guide-sr")).toContainText(/^Step 1 of \d+\. /);
  for (const name of ["Exit guided tour", "Tour options", "Back", "Next"]) await expect(card.getByRole("button", { name })).toBeVisible();

  const target = page.locator("[data-guide-active='true']").first();
  await expect(target).toHaveAttribute("aria-describedby", /guide-card-body/);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".guide-sr")).toContainText(/^Step 2 of \d+\. /);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-guide-active]")).toHaveCount(0);
  await expect(page.locator("[aria-describedby*='guide-card-body']")).toHaveCount(0);
});

test("Tab stays within the card and the highlighted targets", async ({ page }) => {
  await mockStudio(page);
  await page.goto("/?guide=brahe-bank&step=banking.ask");
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-ready", "true");
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && (active.closest(".guide-card") || active.closest("[data-guide-active='true']")));
    });
    expect(inside, `Tab ${index + 1} left the card and its targets`).toBe(true);
  }
});

test("the act step's control can be reached and used by keyboard", async ({ page }) => {
  await mockStudio(page);
  await page.goto("/?guide=brahe-bank&step=banking.ask");
  const card = page.getByRole("dialog");
  const replay = card.getByRole("button", { name: "Replay the recorded question" });
  await expect(replay).toBeVisible();
  await replay.focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("data-guide-step", "banking.answer", { timeout: 30_000 });
  await expect(card.locator(".guide-source")).toHaveText(/^Recorded run · /);
});

test("reduced motion drops the spotlight animation", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await mockStudio(page);
  await page.goto("/?guide=kyc-processing");
  await expect(page.locator(".guide-layer")).toHaveClass(/reduce/);
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-ready", "true");
  const transition = await page.locator(".guide-ring").first().evaluate((ring) => getComputedStyle(ring).transitionDuration);
  expect(transition.split(",").every((value) => parseFloat(value) === 0)).toBe(true);
  await context.close();
});

test("illustrative and recorded labels have text, not only colour, in both themes", async ({ page }) => {
  for (const theme of ["dark", "light"]) {
    await page.addInitScript((value) => localStorage.setItem("fsi-studio.theme", value), theme);
    await mockStudio(page);
    await page.goto("/?guide=kyc-processing");
    const card = page.getByRole("dialog");
    await expect(card.locator(".guide-label")).toHaveText("Illustrative prototype · no live service");
    await page.goto("/?guide=company-briefing&step=briefing.architecture");
    const fit = page.getByRole("dialog").locator(".guide-fit b");
    await expect(fit).toHaveText("Proposed");
    await expect(fit).toHaveAttribute("title", /not running in this studio/);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("forced colors draw the highlight as a system outline", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await mockStudio(page);
  await page.goto("/?guide=kyc-processing");
  await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-ready", "true");
  const outline = await page.locator(".guide-ring").first().evaluate((ring) => getComputedStyle(ring).outlineStyle);
  expect(outline).toBe("solid");
});
