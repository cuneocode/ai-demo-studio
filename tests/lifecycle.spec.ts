import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/*
 * The client lifecycle story against the running studio: card fraud triage (the real service, scripted so no model
 * is called) escalates Chuck Robbins's case, the SAR inbox receives the referral, and advisor meeting prep sees only
 * what Chuck already knows: his card was compromised and reissued. Nothing about the SAR reaches the advisor.
 */

const TIPPING_OFF = /\bSARs?\b|suspicious activity|escalat|investigat|referral|FinCEN|money mule/i;
const ADVISORY_RECORDING = JSON.parse(readFileSync(join(process.cwd(), "services/wealth/data/recorded/advisory-chuck-robbins.json"), "utf8"));

async function freshStudio(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("fsi-studio.handoffs"));
  await page.reload({ waitUntil: "networkidle" });
}

async function openFromLibrary(page: Page, title: string) {
  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  await page.getByRole("button", { name: `Open ${title} experience` }).first().click();
}

test("fraud escalation reaches the SAR inbox, and meeting prep sees only the reissued card", async ({ page }) => {
  test.setTimeout(150_000);
  await page.route((url) => url.pathname === "/api/fraud/runs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as { input?: Record<string, unknown> };
    await route.continue({ postData: JSON.stringify({ ...body, input: { ...body.input, mode: "scripted" } }) });
  });
  const briefs: Record<string, unknown>[] = [];
  await page.route("**/api/wealth/advisory/brief", async (route) => {
    briefs.push(route.request().postDataJSON());
    await route.fulfill({ json: ADVISORY_RECORDING.result });
  });

  await freshStudio(page);
  await openFromLibrary(page, "Card fraud triage");
  const fraud = page.locator("#case-panel-demo");
  await expect(fraud.locator(".fx-presenter-hint")).toHaveCount(0);
  await fraud.getByRole("region", { name: "Scenarios" }).getByRole("button", { name: /Compromised merchant/ }).click();
  await fraud.locator("#triage-queue").click();
  const decision = fraud.getByRole("group", { name: "Analyst disposition" });
  await expect(decision.locator('[data-action="escalate"]')).toBeEnabled({ timeout: 90_000 });
  await decision.locator('[data-action="escalate"]').click();

  await expect(fraud.locator(".fx-handoff")).toContainText("SAR referral drafted", { timeout: 30_000 });
  await expect(fraud.locator(".fx-audit")).toContainText("Block and reissue");
  await expect(fraud.getByTestId("fraud-service-event")).toContainText("Card ending 1188 compromised and reissued");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("fsi-studio.handoffs") ?? "[]"));
  const service = stored.find((item: { kind: string }) => item.kind === "service-event");
  expect(service).toMatchObject({ customerId: "chuck-robbins", cardLast4: "1188", provenance: "live" });
  expect(JSON.stringify(service)).not.toMatch(TIPPING_OFF);

  await fraud.locator("#escalate-to-sar").click();
  const inbox = page.locator("#sar-experience .sar-inbox");
  await expect(inbox.getByRole("heading", { name: "Escalated from card fraud triage" })).toBeVisible();
  await expect(inbox).toContainText("Fraud case cpp-orbit");
  const referral = (await page.evaluate(() => JSON.parse(localStorage.getItem("fsi-studio.handoffs") ?? "[]")))
    .find((item: { kind: string }) => item.kind === "fraud-case");
  expect(referral).toMatchObject({ customerId: "chuck-robbins", caseId: "cpp-orbit", disposition: "escalate" });

  await openFromLibrary(page, "Advisor meeting prep");
  const context = page.getByRole("region", { name: "Meeting context" });
  await expect(context).toContainText("Recent service event · Card ending 1188 compromised and reissued");
  await expect(context).toContainText("From Card fraud triage · this session");
  await expect(context).not.toContainText(TIPPING_OFF);

  await page.locator("#advisory-run").click();
  await expect.poll(() => briefs.length).toBe(1);
  const sent = briefs[0].service_events as Record<string, unknown>[];
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ kind: "service-event", customerId: "chuck-robbins", actions: ["block_and_reissue", "contact_customer"] });
  expect(JSON.stringify(briefs[0])).not.toMatch(TIPPING_OFF);
});

test("Present mode steps through KYC, fraud, SAR, and meeting prep with a three-act talk track", async ({ page }) => {
  await freshStudio(page);
  await page.locator(".side-nav").getByRole("button", { name: /Story builder/ }).click();
  await expect(page.locator(".outline-item strong")).toHaveText(["KYC processing", "Card fraud triage", "SAR investigation", "Advisor meeting prep"]);
  await page.getByRole("button", { name: "Present story" }).click();

  const bar = page.getByRole("region", { name: "Presenter controls" });
  const talk = bar.getByRole("list", { name: "Talk track" });
  const steps = [
    { title: "KYC processing", heading: "KYC processing", cue: "Meet Chuck Robbins" },
    { title: "Card fraud triage", heading: "Card fraud triage", cue: "Escalate to investigations" },
    { title: "SAR investigation", heading: "SAR investigation", cue: "Chuck is the hypothetical victim" },
    { title: "Advisor meeting prep", heading: "Advisor meeting prep", cue: "only the customer-visible card replacement" },
  ];
  for (const [index, step] of steps.entries()) {
    await expect(bar).toContainText(`MOMENT ${index + 1} OF 4`);
    await expect(bar.locator(".presenter-step strong")).toHaveText(step.title);
    await expect(page.getByRole("heading", { name: step.heading, level: 1 })).toBeVisible();
    await expect(talk.locator("b")).toHaveText(["Problem", "AI changes", "Cisco value", "In the story", "Right now"]);
    await expect(talk).toContainText(step.cue);
    if (step.title === "KYC processing") await expect(talk.locator("li").last()).toContainText("Illustrative prototype, no live service");
    else await expect(talk.locator("li").last()).not.toContainText("Illustrative prototype");
    if (step.title === "Card fraud triage") await expect(page.locator(".fx-presenter-hint")).toContainText("Escalate to SAR");
    if (step.title === "KYC processing") await expect(page.locator(".workbench-body h3")).toHaveText("Chuck Robbins (fictional demo profile)");
    if (index < steps.length - 1) await bar.getByRole("button", { name: "Next" }).click();
  }
  await bar.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Build a demo story", level: 1 })).toBeVisible();
});
