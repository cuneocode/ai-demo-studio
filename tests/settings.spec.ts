import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { MODEL_USE_CASES, type ModelRegistry } from "../app/studio-models.ts";
import { SETTING_FIELDS, readiness, type SettingState } from "../app/studio-settings.ts";

/** The committed defaults, without their env section, as the studio serves them when nothing is saved. */
function committedRegistry(): ModelRegistry {
  const registry = JSON.parse(readFileSync("config/studio-models.default.json", "utf8"));
  delete registry.env;
  return registry;
}

/** Every studio API is mocked so the spec never rewrites .env or restarts services. */
async function mockStudio(page: Page) {
  const state = {
    registry: committedRegistry(), saved: false,
    puts: [] as ModelRegistry[], checks: [] as unknown[], settingPuts: [] as { set?: Record<string, string>; clear?: string[] }[],
    settingChecks: [] as unknown[], serviceActions: [] as unknown[],
    values: { GALILEO_CONSOLE_URL: "https://console.multitenant.galileocloud.io", GALILEO_PROJECT: "demo", AIDEFENSE_API_KEY: "k".repeat(40), OPENAI_API_KEY: "o".repeat(40) } as Record<string, string>,
  };
  const settings = () => Object.fromEntries(Object.values(SETTING_FIELDS).map((field): [string, SettingState] => {
    const value = state.values[field.name] ?? "";
    return [field.name, field.secret ? { set: Boolean(value) } : { set: Boolean(value), value }];
  }));
  const settingsSnapshot = () => ({
    file: ".env", settings: settings(),
    readiness: readiness(settings(), () => ({ label: "OpenAI API (.env)", ok: Boolean(state.values.OPENAI_API_KEY), detail: "OPENAI_API_KEY (Model backends)" })),
  });
  const modelSnapshot = () => ({ saved: state.saved, problem: null, file: ".studio/models.json", registry: state.registry, useCases: MODEL_USE_CASES,
    health: { openai: { up: true } }, routes: Object.fromEntries(MODEL_USE_CASES.map(item => [item.id, { active: "openai" }])),
    keys: { OPENAI_API_KEY: true, VLLM_API_KEY: false, NIM_API_KEY: false, NVIDIA_API_KEY: false } });
  const services = () => ({
    services: [
      { id: "banking", label: "Brahe Bank", port: 8011, up: true, managed: true, installed: true, install: "npm run banking:install", pending: state.settingPuts.length ? ["GALILEO_API_KEY"] : [] },
      { id: "fraud", label: "Fraud scoring", port: 8012, up: true, managed: false, installed: true, install: "npm run fraud:install", pending: null },
    ],
    interbank: { id: "interbank", label: "Interbank lab (Docker)", port: 8088, up: false, pending: null, job: { state: "idle", log: [] } },
  });

  await page.route("**/api/studio/models", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      state.registry = request.postDataJSON();
      state.saved = true;
      state.puts.push(state.registry);
    } else if (request.method() === "POST") {
      state.checks.push(request.postDataJSON());
      return route.fulfill({ json: { ok: false, detail: "Nothing is listening at that address." } });
    }
    return route.fulfill({ json: modelSnapshot() });
  });
  await page.route("**/api/studio/settings", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      const body = request.postDataJSON();
      state.settingPuts.push(body);
      Object.assign(state.values, body.set ?? {});
      for (const name of body.clear ?? []) delete state.values[name];
    }
    return route.fulfill({ json: settingsSnapshot() });
  });
  await page.route("**/api/studio/settings/check", async (route) => {
    state.settingChecks.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, detail: "Key accepted by api.multitenant.galileocloud.io." } });
  });
  await page.route("**/api/studio/services", async (route) => {
    if (route.request().method() === "POST") state.serviceActions.push(route.request().postDataJSON());
    return route.fulfill({ json: services() });
  });
  return state;
}

async function openSettings(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".side-nav").getByRole("button", { name: "Studio settings" }).click();
  await expect(page.getByRole("heading", { name: "Studio settings", level: 1 })).toBeVisible();
}

const section = (page: Page, name: string) => page.locator("section", { has: page.getByRole("heading", { name, level: 2 }) });

test("studio settings saves Splunk credentials write-only and applies them by restarting services", async ({ page }) => {
  const state = await mockStudio(page);
  await openSettings(page);

  await expect(page.getByRole("article", { name: "Brahe Bank assistant readiness" })).toContainText("Needs API key (Splunk Agent Observability)");
  await expect(page.getByRole("article", { name: "Interbank settlement investigation readiness" })).toContainText("Needs API key (Splunk Agent Observability)");

  const splunk = section(page, "Splunk Agent Observability");
  await expect(splunk.getByText("Not set").first()).toBeVisible();
  await splunk.getByLabel("Agent Control URL").fill("http://agent-control.example");
  await expect(splunk.getByRole("alert")).toContainText("must use https");
  await expect(splunk.getByRole("button", { name: "Save" })).toBeDisabled();
  await splunk.getByRole("button", { name: "Revert" }).click();

  await splunk.getByLabel("API key").fill("galileo-test-key-1234567890");
  await splunk.getByLabel("Log stream (Brahe Bank, wealth)").fill("studio");
  await splunk.getByRole("button", { name: "Test" }).click();
  await expect(splunk.getByRole("status")).toHaveText("Key accepted by api.multitenant.galileocloud.io.");
  expect(state.settingChecks).toEqual([{ target: "splunk-ao", values: { GALILEO_API_KEY: "galileo-test-key-1234567890", GALILEO_LOG_STREAM: "studio" } }]);

  await splunk.getByRole("button", { name: "Save" }).click();
  await expect(splunk.getByLabel("API key", { exact: false }).and(splunk.locator("input"))).toHaveValue("");
  await expect(splunk.locator("em.ok")).toHaveText("Set");
  expect(state.settingPuts).toEqual([{ set: { GALILEO_API_KEY: "galileo-test-key-1234567890", GALILEO_LOG_STREAM: "studio" }, clear: [] }]);
  await expect(page.getByRole("article", { name: "Brahe Bank assistant readiness" })).not.toContainText("Needs");
  await expect(page.getByText("galileo-test-key-1234567890")).toHaveCount(0);

  const servicesPanel = section(page, "Services");
  await expect(servicesPanel.getByRole("row", { name: /Brahe Bank/ })).toContainText("1 change to apply");
  await expect(servicesPanel.getByRole("row", { name: /Fraud scoring/ })).toContainText("Running outside the studio");
  await servicesPanel.getByRole("button", { name: "Apply 1 change" }).click();
  await expect.poll(() => state.serviceActions).toEqual([{ action: "apply" }]);
});

test("studio settings clears a saved AI Defense key and changes a mode", async ({ page }) => {
  const state = await mockStudio(page);
  await openSettings(page);
  const defense = section(page, "Cisco AI Defense");
  await expect(defense.locator("em.ok")).toHaveText("Set");
  await defense.getByRole("button", { name: "Clear API key" }).click();
  await expect(defense.locator("em.warn")).toHaveText("Will be cleared");
  await defense.getByLabel("Company briefing").selectOption("monitor");
  await defense.getByRole("button", { name: "Save" }).click();
  await expect(defense.locator("em.warn")).toHaveText("Not set");
  expect(state.settingPuts).toEqual([{ set: { BRIEFING_AIDEFENSE_MODE: "monitor" }, clear: ["AIDEFENSE_API_KEY"] }]);
  await expect(page.getByRole("article", { name: "Company briefing readiness" })).toContainText("Needs API key (Cisco AI Defense)");
});

test("model backends saves an ordered default chain and per-use-case overrides without key values", async ({ page }) => {
  const state = await mockStudio(page);
  await openSettings(page);
  const models = section(page, "Model backends");
  await expect(models.locator(".st-banner").first()).toContainText("Nothing saved yet");
  const table = page.getByRole("table", { name: "Use case overrides" });
  await expect(table.getByRole("row")).toHaveCount(MODEL_USE_CASES.length + 1);

  const chain = models.getByRole("list", { name: "Default chain" });
  await expect(chain.getByRole("listitem")).toHaveText([/Sparky vLLM/, /OpenAI API/]);
  await chain.getByRole("button", { name: "Move OpenAI API up in Default chain" }).click();
  await expect(chain.getByRole("listitem")).toHaveText([/OpenAI API/, /Sparky vLLM/]);

  const interbank = table.getByRole("row", { name: "Interbank settlement investigation" });
  await interbank.getByRole("button", { name: "Customize" }).click();
  await interbank.getByRole("button", { name: "Remove OpenAI API from Interbank settlement investigation chain" }).click();
  await page.getByLabel("Market research hosted models").selectOption("deny");
  const advisoryPolicies = await page.getByLabel("Advisor meeting prep hosted models").locator("option").allTextContents();
  expect(advisoryPolicies).not.toContain("Hosted models allowed");

  await models.getByRole("button", { name: "Save models" }).click();
  await expect(models.locator(".st-banner")).toHaveCount(0);

  expect(state.puts).toHaveLength(1);
  const saved = state.puts[0];
  expect(saved.version).toBe(2);
  expect(saved.chain).toEqual(["openai", "sparky-vllm"]);
  expect(saved.useCases["interbank-a2a"]?.chain).toEqual(["sparky-vllm"]);
  expect(saved.useCases["market-research"]?.externalPolicy).toBe("deny");
  expect(saved.useCases["client-advisory"]?.externalPolicy).toBe("require_ai_defense");
  expect(JSON.stringify(saved)).not.toMatch(/sk-|Bearer/);
  expect(saved.providers.openai.apiKeyEnv).toBe("OPENAI_API_KEY");

  const vllm = page.getByRole("article", { name: "Sparky vLLM" });
  await vllm.getByRole("button", { name: "Test connection" }).click();
  await expect(vllm.getByRole("status")).toHaveText("Nothing is listening at that address.");
  expect(state.checks).toHaveLength(1);
});

test("a provider key is saved to .env from its card and an invalid provider blocks saving", async ({ page }) => {
  const state = await mockStudio(page);
  await openSettings(page);
  const models = section(page, "Model backends");
  const vllm = page.getByRole("article", { name: "Sparky vLLM" });
  await vllm.getByLabel("Key variable").selectOption("VLLM_API_KEY");
  await expect(vllm.locator(".st-key")).toContainText("Not set");
  await vllm.getByLabel("Paste VLLM_API_KEY").fill("vllm-secret-value-123");
  await vllm.getByRole("button", { name: "Save key" }).click();
  await expect(vllm.locator(".st-key")).toContainText("Set");
  expect(state.settingPuts).toEqual([{ set: { VLLM_API_KEY: "vllm-secret-value-123" } }]);

  const openai = page.getByRole("article", { name: "OpenAI API" });
  await openai.getByLabel("Base URL").fill("https://user:secret@api.openai.com/v1");
  await expect(models.getByRole("alert")).toContainText("Remove credentials from the URL");
  await expect(models.getByRole("button", { name: "Save models" })).toBeDisabled();
  await models.getByRole("button", { name: "Revert" }).click();
  await expect(models.getByRole("alert")).toHaveCount(0);
  expect(state.puts).toHaveLength(0);
});

test("the header inference indicator opens model settings", async ({ page }) => {
  await mockStudio(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).click();
  const chip = page.locator(".topbar .inference-indicator");
  await expect(chip).toHaveText("Cloud model");
  await chip.click();
  await expect(page.getByRole("heading", { name: "Studio settings", level: 1 })).toBeVisible();
});
