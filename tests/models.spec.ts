import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { MODEL_USE_CASES, type ModelRegistry } from "../app/studio-models.ts";

/** Sparky is down and the OpenAI API answers, as the chain reports it; nothing here calls a model. */
const SPARKY_DOWN = {
  "sparky-vllm": { up: false, detail: "Nothing is listening at 127.0.0.1:8003." },
  openai: { up: true, detail: "Answering" },
};

function committedRegistry(): ModelRegistry {
  const registry = JSON.parse(readFileSync("config/studio-models.default.json", "utf8"));
  delete registry.env;
  return registry;
}

async function mockModels(page: Page) {
  const registry = committedRegistry();
  const routes = Object.fromEntries(MODEL_USE_CASES.map((useCase) => [useCase.id, { chain: registry.chain, active: "openai", fallback: true }]));
  await page.route("**/api/studio/models", (route) => route.fulfill({
    json: { saved: true, problem: null, file: ".studio/models.json", registry, useCases: MODEL_USE_CASES, health: SPARKY_DOWN, routes,
      keys: { OPENAI_API_KEY: true, VLLM_API_KEY: false, NIM_API_KEY: false, NVIDIA_API_KEY: false } },
  }));
}

const FALLBACK = {
  provider: "openai", label: "OpenAI API", model: "gpt-4o-mini", kind: "openai", private: false, external: true,
  fallback: true, reason: "Sparky vLLM did not answer its health check", source: "saved",
};

test("settings shows the chain's health and which backend answers each use case now", async ({ page }) => {
  await mockModels(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".side-nav").getByRole("button", { name: "Studio settings" }).click();

  const chain = page.getByRole("list", { name: "Default chain" });
  await expect(chain.getByRole("listitem", { name: "1. Sparky vLLM" })).toContainText("Nothing is listening at 127.0.0.1:8003.");
  await expect(chain.getByRole("listitem", { name: "2. OpenAI API" })).toContainText("Answering");

  const table = page.getByRole("table", { name: "Use case overrides" });
  for (const useCase of MODEL_USE_CASES) {
    await expect(table.getByRole("row", { name: useCase.title })).toContainText("Answering now: OpenAI API (fallback)");
  }
});

test("the header indicates cloud inference without a model-chain warning", async ({ page }) => {
  await mockModels(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).click();
  const chip = page.locator(".topbar .inference-indicator");
  await expect(chip).toHaveText("Cloud model");
  await expect(chip).toHaveAttribute("title", /OpenAI API/);
});

test("a banking answer and the stats row both say which model answered", async ({ page }) => {
  await mockModels(page);
  await page.route("**/api/banking/chat", (route) => route.fulfill({
    json: { answer: "Card replacement takes five business days.", session_id: "s-1", sources: [], trace: [], duration_ms: 812,
      usage: { llm_calls: 2, input_tokens: 900, output_tokens: 120 }, served_by: FALLBACK },
  }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".side-nav").getByRole("button", { name: "Use case library" }).click();
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).click();
  await page.getByLabel("Message Brahe Bank").fill("How long does a replacement card take?");
  await page.getByLabel("Message Brahe Bank").press("Enter");

  const text = "Answered by OpenAI API · gpt-4o-mini (hosted, fallback)";
  const answer = page.locator(".chat-message.assistant").last();
  await expect(answer.locator(".rt-badge")).toHaveText(text);
  await expect(answer.locator(".rt-badge")).toHaveAttribute("title", "Fell back: Sparky vLLM did not answer its health check");
  await expect(page.locator(".run-stats-model").first()).toHaveText(text);
});
