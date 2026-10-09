import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const STATUS = {
  checkedAt: "2026-10-09T12:00:00.000Z",
  services: [],
  interbank: { up: true, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
  models: [],
  links: { agentObservability: null, splunkObservability: null },
  readiness: [],
};

const json = (path: string) => JSON.parse(readFileSync(resolve(path), "utf8"));
const RESEARCH = json("services/wealth/data/recorded/research-hcyn.json");
const ADVISORY = json("services/wealth/data/recorded/advisory-dana-whitfield.json");
const DANA = json("fixtures/households/dana-whitfield.json");
const OKAFOR = json("fixtures/households/okafor.json");
const PRIYA = json("fixtures/households/priya-raman.json");

const OPENAI_FALLBACK = {
  provider: "openai", label: "OpenAI API", model: "gpt-5.6-luna", kind: "openai", private: false, external: true,
  fallback: true, reason: "Sparky vLLM unreachable (connection refused)", source: "saved",
};
const HOSTED_MODEL = { status: "reachable", label: "OpenAI API", model: "gpt-5.6-luna", private: false, fallback: true, reason: "Sparky vLLM unreachable" };
const DOWN_MODEL = { status: "down", label: "No model reachable", private: true, fallback: false };

function health(model: object, hostedFallback = "allowed with AI Defense enforce") {
  return {
    ready: (model as { status: string }).status !== "down", nim: model, advisory_model: model, advisory_hosted_fallback: hostedFallback,
    fred: { status: "absent" }, security: { status: "disabled", mode: "off", fail_open: false }, galileo: "disabled",
  };
}

const card = (record: Record<string, unknown>) => ({
  id: record.id, name: record.name, headline: record.headline, age: record.age, risk_profile: record.risk_profile,
  total_value: record.total_value, scenario: record.scenario, order: record.order, synthetic: true,
});

/** Every /api/wealth call is mocked: nothing in this spec reaches the live service or a paid model. */
async function mockWealth(page: Page, routes: { health: object; analyze?: (route: Route) => unknown; brief?: (route: Route) => unknown }) {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/wealth/**", (route) => route.fulfill({ status: 404, json: { detail: "Not mocked" } }));
  await page.route("**/api/wealth/health", (route) => route.fulfill({ json: routes.health }));
  await page.route("**/api/wealth/recordings", (route) => route.fulfill({ json: { recordings: [] } }));
  await page.route("**/api/wealth/recordings/research-hcyn", (route) => route.fulfill({ json: RESEARCH }));
  await page.route("**/api/wealth/recordings/advisory-dana-whitfield", (route) => route.fulfill({ json: ADVISORY }));
  await page.route("**/api/wealth/households", (route) => route.fulfill({ json: { households: [DANA, OKAFOR, PRIYA].map(card), synthetic: true } }));
  await page.route("**/api/wealth/households/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const record = [DANA, OKAFOR, PRIYA].find((item) => item.id === id);
    return record ? route.fulfill({ json: record }) : route.fulfill({ status: 404, json: { detail: "Unknown household." } });
  });
  await page.route("**/api/wealth/runs/**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({ json: {
      run: { id, status: "completed", started_at: "2026-10-09T12:00:00Z", finished_at: "2026-10-09T12:00:02Z" },
      events: [{ id: "e1", at: "2026-10-09T12:00:00Z", run_id: id, component: "wealth", kind: "run", status: "started", title: "Mocked run" }],
      total: 1,
    } });
  });
  if (routes.analyze) await page.route("**/api/wealth/research/analyze", routes.analyze);
  if (routes.brief) await page.route("**/api/wealth/advisory/brief", routes.brief);
}

async function open(page: Page, title: RegExp) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: title }).first().click();
}

const RESEARCH_CASE = /^Open .*(market research|house.view|market event).* experience$/i;
const ADVISORY_CASE = /^Open .*(client advisory|meeting prep).* experience$/i;

function researchBody(note: Record<string, unknown>, servedBy: object | null = OPENAI_FALLBACK) {
  return { ...RESEARCH.result, note: { ...RESEARCH.result.note, ...note }, served_by: servedBy, usage: { llm_calls: note.status === "ready" ? 1 : 0 } };
}

test.describe("Market research", () => {
  test("Accept stays disabled with a reason until the note is ready, and the result heading takes focus", async ({ page }) => {
    let calls = 0;
    await mockWealth(page, {
      health: health(HOSTED_MODEL),
      analyze: (route) => {
        calls += 1;
        return route.fulfill({ json: calls === 1
          ? researchBody({ status: "unavailable", reason: "The model did not return a usable note.", summary: null, bullets: [], citations: [] }, null)
          : researchBody({ status: "ready" }) });
      },
    });
    await open(page, RESEARCH_CASE);
    await page.getByRole("button", { name: /^HCYN/ }).click();

    const heading = page.locator("#research-result-heading");
    await expect(heading).toHaveText("Halcyon Interconnect, Inc. (HCYN)");
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    const accept = page.locator("#accept-research-note");
    await expect(accept).toBeDisabled();
    await expect(accept).toHaveAttribute("aria-describedby", "accept-research-reason");
    await expect(page.locator("#accept-research-reason")).toContainText("The draft note is unavailable");
    await expect(page.getByText("Fictional · synthetic data").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Signal divergences/ })).toBeVisible();

    await page.getByRole("button", { name: "Refresh" }).last().click();
    await expect(accept).toBeEnabled();
    await expect(accept).not.toHaveAttribute("aria-describedby", /.+/);
    await expect(page.getByRole("list", { name: "Citations" }).getByRole("listitem")).toHaveCount(RESEARCH.result.note.citations.length);
  });

  test("The note's badge names the hosted fallback model that wrote it", async ({ page }) => {
    await mockWealth(page, { health: health(HOSTED_MODEL), analyze: (route) => route.fulfill({ json: researchBody({ status: "ready" }) }) });
    await open(page, RESEARCH_CASE);
    await page.getByRole("button", { name: /^HCYN/ }).click();
    await expect(page.locator('.research-review [data-provenance="live"]')).toHaveText("Answered by OpenAI API · gpt-5.6-luna (hosted, fallback)");
  });

  test("With no model answering, the recorded HCYN run replays with a Recorded run badge", async ({ page }) => {
    await mockWealth(page, { health: health(DOWN_MODEL) });
    await open(page, RESEARCH_CASE);
    await expect(page.getByText("No model is answering, so the draft note is off")).toBeVisible();
    await page.getByRole("button", { name: "Replay recorded HCYN run" }).first().click();
    await expect(page.locator('.research-review [data-provenance="recorded"]')).toContainText("Recorded run");
    await expect(page.locator("#research-result-heading")).toBeFocused();
    await expect(page.getByRole("list", { name: "Research run steps" })).toContainText("Compliance pre-check");
  });
});

test.describe("Client advisory", () => {
  test("Picking Dana fills her holdings as percentages, labelled synthetic", async ({ page }) => {
    await mockWealth(page, { health: health(HOSTED_MODEL) });
    await open(page, ADVISORY_CASE);
    const picker = page.getByRole("group", { name: "Synthetic households" });
    await expect(picker.getByRole("button")).toHaveCount(3);
    await expect(picker).toContainText("Synthetic");
    await picker.getByRole("button", { name: /Dana Whitfield/ }).click();
    await expect(page.getByLabel("Holding ticker 1")).toHaveValue("HCYN");
    await expect(page.getByLabel("Holding weight 1 (percent)")).toHaveValue("46");
    await expect(page.getByText("Total 100.0%")).toBeVisible();
    await expect(page.getByLabel(/Client notes/)).toHaveValue(/Retire at 62/);
  });

  test("When client data may not leave, the banner explains why and the recorded brief is shown", async ({ page }) => {
    let sent: Record<string, unknown> = {};
    await mockWealth(page, {
      health: health(HOSTED_MODEL, "refused: AI Defense is not configured"),
      brief: (route) => {
        sent = route.request().postDataJSON();
        return route.fulfill({ json: {
          ...ADVISORY.result,
          brief: { status: "refused", reason: "Client data stays in the bank: Cisco AI Defense is not configured." },
          served_by: { ...OPENAI_FALLBACK, egress: "require_ai_defense" },
          security: { mode: "off", status: "disabled", checks: 0, blocked: 0, errors: 0, forced: false },
          usage: { llm_calls: 0 },
        } });
      },
    });
    await open(page, ADVISORY_CASE);
    await page.getByRole("group", { name: "Synthetic households" }).getByRole("button", { name: /Dana Whitfield/ }).click();
    await expect(page.getByLabel("Holding ticker 1")).toHaveValue("HCYN");
    await page.locator(".advisory-actions").getByRole("button", { name: "Prepare meeting brief" }).click();

    await expect(page.getByText(/Sparky \(private model\) is down and client data may only go to a hosted model/)).toBeVisible();
    await expect(page.getByText("configure AI Defense or bring Sparky up")).toBeVisible();
    await expect(page.locator('.advisory-card [data-provenance="recorded"]')).toContainText("Recorded run");
    await expect(page.locator("#advisory-result-heading")).toHaveText("Meeting brief · Dana Whitfield");
    await expect(page.locator("#accept-meeting-brief")).toBeEnabled();
    expect(sent).toMatchObject({ household_id: "dana-whitfield", weights_unit: "percent" });
    expect((sent.holdings as { ticker: string; weight: number }[])[0]).toEqual({ ticker: "HCYN", weight: 46 });
  });

  test("A hosted brief says AI Defense inspected the client data first", async ({ page }) => {
    await mockWealth(page, { health: health(HOSTED_MODEL), brief: (route) => route.fulfill({ json: ADVISORY.result }) });
    await open(page, ADVISORY_CASE);
    await page.getByRole("group", { name: "Synthetic households" }).getByRole("button", { name: /Dana Whitfield/ }).click();
    await expect(page.getByLabel("Holding ticker 1")).toHaveValue("HCYN");
    await page.locator(".advisory-actions").getByRole("button", { name: "Prepare meeting brief" }).click();
    await expect(page.locator("#advisory-result-heading")).toBeFocused();
    await expect(page.getByText("Client data inspected by Cisco AI Defense (enforce) before reaching OpenAI API")).toBeVisible();
    await expect(page.locator('.advisory-card [data-provenance="live"]')).toHaveText("Answered by OpenAI API · gpt-5.6-luna (hosted, fallback)");
    await expect(page.locator("#accept-meeting-brief")).toBeEnabled();
  });

  test("An unavailable brief keeps Accept disabled with the reason", async ({ page }) => {
    await mockWealth(page, {
      health: health(HOSTED_MODEL),
      brief: (route) => route.fulfill({ json: { ...ADVISORY.result, brief: { status: "unavailable", reason: "The model did not return a usable brief." }, usage: { llm_calls: 0 } } }),
    });
    await open(page, ADVISORY_CASE);
    await page.getByLabel("Holding ticker 1").fill("VTI");
    await page.locator(".advisory-actions").getByRole("button", { name: "Prepare meeting brief" }).click();
    const accept = page.locator("#accept-meeting-brief");
    await expect(accept).toBeDisabled();
    await expect(accept).toHaveAttribute("aria-describedby", "accept-meeting-reason");
    await expect(page.locator("#accept-meeting-reason")).toContainText("The meeting brief is unavailable");
  });
});
