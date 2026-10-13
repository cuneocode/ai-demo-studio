import { expect, test } from "@playwright/test";
import { STATUS_LIVE, mockStudio, openLibrary, setTheme, walk } from "./guide-helpers";

test.describe.configure({ mode: "parallel" });

for (const layout of [{ width: 1440, theme: "dark" }, { width: 1100, theme: "light" }] as const) {
  test(`the guided story follows Chuck across four demos and hands off at Escalate to SAR (${layout.width} ${layout.theme})`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: layout.width, height: 900 });
    await setTheme(page, layout.theme);
    const paid = await mockStudio(page);
    await openLibrary(page);
    await page.locator(".side-nav").getByRole("button", { name: /Story builder/ }).click();
    await page.getByRole("button", { name: "Guided story" }).click();
    const card = page.getByRole("dialog");
    await expect(card).toHaveAttribute("data-guide-step", "kyc.label");
    await expect(card.locator(".guide-kicker")).toContainText("Moment 1 of 4 · KYC");
    await expect(page.getByRole("heading", { name: "KYC processing", level: 1 })).toBeVisible();

    const seen = await walk(page, { act: true, maxSteps: 60 });
    const ids = seen.map((step) => step.step);

    expect(ids).toContain("lifecycle.escalate");
    expect(ids).toContain("lifecycle.subject");
    expect(ids.indexOf("lifecycle.subject")).toBeLessThan(ids.indexOf("sar.problem"));
    expect(ids).toContain("sar.problem");
    expect(ids.indexOf("sar.problem")).toBeGreaterThan(ids.indexOf("lifecycle.escalate"));
    expect(ids).toContain("advisory.household");
    const recap = seen.find((step) => step.step === "lifecycle.recap");
    expect(recap?.fits).toEqual([
      "Cisco AI Defense=running", "Splunk Agent Control=running", "Splunk Agent Observability=running", "Cisco AI infrastructure=proposed",
    ]);
    expect(seen.some((step) => step.step.startsWith("fraud.") && /^Recorded run · Oct 12, 2026/.test(step.source))).toBe(true);
    expect(seen.some((step) => step.step.startsWith("advisory.") && step.source === "Sample data · no model call")).toBe(true);
    expect(paid).toEqual([]);
  });
}

test("the story's recap marks fits from live status when controls are off", async ({ page }) => {
  const status = {
    ...STATUS_LIVE,
    services: STATUS_LIVE.services.map((service) => ({ ...service, aiDefense: { status: "disabled", mode: "off" }, agentControl: null, tracing: null })),
  };
  await mockStudio(page, status);
  await page.goto("/?guide=lifecycle&step=lifecycle.recap");
  const card = page.getByRole("dialog");
  await expect(card).toHaveAttribute("data-guide-ready", "true", { timeout: 60_000 });
  await expect(card.locator(".guide-fit")).toHaveCount(4);
  await expect(card.locator(".guide-fit").nth(0)).toHaveAttribute("data-cisco-status", "when-configured");
  await expect(card.locator(".guide-fit").nth(0)).toContainText("what it found is shown from the recordings");
  await expect(card.locator(".guide-fit").nth(1)).toHaveAttribute("data-cisco-status", "when-configured");
  await expect(card.locator(".guide-fit").nth(3)).toHaveAttribute("data-cisco-status", "proposed");
});
