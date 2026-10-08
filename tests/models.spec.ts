import { expect, test, type Page } from "@playwright/test";
import { MODEL_USE_CASES, defaultRegistry, type ModelRegistry } from "../app/studio-models.ts";

/** The registry API is mocked so the spec never rewrites the studio's saved choices. */
async function mockRegistry(page: Page) {
  const state = { registry: defaultRegistry("gpt-5.6-luna"), saved: false, puts: [] as ModelRegistry[], checks: [] as unknown[] };
  const snapshot = () => ({ saved: state.saved, problem: null, file: ".studio/models.json", registry: state.registry, useCases: MODEL_USE_CASES,
    keys: { OPENAI_API_KEY: true, VLLM_API_KEY: false, NIM_API_KEY: false, NVIDIA_API_KEY: false } });
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
    return route.fulfill({ json: snapshot() });
  });
  return state;
}

async function openModels(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".side-nav").getByRole("button", { name: "Model backends" }).click();
  await expect(page.getByRole("heading", { name: "Model backends", level: 1 })).toBeVisible();
}

test("model backends saves a global default and per-use-case overrides without key values", async ({ page }) => {
  const state = await mockRegistry(page);
  await openModels(page);
  await expect(page.locator(".mb-banner").first()).toContainText("Nothing saved yet");
  await expect(page.getByRole("table", { name: "Use case overrides" }).getByRole("row")).toHaveCount(MODEL_USE_CASES.length + 1);

  await page.getByRole("radio", { name: /Sparky vLLM/ }).click();
  await page.getByLabel("Interbank settlement investigation backend").selectOption("openai");
  await expect(page.locator(".mb-banner").first()).toContainText("Nothing saved yet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".mb-banner")).toHaveCount(0);

  expect(state.puts).toHaveLength(1);
  const saved = state.puts[0];
  expect(saved.default).toBe("sparky-vllm");
  expect(saved.useCases).toEqual({ "interbank-a2a": "openai" });
  expect(JSON.stringify(saved)).not.toMatch(/sk-|Bearer/);
  expect(saved.providers.openai.apiKeyEnv).toBe("OPENAI_API_KEY");

  const vllm = page.getByRole("article", { name: "Sparky vLLM" });
  await expect(vllm).toContainText("Not set in .env");
  await vllm.getByRole("button", { name: "Test connection" }).click();
  await expect(vllm.getByRole("status")).toHaveText("Nothing is listening at that address.");
  expect(state.checks).toHaveLength(1);
});

test("model backends blocks saving an invalid provider and the use case chip opens the page", async ({ page }) => {
  const state = await mockRegistry(page);
  await openModels(page);
  const openai = page.getByRole("article", { name: "OpenAI API" });
  await openai.getByLabel("Base URL").fill("https://user:secret@api.openai.com/v1");
  await expect(page.getByRole("alert")).toContainText("Remove credentials from the URL");
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.getByRole("button", { name: "Revert" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.puts).toHaveLength(0);

  await page.getByLabel("Brahe Bank assistant backend").selectOption("sparky-vllm");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".mb-banner")).toHaveCount(0);
  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).click();
  const chip = page.locator(".mb-chip");
  await expect(chip).toHaveText(/Model · Sparky vLLM/);
  await chip.click();
  await expect(page.getByRole("heading", { name: "Model backends", level: 1 })).toBeVisible();
});
