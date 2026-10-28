import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const RECORDED = JSON.parse(readFileSync(resolve("services/banking/data/recorded/scripted-prompts.json"), "utf8"));

const STATUS = {
  checkedAt: "2026-10-12T12:00:00.000Z",
  services: [],
  interbank: { up: true, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
  models: [],
  links: { agentObservability: null, splunkObservability: null },
  readiness: [],
};

const SERVED = { provider: "openai", label: "OpenAI API", model: "gpt-test", kind: "openai", private: false, external: true, fallback: true, reason: "Sparky vLLM unreachable" };
const HEALTH = {
  ready: true, model: "gpt-test", retrieval: "Local document search", galileo: "configured",
  security: { status: "configured", mode: "enforce", fail_open: false }, splunk: { status: "missing_configuration" },
  controls: { status: "enforcing", names: ["Banking scope", "Evidence grounding", "No approval claims"], judge_model: "gpt-test", execution: "server", fail_open: false },
};

function answer(splunk: Record<string, unknown>) {
  return {
    session_id: "s-1", answer: "Orbit Basic has no annual fee ($0).",
    sources: [{ title: "orbit-credit-card-faq.md", text: "No. Orbit Basic has no annual fee, ever." }],
    trace: [{ name: "transfer_to_credit-card-agent", kind: "handoff" }, { name: "pinecone_retrieval", kind: "tool" }],
    security: { mode: "enforce", status: "allowed", checks: 6, blocked: 0, errors: 0, event_ids: [] },
    controls: { status: "allowed", checks: [{ status: "allowed", control_id: 599, name: "Banking scope", execution_id: "x-1" }], judge_model: "gpt-test" },
    telemetry: { galileo: "recorded", splunk },
    usage: { llm_calls: 3, input_tokens: 900, output_tokens: 40 }, served_by: SERVED, duration_ms: 900,
  };
}

async function openBank(page: Page, health: Record<string, unknown> = HEALTH) {
  await page.route(/\/api\/studio\/status(?:\?.*)?$/, (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/banking/health", (route) => route.fulfill({ json: health }));
  await page.route("**/api/banking/observability", (route) => route.fulfill({ json: {
    tracing: { status: "traces_present", transport: "Galileo SDK", stream: "brahe" },
    evaluators: { status: "none_configured", names: [], results: "not_verified" }, controls: HEALTH.controls,
  } }));
  await page.goto("/apps/fsi", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).first().click();
  await expect(page.getByLabel("Message Brahe Bank")).toBeVisible();
}

async function ask(page: Page, text: string) {
  await page.getByLabel("Message Brahe Bank").fill(text);
  await page.getByLabel("Message Brahe Bank").press("Enter");
}

test("the customer data is labelled fictional and the answer names the model that served it", async ({ page }) => {
  await page.route("**/api/banking/chat", (route) => route.fulfill({ json: answer({ status: "not_configured" }) }));
  await openBank(page);
  await expect(page.locator(".assistant-identity")).toContainText("Fictional bank · mock score 550");
  await ask(page, "Orbit annual fee?");
  const reply = page.locator(".chat-message.assistant").last();
  await expect(reply.locator("[data-provenance='live']")).toContainText("Answered by OpenAI API · gpt-test (hosted, fallback)");
  await expect(reply.locator(".sources summary")).toHaveText(["orbit-credit-card-faq.md"]);
});

test("a trace ID that was never exported is not shown, and an exported one is", async ({ page }) => {
  let exported = false;
  await page.route("**/api/banking/chat", (route) => route.fulfill({ json: answer(exported
    ? { status: "accepted_by_endpoint", trace_id: "4d18a1ebd87efb1d595341fe4f415da9", span_count: 9 }
    // An older service build still sent a local-only ID with export off.
    : { status: "not_configured", trace_id: "local-only-trace" }) }));
  await openBank(page);
  await ask(page, "Orbit annual fee?");
  const first = page.locator(".chat-message.assistant").last();
  await expect(first.locator(".splunk-meta")).toContainText("Additional OTLP export: not configured");
  await expect(first).not.toContainText("local-only-trace");
  await expect(first.getByRole("button", { name: "Copy" })).toHaveCount(0);

  exported = true;
  await ask(page, "And Celestial?");
  const second = page.locator(".chat-message.assistant").last();
  await expect(second.locator(".splunk-meta")).toContainText("Trace 4d18a1ebd87efb1d595341fe4f415da9");
});

test("an off-topic request is refused by Agent Control, by name", async ({ page }) => {
  await page.route("**/api/banking/chat", (route) => route.fulfill({ status: 422, json: {
    detail: "Agent Control blocked this response: Banking scope. Ask about Brahe products, mock scores, or illustrative eligibility.",
    security: { mode: "enforce", status: "allowed", checks: 1, blocked: 0, errors: 0, event_ids: [] },
    controls: { status: "blocked", checks: [{ status: "blocked", control_id: 599, name: "Banking scope", execution_id: "x-2" }], judge_model: "gpt-test" },
    session_reset: true, telemetry: { splunk: { status: "not_configured" }, galileo: "recorded" }, usage: { llm_calls: 0 }, served_by: SERVED,
  } }));
  await openBank(page);
  await expect(page.locator(".suggestion-grid")).toContainText("Expected: Agent Control block");
  await page.locator(".suggestion-grid button", { hasText: "Ask for a cake recipe" }).click();
  await expect(page.locator(".banking-error")).toContainText("Agent Control blocked this response: Banking scope");
  await expect(page.locator(".banking-error")).toContainText("Agent Controls: blocked");
});

test("with no model reachable the runtime card says so instead of naming one", async ({ page }) => {
  await openBank(page, { ...HEALTH, model: null });
  await expect(page.locator(".runtime-details")).toContainText("No model reachable");
});

test("a recorded turn replays with its date and the refusal's Cisco evidence, never as live", async ({ page }) => {
  await page.route("**/api/banking/recordings", (route) => route.fulfill({ json: { recordings: [{ name: "scripted-prompts", title: RECORDED.title, recorded_at: RECORDED.recorded_at, served_by: RECORDED.served_by, events: 0, synthetic: true }] } }));
  await page.route("**/api/banking/recordings/scripted-prompts", (route) => route.fulfill({ json: RECORDED }));
  let chats = 0;
  await page.route("**/api/banking/chat", (route) => { chats += 1; return route.fulfill({ status: 500, json: { detail: "not expected" } }); });
  await openBank(page);
  const demo = page.locator(".banking-demo");
  await expect(demo).toHaveAttribute("data-guide-source", "none");
  await demo.locator(".demo-fallback > summary").click();
  await page.locator("#banking-replay").selectOption("scripted-prompts:success");
  const reply = page.locator(".chat-message.assistant").last();
  await expect(reply.locator("[data-provenance='recorded']")).toContainText(/Recorded run · Oct \d+, 2026 · OpenAI API/);
  await expect(reply.locator("[data-provenance='live']")).toHaveCount(0);
  await expect(reply).toContainText("AI Defense (original run): allowed");
  await expect(demo).toHaveAttribute("data-guide-source", "recorded");
  const blocked = RECORDED.result.turns.find((turn: { id: string }) => turn.id === "ai-defense");
  await page.locator("#banking-replay").selectOption("scripted-prompts:ai-defense");
  const refusal = page.locator(".banking-error");
  await expect(refusal.locator("[data-provenance='recorded']")).toContainText("Recorded run");
  await expect(refusal).toContainText(`Cisco event: ${blocked.body.security.event_ids[0]}`);
  await expect(page.getByRole("region", { name: "Live run stats" }).locator("[data-provenance='recorded']").first()).toBeVisible();
  expect(chats).toBe(0);
});
