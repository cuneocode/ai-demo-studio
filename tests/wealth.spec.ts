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
const RECORDINGS = ["research-hcyn", "research-kstl-restricted", "research-hcyn-poisoned", "research-jpm-bank", "advisory-dana-whitfield", "advisory-okafor", "advisory-priya-raman"];
const RECORDED = Object.fromEntries(RECORDINGS.map((name) => [name, json(`services/wealth/data/recorded/${name}.json`)]));
const HOUSEHOLDS = ["dana-whitfield", "okafor", "priya-raman"].map((id) => json(`fixtures/households/${id}.json`));

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
    untrusted_inspection: "AI Defense inspects news items and CRM notes",
  };
}

const card = (record: Record<string, unknown>) => ({
  id: record.id, name: record.name, headline: record.headline, age: record.age, risk_profile: record.risk_profile,
  total_value: record.total_value, scenario: record.scenario, order: record.order, synthetic: true,
});

const policy = (name: string, allowed: boolean, checks: [string, string][]) => ({
  policy: name, allowed, source: "agent_control", checks: checks.map(([label, status]) => ({ label, status, source: "agent_control" })),
});

type Routes = {
  health?: object | null;
  analyze?: (route: Route) => unknown;
  publish?: (route: Route) => unknown;
  brief?: (route: Route) => unknown;
  approve?: (route: Route) => unknown;
  extraEvents?: () => object[];
};

/** Every /api/wealth call is mocked: nothing in this spec reaches the live service or a paid model. */
async function mockWealth(page: Page, routes: Routes = {}) {
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/wealth/**", (route) => route.fulfill({ status: 404, json: { detail: "Not mocked" } }));
  await page.route("**/api/wealth/health", (route) => (routes.health === null
    ? route.fulfill({ status: 503, body: "" })
    : route.fulfill({ json: routes.health ?? health(HOSTED_MODEL) })));
  await page.route("**/api/wealth/recordings/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    return RECORDED[name] ? route.fulfill({ json: RECORDED[name] }) : route.fulfill({ status: 404, json: { detail: "No recording." } });
  });
  await page.route("**/api/wealth/households", (route) => route.fulfill({ json: { households: HOUSEHOLDS.map(card), synthetic: true } }));
  await page.route("**/api/wealth/runs/**", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    return route.fulfill({ json: {
      run: { id, status: "completed", started_at: "2026-10-09T12:00:00Z", finished_at: "2026-10-09T12:00:02Z" },
      events: [{ id: "e1", at: "2026-10-09T12:00:00Z", run_id: id, component: "wealth", kind: "run", status: "started", title: "Mocked live run" }, ...(routes.extraEvents?.() ?? [])],
      total: 1 + (routes.extraEvents?.().length ?? 0),
    } });
  });
  if (routes.analyze) await page.route("**/api/wealth/research/analyze", routes.analyze);
  if (routes.publish) await page.route("**/api/wealth/research/publish", routes.publish);
  if (routes.brief) await page.route("**/api/wealth/advisory/brief", routes.brief);
  if (routes.approve) await page.route("**/api/wealth/advisory/approve", routes.approve);
}

const RESEARCH_TITLE = "Market event → house-view update";
const ADVISORY_TITLE = "Advisor meeting prep";

async function open(page: Page, title: string) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Open ${title} experience` }).first().click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

const result = (page: Page) => page.locator(".rx-result");
const badge = (page: Page) => result(page).locator(".rx-result-head [data-provenance]");
const timeline = (page: Page) => page.getByRole("list", { name: "Agent timeline" });

test.describe("Market event → house-view update", () => {
  test("the earnings replay streams the agent timeline, keeps verified claims, and a citation highlights its evidence", async ({ page }) => {
    await mockWealth(page);
    await open(page, RESEARCH_TITLE);
    const scenarios = page.getByRole("region", { name: "Scenarios" }).getByRole("button");
    await expect(scenarios).toHaveCount(4);
    await expect(scenarios.first()).toHaveAttribute("aria-pressed", "true");

    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    const heading = result(page).getByRole("heading", { level: 2 });
    await expect(heading).toContainText("Halcyon Interconnect");
    await expect(heading).toBeFocused();
    await expect(badge(page)).toHaveAttribute("data-provenance", "recorded");
    await expect(badge(page)).toContainText("Recorded run");
    await expect(result(page)).toContainText("House view: Constructive · Focus List");
    await expect(result(page)).toContainText("The AI does not set ratings or targets");
    await expect(timeline(page).getByRole("listitem").nth(5)).toBeVisible();
    await expect(timeline(page)).toContainText("restricted_list_check");

    const verified = RECORDED["research-hcyn"].result.update.claims.filter((claim: { status: string }) => claim.status === "verified").length;
    await expect(result(page).locator(".rx-count")).toContainText(`${verified} verified`);
    await expect(result(page).locator(".rx-count")).toContainText("Evaluation not configured");

    const chip = result(page).locator(".rx-cite").nth(1);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const cited = result(page).locator("[data-evidence].is-cited");
    await expect(cited).toHaveCount(1);
    await expect(cited).toBeInViewport();
    await result(page).getByRole("button", { name: "Clear highlight" }).click();
    await expect(cited).toHaveCount(0);

    await expect(page.getByText("not investment advice")).toHaveCount(2);
  });

  test("publishing is the strategist's call: Agent Control checks it, and the handoff carries the update into meeting prep", async ({ page }) => {
    let published: Record<string, unknown> = {};
    let briefBody: Record<string, unknown> = {};
    await mockWealth(page, {
      publish: (route) => {
        published = route.request().postDataJSON();
        return route.fulfill({ json: {
          status: "published", by: published.by, at: "2026-10-09T12:05:00Z", origin_label: "Checked on the recorded run's result",
          controls: policy("research.publish", true, [["Issuer not restricted", "allowed"], ["No rating or price target", "allowed"], ["Strategist approved", "allowed"]]),
        } });
      },
      brief: (route) => {
        briefBody = route.request().postDataJSON();
        return route.fulfill({ json: { ...RECORDED["advisory-dana-whitfield"].result, served_by: OPENAI_FALLBACK } });
      },
    });
    await open(page, RESEARCH_TITLE);
    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    const bar = page.getByRole("region", { name: "Publication" });
    await expect(bar).toContainText("Strategist approval");
    await bar.getByRole("button", { name: "Publish update" }).click();

    await expect(bar).toContainText("Published to meeting prep in this studio");
    await expect(bar).toContainText("Simulated distribution · nothing is sent to real advisors");
    expect(published).toMatchObject({ decision: "approve", by: "Sam Ortiz · CIO Office strategist", recording: "research-hcyn" });
    expect(published.run_id).toBeUndefined();
    expect((published.result as { ticker: string }).ticker).toBe("HCYN");
    const checks = result(page).locator(".rx-policies");
    await expect(checks).toContainText("Publish · research.publish");
    await expect(checks).toContainText("Strategist approved");
    await expect(checks.locator(".rx-source").first()).toHaveText("Agent Control");

    await bar.getByRole("button", { name: "Prepare client meeting" }).click();
    await expect(page.getByRole("heading", { name: ADVISORY_TITLE, level: 1 })).toBeVisible();
    const context = page.getByRole("region", { name: "Meeting context" });
    await expect(context).toContainText("House-view update · HCYN · Constructive");
    await expect(context).toContainText("Published by Sam Ortiz");

    await page.locator("#advisory-run").click();
    await expect(result(page).getByRole("heading", { name: "Dana Whitfield", level: 2 })).toBeVisible();
    expect(briefBody).toMatchObject({ household_id: "dana-whitfield" });
    expect((briefBody.research as { publish: { status: string } }).publish.status).toBe("published");
    await expect(badge(page)).toHaveText("Answered by OpenAI API · gpt-5.6-luna (hosted, fallback)");
  });

  test("a denied publish says which policy stopped it", async ({ page }) => {
    await mockWealth(page, {
      publish: (route) => route.fulfill({ json: {
        status: "denied", by: "Sam Ortiz · CIO Office strategist", at: "2026-10-09T12:05:00Z",
        controls: policy("research.publish", false, [["Issuer not restricted", "allowed"], ["No rating or price target", "denied"]]),
      } }),
    });
    await open(page, RESEARCH_TITLE);
    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    await page.getByRole("region", { name: "Publication" }).getByRole("button", { name: "Publish update" }).click();
    await expect(page.getByRole("region", { name: "Publication" })).toContainText("Not published · a research.publish policy denied it");
    await expect(result(page).locator(".rx-policies")).toContainText("No rating or price target");
    await expect(page.getByRole("button", { name: "Prepare client meeting" })).toHaveCount(0);
  });

  test("a restricted issuer is blocked by Agent Control before any data or model call", async ({ page }) => {
    let sent: Record<string, unknown> = {};
    await mockWealth(page, {
      analyze: (route) => {
        sent = route.request().postDataJSON();
        return route.fulfill({ json: RECORDED["research-kstl-restricted"].result });
      },
    });
    await open(page, RESEARCH_TITLE);
    await page.getByRole("button", { name: /Restricted issuer/ }).click();
    await page.locator("#research-run").click();
    await expect(result(page)).toContainText("Blocked before any data or model call");
    expect(sent).toMatchObject({ ticker: "KSTL", scenario: "restricted" });
    await expect(badge(page)).toHaveText("No data fetched · no model call");
    await expect(result(page).locator(".rx-blocked")).toContainText("research.precheck");
    await expect(result(page).locator(".rx-blocked")).toContainText("denied");
    await expect(page.getByRole("button", { name: "Publish update" })).toHaveCount(0);
  });

  test("a poisoned news story is withheld before the agent reads it", async ({ page }) => {
    await mockWealth(page);
    await open(page, RESEARCH_TITLE);
    await page.getByRole("button", { name: /Poisoned news story/ }).click();
    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    const withheld = result(page).locator(".rx-news li.is-withheld");
    await expect(withheld).toHaveCount(1);
    await expect(withheld).toContainText("It never reached the agent.");
    await expect(withheld).toContainText("AI Defense");
    await expect(result(page).locator(".rx-news li.is-kept")).not.toHaveCount(0);
  });

  test("the bank scenario reads JPMorgan on P/B and ROE", async ({ page }) => {
    await mockWealth(page);
    await open(page, RESEARCH_TITLE);
    await page.getByRole("button", { name: /A bank, from public data/ }).click();
    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    await expect(result(page)).toContainText("Bank · read on P/B and ROE");
    await expect(result(page).getByRole("heading", { level: 2 })).toContainText("JPM");
  });

  test("never dead: service down replays the recording; model down shows the code-written fixture as sample data", async ({ page }) => {
    await mockWealth(page, { health: null });
    await open(page, RESEARCH_TITLE);
    await expect(page.getByText("The wealth service is not answering")).toBeVisible();
    await expect(page.locator("#research-run")).toBeDisabled();
    await page.locator(".demo-status").getByRole("button", { name: "Replay recorded run" }).first().click();
    await expect(badge(page)).toHaveAttribute("data-provenance", "recorded");

    await page.unrouteAll({ behavior: "ignoreErrors" });
    const base = RECORDED["research-hcyn"].result;
    await mockWealth(page, {
      health: health(DOWN_MODEL),
      analyze: (route) => route.fulfill({ json: {
        ...base, served_by: null, usage: { llm_calls: 0 },
        update: { ...base.update, mode: "fixture", mode_label: "Fixture summary · written by code" },
        publish: { status: "unavailable", reason: "AI update unavailable · numbers and checks only. The code-written summary cannot be published." },
      } }),
    });
    await open(page, RESEARCH_TITLE);
    await expect(page.getByText("No model is reachable")).toBeVisible();
    await page.locator("#research-run").click();
    await expect(badge(page)).toHaveAttribute("data-provenance", "sample");
    await expect(badge(page)).toHaveText("Sample data · Fixture summary · written by code, no model");
    await expect(page.getByRole("region", { name: "Publication" })).toContainText("AI update unavailable · numbers and checks only");
    await expect(page.getByRole("button", { name: "Publish update" })).toHaveCount(0);
  });

  test("the result and timeline survive a trip to the Architecture tab", async ({ page }) => {
    await mockWealth(page);
    await open(page, RESEARCH_TITLE);
    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    await expect(timeline(page).getByRole("listitem").nth(5)).toBeVisible();
    const before = await timeline(page).getByRole("listitem").count();
    await page.getByRole("tab", { name: "Architecture" }).click();
    await expect(page.getByTestId("architecture-explorer")).toBeVisible();
    await page.getByRole("tab", { name: "Use case demo" }).click();
    await expect(result(page).getByRole("heading", { level: 2 })).toContainText("Halcyon Interconnect");
    expect(await timeline(page).getByRole("listitem").count()).toBeGreaterThanOrEqual(before);
  });
});

test.describe("Advisor meeting prep", () => {
  test("the household picker defaults to Dana and the context panel says what is loaded", async ({ page }) => {
    await mockWealth(page);
    await open(page, ADVISORY_TITLE);
    const radios = page.locator("input[name='advisory-household']");
    await expect(radios).toHaveCount(3);
    await expect(page.getByRole("radio", { name: /Dana Whitfield/ })).toBeChecked();
    const context = page.getByRole("region", { name: "Meeting context" });
    await expect(context).toContainText("House-view update · none published this session");
    await expect(context).toContainText("Company briefing · not loaded");
    await expect(page.getByText("Private inference is down · client data may reach OpenAI API only with AI Defense in enforce")).toBeVisible();
  });

  test("advisor submits, supervisor approves; an unsuitable action is denied by the supervisor's policy", async ({ page }) => {
    const posts: Record<string, unknown>[] = [];
    await mockWealth(page, {
      approve: (route) => {
        const body = route.request().postDataJSON();
        posts.push(body);
        if (body.stage === "advisor") {
          return route.fulfill({ json: { status: "awaiting_supervisor", advisor: { by: body.by, at: "2026-10-09T12:10:00Z" }, action_ids: body.action_ids } });
        }
        const unsuitable = (body.action_ids as string[]).includes("NBA-EXCHANGE");
        return route.fulfill({ json: {
          status: unsuitable ? "denied" : "sent", advisor: { by: "Jordan Lee · advisor", at: "2026-10-09T12:10:00Z" },
          supervisor: { by: body.by, at: "2026-10-09T12:11:00Z" }, action_ids: body.action_ids,
          findings: unsuitable ? ["NBA-EXCHANGE is not suitable for this profile"] : [],
          controls: policy("advisory.recommendation", !unsuitable, [["Every chosen action is suitable", unsuitable ? "denied" : "allowed"], ["Supervisor approved", "allowed"]]),
        } });
      },
    });
    await open(page, ADVISORY_TITLE);
    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    await expect(result(page).getByRole("heading", { name: "Dana Whitfield", level: 2 })).toBeFocused();
    await expect(result(page)).toContainText("Reg BI care obligation");
    await expect(result(page).locator(".ax-findings li").first()).toContainText("Single issuer above policy");

    const exchange = page.getByRole("checkbox", { name: "Include Exchange fund for low-basis HCYN shares" });
    await expect(exchange).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Include 10b5-1 sale plan/ })).toBeChecked();
    await exchange.check();
    await expect(result(page).locator(".ax-action.is-unsuitable")).toContainText("the supervisor's policy check will deny it");

    const bar = page.getByRole("region", { name: "Approval" });
    await expect(bar).toContainText("Step 1 · Advisor review");
    await bar.getByRole("button", { name: "Submit for supervision" }).click();
    await expect(bar).toContainText("Step 2 · Supervisor approval");
    await expect(exchange).toBeDisabled();
    await bar.getByRole("button", { name: "Approve and record" }).click();
    await expect(bar).toContainText("Not recorded · an advisory.recommendation policy denied it");
    await expect(result(page).locator(".rx-policies")).toContainText("Every chosen action is suitable");
    expect(posts.map((row) => row.stage)).toEqual(["advisor", "supervisor"]);
    expect(posts[1].action_ids).toContain("NBA-EXCHANGE");
    expect(posts[1].by).toBe("Morgan Patel · supervising principal");

    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    await expect(bar).toContainText("Step 1 · Advisor review");
    await bar.getByRole("button", { name: "Submit for supervision" }).click();
    await bar.getByRole("button", { name: "Approve and record" }).click();
    await expect(bar).toContainText("Approved · written to this run's audit trail");
    await expect(bar).toContainText("Simulated CRM record");
    await expect(bar).toContainText("Nothing is executed");
    expect(posts[3].action_ids).not.toContain("NBA-EXCHANGE");
    expect(posts.every((row) => row.recording === "advisory-dana-whitfield" && row.run_id === undefined)).toBe(true);
  });

  test("Priya's CRM notes: the injected instruction is withheld and PII is masked before any model call", async ({ page }) => {
    await mockWealth(page);
    await open(page, ADVISORY_TITLE);
    await page.getByRole("radio", { name: /Priya Raman/ }).check();
    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    await expect(result(page).getByRole("heading", { name: "Priya Raman", level: 2 })).toBeVisible();
    await expect(result(page)).toContainText("AI Defense forced to enforce · client data on a hosted model");
    const notes = result(page).locator(".ax-notes li");
    await expect(notes.filter({ hasText: "Withheld from the model" })).toHaveCount(1);
    await expect(result(page).locator(".ax-masked").first()).toContainText("SSN (local rule)");
    await expect(page.locator("body")).not.toContainText("000-00-1234");
    await expect(page.locator("body")).not.toContainText("SYSTEM OVERRIDE");
    await expect(page.locator("body")).not.toContainText("0000-4471-9902");
  });

  test("with the hosted fallback refused, client data stays in the bank and the brief is written by code", async ({ page }) => {
    const base = RECORDED["advisory-okafor"].result;
    await mockWealth(page, {
      health: health(HOSTED_MODEL, "refused: AI Defense is not configured"),
      brief: (route) => route.fulfill({ json: {
        ...base, served_by: { ...OPENAI_FALLBACK, egress: "require_ai_defense" }, usage: { llm_calls: 0 },
        security: { mode: "off", status: "disabled", checks: 0, blocked: 0, errors: 0, forced: false },
        brief: { ...base.brief, mode: "fixture", refused: true, reason: "Cisco AI Defense is not configured." },
        approval: { status: "unavailable", reason: "AI brief unavailable · the code-written brief shows the rules and actions and cannot be submitted for supervision." },
      } }),
    });
    await open(page, ADVISORY_TITLE);
    await expect(page.getByText("Private inference is down · client data will not leave the bank")).toBeVisible();
    await page.getByRole("radio", { name: /Okafor/ }).check();
    await page.locator("#advisory-run").click();
    await expect(result(page).locator(".ax-refused")).toContainText("Client data stayed in the bank");
    await expect(badge(page)).toHaveText("Sample data · Brief written by code · client data stayed in the bank");
    await expect(result(page)).not.toContainText("AI Defense forced to enforce");
    await expect(page.getByRole("region", { name: "Approval" })).toContainText("AI brief unavailable");
    await expect(page.getByRole("button", { name: "Submit for supervision" })).toHaveCount(0);
  });

  test("a decision on a live run appends to the timeline without clearing it", async ({ page }) => {
    let decided = false;
    await mockWealth(page, {
      brief: (route) => route.fulfill({ json: { ...RECORDED["advisory-dana-whitfield"].result, run_id: route.request().postDataJSON().run_id, served_by: OPENAI_FALLBACK } }),
      approve: (route) => {
        decided = true;
        return route.fulfill({ json: { status: "awaiting_supervisor", advisor: { by: "Jordan Lee · advisor", at: "2026-10-09T12:10:00Z" }, action_ids: [] } });
      },
      extraEvents: () => (decided ? [{ id: "e2", at: "2026-10-09T12:00:05Z", component: "wealth", kind: "hitl.decision", status: "ok", lane: "human", title: "Jordan Lee · advisor · submitted the brief for supervision" }] : []),
    });
    await open(page, ADVISORY_TITLE);
    await page.locator("#advisory-run").click();
    await expect(timeline(page)).toContainText("Mocked live run");
    await page.getByRole("region", { name: "Approval" }).getByRole("button", { name: "Submit for supervision" }).click();
    await expect(timeline(page)).toContainText("submitted the brief for supervision");
    await expect(timeline(page)).toContainText("Mocked live run");
  });

  test("the prepared brief survives a trip to the Architecture tab", async ({ page }) => {
    await mockWealth(page);
    await open(page, ADVISORY_TITLE);
    await page.locator(".rx-actions").getByRole("button", { name: "Replay recorded run" }).click();
    await expect(result(page).getByRole("heading", { name: "Dana Whitfield", level: 2 })).toBeVisible();
    await page.getByRole("tab", { name: "Architecture" }).click();
    await page.getByRole("tab", { name: "Use case demo" }).click();
    await expect(result(page).getByRole("heading", { name: "Dana Whitfield", level: 2 })).toBeVisible();
    await expect(timeline(page).getByRole("listitem").first()).toBeVisible();
  });
});
