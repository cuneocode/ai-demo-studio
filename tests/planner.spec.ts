import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { mockStudio } from "./guide-helpers";
import { mockPlanner } from "./planner-fixture";
import type { PlannerElement, PlannerInitialization } from "../app/planner-integration";

async function openCase(page: Page, title = "SAR investigation") {
  await page.getByRole("button", { name: `Open ${title} experience` }).first().click();
}
async function openPlanner(page: Page) {
  await page.getByRole("tab", { name: "Capacity planning", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Capacity planning sections" }).getByRole("button", { name: "Requirements", exact: true })).toBeEnabled();
  return page.locator("ai-infrastructure-planner");
}
async function replaySar(page: Page) {
  await page.getByRole("button", { name: /Structuring · cash under the CTR threshold/ }).click();
  await page.getByText("Fallback: recorded demo", { exact: true }).click();
  await page.getByRole("button", { name: "Replay recording", exact: true }).click();
  await page.getByRole("button", { name: "Skip replay", exact: true }).click();
  await expect(page.getByRole("region", { name: "Live run stats" }).locator(".run-stats-status")).toHaveText("Completed");
}
const seedOf = (page: Page) => page.locator("ai-infrastructure-planner").evaluate(element => (element as PlannerElement & { seed: PlannerInitialization }).seed);

test("native planner initializes once, follows theme, navigates and restores isolated drafts", async ({ page }) => {
  await mockStudio(page);
  await mockPlanner(page);
  await page.goto("/");
  await openCase(page);
  const planner = await openPlanner(page);
  const seed = await seedOf(page);
  expect(seed.assessment.name).toBe("SAR investigation");
  expect(seed.workloads[0].modelId).toBe("zai-org/GLM-5.3");
  expect(seed.workloads[0].measurements).toBeUndefined();
  expect(await planner.evaluate(element => (element as PlannerElement & { configuration: object }).configuration)).toMatchObject({
    analytics: { enabled: false, endpoint: "https://planner.example.test/api/business-events" },
    initialSection: "/genai-sizing", showNavigation: false,
  });
  await expect(planner).toHaveAttribute("data-initializations", "1");
  await expect(page.locator(".capacity-planning iframe")).toHaveCount(0);
  const before = await planner.getAttribute("theme");
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  await expect(planner).toHaveAttribute("theme", before === "light" ? "dark" : "light");
  const url = page.url();
  await page.getByRole("button", { name: "Costs / TCO", exact: true }).click();
  await expect(planner.getByRole("heading", { name: "/tco-calculator", exact: true })).toBeVisible();
  expect(page.url()).toBe(url);
  await page.getByRole("button", { name: "Requirements", exact: true }).click();
  await planner.getByLabel("Assessment name").fill("Saved SAR plan");
  await page.getByRole("tab", { name: "Architecture", exact: true }).click();
  await openPlanner(page);
  await expect(planner.getByLabel("Assessment name")).toHaveValue("Saved SAR plan");
  await expect(planner).toHaveAttribute("data-initializations", "1");
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await openCase(page, "KYC processing");
  await openPlanner(page);
  const other = await seedOf(page);
  expect(other.assessmentId).not.toBe(seed.assessmentId);
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await openCase(page);
  await openPlanner(page);
  expect((await seedOf(page)).assessmentId).toBe(seed.assessmentId);
  await expect(planner.getByLabel("Assessment name")).toHaveValue("Saved SAR plan");
  await page.getByRole("button", { name: "New assessment", exact: true }).click();
  await expect(planner.getByLabel("Assessment name")).toHaveValue("SAR investigation");
  expect((await seedOf(page)).assessmentId).not.toBe(seed.assessmentId);
});

test("completed recorded usage reaches initialization without production assumptions", async ({ page }) => {
  await mockStudio(page);
  await mockPlanner(page);
  await page.goto("/");
  await openCase(page);
  await replaySar(page);
  await openPlanner(page);
  const { result } = JSON.parse(readFileSync("services/sar/data/recorded/structuring-harbor.json", "utf8"));
  const workload = (await seedOf(page)).workloads[0];
  expect(workload).toMatchObject({
    modelId: "zai-org/GLM-5.3",
    measurements: { modelCalls: result.usage.llm_calls, inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens },
    provenance: { kind: "reported", system: "Studio recorded run" },
  });
  expect(workload).not.toHaveProperty("productionDemand");
});

test("unconfigured connection and planner errors recover without replacing the draft ID", async ({ page }) => {
  await mockStudio(page);
  await mockPlanner(page);
  let configured = false;
  await page.route("**/api/studio/planner**", route => configured ? route.fallback() : route.fulfill({ json: { configured: false } }));
  await page.goto("/");
  await openCase(page);
  await page.getByRole("tab", { name: "Capacity planning", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Configure the planner");
  configured = true;
  await page.getByRole("button", { name: "Retry connection" }).click();
  const planner = await openPlanner(page);
  const id = (await seedOf(page)).assessmentId;
  await planner.getByLabel("Assessment name").fill("Recoverable draft");
  await planner.evaluate(element => element.dispatchEvent(new CustomEvent("planner-error", { detail: { version: 1, code: "render_failed", message: "Fixture planner unavailable" } })));
  await expect(page.getByRole("alert")).toContainText("Fixture planner unavailable");
  await page.getByRole("button", { name: "Retry connection" }).click();
  await openPlanner(page);
  expect((await seedOf(page)).assessmentId).toBe(id);
  await expect(planner.getByLabel("Assessment name")).toHaveValue("Recoverable draft");
});

test("configured planner bundle accepts Studio evidence and restores real edits", async ({ page }) => {
  test.skip(process.env.STUDIO_PLANNER_LIVE !== "1", "Requires a configured planner bundle and API that allow Studio's origin.");
  await mockStudio(page);
  await page.addInitScript(() => localStorage.setItem("fsi-studio.theme", "dark"));
  const metrics: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/business-events")) metrics.push(request.url()); });
  await page.goto("/");
  await openCase(page);
  await replaySar(page);
  const planner = await openPlanner(page);
  await expect(planner.getByText("Current planning inputs", { exact: true })).toBeVisible();
  await planner.getByText("Demo observations", { exact: true }).click();
  await expect(planner).toContainText("34783");
  await expect(planner).toContainText("1284");
  await expect(planner).toContainText("Studio recorded run");
  await expect(planner).toContainText("Not supplied");
  await expect(planner.getByRole("textbox", { name: "Active Profile Name", exact: true })).toHaveValue("SAR investigation");
  const modelPicker = planner.getByRole("combobox", { name: "Select model", exact: true });
  await expect(modelPicker).toHaveAttribute("data-value", "zai-org/GLM-5.3");
  await expect(modelPicker).toBeEnabled({ timeout: 60_000 });
  await expect(planner.getByTestId("model-config-error")).toHaveCount(0);
  await expect(planner.getByRole("spinbutton", { name: "Peak active requests", exact: true })).toHaveValue("1000");
  await expect(planner.getByRole("spinbutton", { name: "Maximum input tokens", exact: true })).toHaveValue(String(Math.ceil(34783 / 9)));
  await expect(planner.getByRole("spinbutton", { name: "Maximum output tokens", exact: true })).toHaveValue(String(Math.ceil(1284 / 9)));
  await expect(planner.getByText("Sizing is paused until this profile is valid", { exact: true })).toHaveCount(0);
  await expect(planner.getByRole("button", { name: "Review proposed design", exact: true })).toBeEnabled({ timeout: 30_000 });
  await page.screenshot({ path: "artifacts/explorer/planner-native-dark.png" });
  const before = await planner.getAttribute("theme");
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  await expect(planner).toHaveAttribute("theme", before === "light" ? "dark" : "light");
  const evidenceText = planner.getByText("Model calls: 9 · Input tokens: 34783 · Output tokens: 1284", { exact: true });
  const contrast = () => evidenceText.evaluate(node => {
    const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (values: number[]) => values.map(value => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const foreground = luminance(rgb(getComputedStyle(node).color));
    const card = getComputedStyle(node.closest(".dashboard-card")!);
    const backgrounds = [...card.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(match => luminance(rgb(match[0])));
    if (!backgrounds.length) backgrounds.push(luminance(rgb(card.backgroundColor)));
    return Math.min(...backgrounds.map(background => (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)));
  });
  await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: "artifacts/explorer/planner-native-light.png" });
  const url = page.url();
  const navigation = page.getByRole("navigation", { name: "Capacity planning sections" });
  for (const [section, heading] of [
    ["Design / BOM", "BOM Builder"],
    ["Topology", "Environment topology"],
    ["Racks", "Rack layout"],
  ]) {
    await navigation.getByRole("button", { name: section, exact: true }).click();
    await expect(planner.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    expect(page.url()).toBe(url);
    if (section === "Design / BOM") await page.screenshot({ path: "artifacts/explorer/planner-native-bom.png" });
  }
  await page.getByRole("button", { name: "Costs / TCO", exact: true }).click();
  await expect(planner.getByRole("heading", { name: "Costs", exact: true })).toBeVisible();
  await expect(planner.getByRole("heading", { name: "On-Premises Total Cost", exact: true })).toBeVisible();
  await expect(planner.getByRole("heading", { name: "Cloud Total Cost", exact: true })).toBeVisible();
  await expect(planner.getByRole("heading", { name: "TCO unavailable", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "artifacts/explorer/planner-native-tco.png" });
  await navigation.getByRole("button", { name: "Review", exact: true }).click();
  await expect(planner.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  await expect(planner.getByRole("heading", { name: "Current deployment summary", exact: true })).toBeVisible();
  expect(page.url()).toBe(url);
  await page.getByRole("button", { name: "Requirements", exact: true }).click();
  await modelPicker.click();
  await planner.getByRole("option", { name: "meta-llama/Llama-3.2-1B", exact: true }).click();
  await expect(modelPicker).toHaveAttribute("data-value", "meta-llama/Llama-3.2-1B");
  await expect(modelPicker).toBeEnabled({ timeout: 60_000 });
  await expect(planner.getByTestId("model-config-error")).toHaveCount(0);
  // Use the public component API to open the assessment's existing metadata editor.
  await planner.evaluate(element => (element as PlannerElement).navigate("/"));
  await planner.getByLabel("Assessment name", { exact: true }).fill("Studio native integration check");
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await openCase(page);
  await openPlanner(page);
  await planner.evaluate(element => (element as PlannerElement).navigate("/"));
  await expect(planner.getByLabel("Assessment name", { exact: true })).toHaveValue("Studio native integration check");
  await page.getByRole("button", { name: "Requirements", exact: true }).click();
  await expect(planner.getByRole("textbox", { name: "Active Profile Name", exact: true })).toHaveValue("SAR investigation");
  await expect(modelPicker).toHaveAttribute("data-value", "meta-llama/Llama-3.2-1B");
  expect(metrics).toEqual([]);
});

test("older planner drafts receive generated names and current model defaults while retaining edits", async ({ page }) => {
  test.skip(process.env.STUDIO_PLANNER_LIVE !== "1", "Requires a configured planner bundle and API.");
  await mockStudio(page);
  await page.goto("/");
  await openCase(page, "Code vulnerability analysis");
  const planner = await openPlanner(page);
  await planner.getByRole("spinbutton", { name: "Maximum input tokens", exact: true }).fill("12000");
  await planner.getByRole("spinbutton", { name: "Maximum output tokens", exact: true }).fill("1800");
  const draftKey = () => page.evaluate(() => Object.keys(localStorage).find(key => key.startsWith("planner-embed:v1:demo-studio:code-vulnerability:") && key.endsWith(":plan")));
  await expect.poll(draftKey).toBeTruthy();
  const key = (await draftKey())!;
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  // Reproduce the old saved assessment from the browser comments in this isolated test context.
  await page.evaluate(storageKey => {
    const draft = JSON.parse(localStorage.getItem(storageKey)!);
    draft.integrationDefaultsRevision = 1;
    draft.integration.workloads[0].modelId = "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4";
    const profile = draft.genaiInputs.useCaseProfiles[0];
    profile.name = "Imported workload 1";
    Object.assign(profile.inputs, {
      modelType: "", useCustomModel: true, customModelId: draft.integration.workloads[0].modelId,
      avgConcurrentUsers: 10000, avgInputTokens: 12000, avgOutputTokens: 1800,
      operatingHoursPerYear: 4000, averageLoadPercent: 65,
    });
    Object.assign(draft.genaiInputs, profile.inputs);
    draft.genaiResults = null;
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }, key);
  await openCase(page, "Code vulnerability analysis");
  await openPlanner(page);
  const name = planner.getByRole("textbox", { name: "Active Profile Name", exact: true });
  const model = planner.getByRole("combobox", { name: "Select model", exact: true });
  await expect(name).toHaveValue("Code vulnerability analysis");
  await expect(model).toHaveAttribute("data-value", "zai-org/GLM-5.3");
  const summary = planner.getByRole("region", { name: "Code vulnerability analysis planning inputs", exact: true });
  await expect(summary).toContainText("zai-org/GLM-5.3");
  await expect(summary).toContainText("10,000");
  await expect(summary).toContainText("12,000");
  await expect(summary).toContainText("1,800");
  await expect(summary).toContainText("4,000");
  await expect(summary).toContainText("65%");
  await expect(model).toBeEnabled({ timeout: 60_000 });
  await expect(planner.getByRole("button", { name: "Review proposed design", exact: true })).toBeEnabled({ timeout: 30_000 });
  await page.screenshot({ path: "artifacts/explorer/planner-restored-defaults.png" });
  await name.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/explorer/planner-restored-name.png" });
  await name.fill("Payments security review");
  await expect(model).toBeEnabled({ timeout: 60_000 });
  await model.click();
  await planner.getByRole("option", { name: "meta-llama/Llama-3.2-1B", exact: true }).click();
  await expect(model).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: "Back to library", exact: true }).click();
  await openCase(page, "Code vulnerability analysis");
  await openPlanner(page);
  await expect(name).toHaveValue("Payments security review");
  await expect(model).toHaveAttribute("data-value", "meta-llama/Llama-3.2-1B");
  await expect(planner.getByRole("region", { name: "Payments security review planning inputs", exact: true })).toContainText("meta-llama/Llama-3.2-1B");
});
