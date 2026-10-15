import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function showArchitecture(page: Page) {
  const tab = page.getByRole("tab", { name: "Architecture" });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

async function openBrahe(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).click();
  await showArchitecture(page);
  const explorer = page.getByTestId("architecture-explorer");
  await explorer.scrollIntoViewIfNeeded();
  await expect(explorer).toHaveAttribute("data-scene-id", "brahe.journey");
  await expect(explorer).toHaveAttribute("data-system-id", "brahe-bank");
  await expect(page.locator(".react-flow")).toHaveCount(1);
  return explorer;
}

async function openCase(page: Page, id: string, title: string) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Open ${title} experience` }).click();
  await showArchitecture(page);
  const explorer = page.getByTestId("architecture-explorer");
  await explorer.scrollIntoViewIfNeeded();
  await expect(explorer).toHaveAttribute("data-system-id", id);
  await expect(page.locator(".react-flow")).toHaveCount(1);
  return explorer;
}

async function clickAction(page: Page, id: string, action = "expand") {
  await page.locator(`.react-flow__node[data-id="${id}"] [data-action="${action}"]`).click();
  await page.waitForTimeout(450);
}

async function graphSignature(explorer: ReturnType<Page["getByTestId"]>) {
  return explorer.evaluate((root) => ({
    scene: root.getAttribute("data-scene-id"),
    expanded: root.getAttribute("data-expanded-groups"),
    selected: root.getAttribute("data-selected-id"),
    history: root.getAttribute("data-history-depth"),
    zoom: root.getAttribute("data-zoom"),
    viewport: root.querySelector(".react-flow__viewport")?.getAttribute("style"),
    nodes: [...root.querySelectorAll(".react-flow__node")].map((node) => ({
      id: node.getAttribute("data-id"),
      style: node.getAttribute("style")?.replace(/visibility: (?:hidden|visible); ?/g, ""),
      width: Math.round(node.getBoundingClientRect().width * 10) / 10,
      height: Math.round(node.getBoundingClientRect().height * 10) / 10,
    })),
    edges: [...root.querySelectorAll(".react-flow__edge")].map((edge) => ({
      id: edge.getAttribute("data-id"),
      d: edge.querySelector("path.react-flow__edge-path")?.getAttribute("d"),
    })),
  }));
}

async function visibleEdges(explorer: ReturnType<Page["getByTestId"]>, ids: string[]) {
  const drawn = await explorer.locator(".react-flow__edge").evaluateAll((edges) => edges.map((edge) => {
    const path = edge.querySelector("path.react-flow__edge-path") as SVGPathElement | null;
    const style = path ? getComputedStyle(path) : null;
    return {
      id: edge.getAttribute("data-id") ?? "",
      length: path ? path.getTotalLength() : 0,
      stroke: style?.stroke ?? "",
      marker: path?.getAttribute("marker-end") ?? "",
    };
  }));
  for (const id of ids) {
    const hit = drawn.find((edge) => edge.id === id);
    expect(hit, id).toBeTruthy();
    expect(hit!.length, id).toBeGreaterThan(8);
    expect(hit!.stroke, id).not.toBe("none");
  }
  return drawn;
}

async function noCardOverlap(explorer: ReturnType<Page["getByTestId"]>) {
  const hits = await explorer.locator(".map-node").evaluateAll((nodes) => {
    const boxes = nodes.map((node) => ({ label: node.querySelector("strong")?.textContent ?? "", rect: node.getBoundingClientRect() }));
    const out: string[] = [];
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left], b = boxes[right];
        if (a.rect.left < b.rect.right - 4 && a.rect.right > b.rect.left + 4 && a.rect.top < b.rect.bottom - 4 && a.rect.bottom > b.rect.top + 4) out.push(`${a.label} overlaps ${b.label}`);
      }
    }
    return out;
  });
  expect(hits).toEqual([]);
}

async function normalizedSize(explorer: ReturnType<Page["getByTestId"]>, id: string) {
  return explorer.evaluate((root, instanceId) => {
    const zoom = Number(root.getAttribute("data-zoom")) || 1;
    const rect = root.querySelector(`.react-flow__node[data-id="${instanceId}"]`)?.getBoundingClientRect();
    return rect ? { width: Math.round(rect.width / zoom), height: Math.round(rect.height / zoom) } : null;
  }, id);
}

async function expectInsideCanvas(explorer: ReturnType<Page["getByTestId"]>, ids: string[]) {
  const result = await explorer.evaluate((root, instanceIds) => {
    const canvas = root.querySelector(".map-canvas")?.getBoundingClientRect();
    return Object.fromEntries(instanceIds.map((id) => {
      const rect = root.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect();
      return [id, Boolean(canvas && rect && rect.left >= canvas.left - 2 && rect.right <= canvas.right + 2 && rect.top >= canvas.top - 2 && rect.bottom <= canvas.bottom + 2)];
    }));
  }, ids);
  for (const id of ids) expect(result[id], id).toBe(true);
}

async function expectGroupGeometry(explorer: ReturnType<Page["getByTestId"]>, groupId: string, childIds: string[]) {
  const result = await explorer.evaluate((root, { parent, children }) => {
    const group = root.querySelector(`.react-flow__node[data-id="${parent}"]`)?.getBoundingClientRect();
    const header = root.querySelector(`.react-flow__node[data-id="${parent}"] .map-group-header`)?.getBoundingClientRect();
    return children.map((id) => {
      const child = root.querySelector(`.react-flow__node[data-id="${id}"]`)?.getBoundingClientRect();
      const childHeader = root.querySelector(`.react-flow__node[data-id="${id}"] .map-group-header`)?.getBoundingClientRect();
      const meaningfulTop = childHeader?.top ?? child?.top;
      return {
        id,
        inside: Boolean(group && child && child.left >= group.left - 2 && child.right <= group.right + 2 && child.top >= group.top - 2 && child.bottom <= group.bottom + 2),
        clearsHeader: Boolean(header && meaningfulTop != null && meaningfulTop >= header.bottom + 4),
      };
    });
  }, { parent: groupId, children: childIds });
  for (const item of result) {
    expect(item.inside, `${groupId} contains ${item.id}`).toBe(true);
    expect(item.clearsHeader, `${item.id} clears ${groupId} header`).toBe(true);
  }
}

test("business overview keeps the journey and three conceptual support paths", async ({ page }) => {
  const explorer = await openBrahe(page);
  await expect(explorer).toHaveAttribute("data-expanded-groups", "");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.ask"]')).toContainText("Ask about card options");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.assistant"]')).toContainText("Bank assistant");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.review"]')).toContainText("Review next steps");
  const edges = await visibleEdges(explorer, [
    "rel.business.ask-assistant",
    "rel.business.assistant-review",
    "rel.support.defense",
    "rel.support.observe",
    "rel.support.infrastructure",
  ]);
  for (const id of ["rel.support.defense", "rel.support.observe", "rel.support.infrastructure"]) expect(edges.find((edge) => edge.id === id)?.marker).toBe("");
});

test("assistant expansion retains root identities, context, platform anchors, and one canvas", async ({ page }) => {
  const explorer = await openBrahe(page);
  const rootIds = ["brahe.ask", "brahe.assistant", "brahe.review", "brahe.platform.defense", "brahe.platform.observe", "brahe.platform.infra"];
  await clickAction(page, "brahe.assistant");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "group.assistant");
  await expect(page.locator(".react-flow")).toHaveCount(1);
  for (const id of rootIds) await expect(explorer.locator(`.react-flow__node[data-id="${id}"]`)).toHaveCount(1);
  const parent = explorer.locator('.react-flow__node[data-id="brahe.assistant"]');
  await expect(parent).toContainText("Bank assistant");
  for (const id of ["brahe.stage.check", "brahe.stage.build", "brahe.stage.return"]) {
    const contained = await explorer.evaluate((root, { parentId, childId }) => {
      const outer = root.querySelector(`.react-flow__node[data-id="${parentId}"]`)?.getBoundingClientRect();
      const inner = root.querySelector(`.react-flow__node[data-id="${childId}"]`)?.getBoundingClientRect();
      return Boolean(outer && inner && inner.left >= outer.left - 2 && inner.right <= outer.right + 2 && inner.top >= outer.top - 2 && inner.bottom <= outer.bottom + 2);
    }, { parentId: "brahe.assistant", childId: id });
    expect(contained, id).toBe(true);
  }
  await visibleEdges(explorer, ["rel.business.ask-assistant", "rel.workflow.check-build", "rel.workflow.build-return", "rel.business.assistant-review"]);
  await noCardOverlap(explorer);
});

test("Check expansion keeps Build and Return, branches to the existing Build occurrence, and restores Back", async ({ page }) => {
  const explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  const before = await graphSignature(explorer);
  await clickAction(page, "brahe.stage.check");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "group.assistant,group.check");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.stage.check"]')).toContainText("Check the question");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.stage.build"]')).toBeVisible();
  await expect(explorer.locator('.react-flow__node[data-id="brahe.stage.return"]')).toBeVisible();
  await expect(explorer.locator('.react-flow__node[data-id="brahe.scope.evaluate"]')).toContainText("Evaluate scope");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.scope.control"]')).toContainText("Enforce scope");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.scope.decision"]')).toContainText("Apply the decision");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.scope.stop"]')).toContainText("Stop the turn");
  const allow = explorer.locator('.react-flow__edge[data-id="rel.scope.allow"]');
  await expect(allow).toHaveAttribute("data-testid", "rf__edge-rel.scope.allow");
  await visibleEdges(explorer, ["rel.scope.allow", "rel.scope.stop"]);
  const viewport = await explorer.locator(".react-flow__viewport").getAttribute("style");
  await explorer.getByRole("button", { name: "Back" }).click();
  await expect(explorer).toHaveAttribute("data-expanded-groups", "group.assistant");
  expect((await graphSignature(explorer)).nodes.map((node) => node.id)).toEqual(before.nodes.map((node) => node.id));
  expect(await explorer.locator(".react-flow__viewport").getAttribute("style")).toBe(before.viewport);
  expect(await explorer.locator(".react-flow__viewport").getAttribute("style")).not.toBe(viewport);
});

test("request inspection expands locally and source inspection preserves projection and focus", async ({ page }) => {
  const explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.check");
  await clickAction(page, "brahe.check.inspect");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "group.assistant,group.check,group.request-inspection");
  for (const id of ["brahe.inspect.request.call", "brahe.service.ai-defense", "brahe.inspect.request.apply"]) await expect(explorer.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible();
  await expect(explorer.locator('.react-flow__node[data-id="brahe.stage.build"]')).toBeVisible();
  await noCardOverlap(explorer);
  await explorer.locator('.react-flow__node[data-id="brahe.inspect.request.call"] .map-source-btn').click();
  await expect(explorer.locator(".map-source h3")).toHaveText("Call excerpt");
  await expect(explorer.getByRole("button", { name: "Decision" })).toBeVisible();
  await expect(explorer.getByRole("button", { name: "Setup" })).toBeVisible();
  await explorer.getByRole("button", { name: "Close source" }).click();
  const beforeSource = await graphSignature(explorer);
  await explorer.locator('.react-flow__node[data-id="brahe.scope.control"] .map-source-btn').click();
  await expect(explorer.locator(".map-source h3")).toHaveText("Call excerpt");
  await expect(explorer.locator(".src-view")).toContainText("agent_control.evaluate_controls");
  const withSource = await graphSignature(explorer);
  expect(withSource.nodes).toEqual(beforeSource.nodes);
  expect(withSource.edges).toEqual(beforeSource.edges);
  await explorer.getByRole("radio", { name: "Cisco AI Defense" }).click();
  expect((await graphSignature(explorer)).nodes.map(({ id, style }) => ({ id, style }))).toEqual(beforeSource.nodes.map(({ id, style }) => ({ id, style })));
  await expect(explorer.locator(".map-source-title")).toContainText("Splunk Agent Observability");
  await explorer.getByRole("button", { name: "Close source" }).click();
  expect(await explorer.locator(".react-flow__viewport").getAttribute("style")).toBe(beforeSource.viewport);
});

test("platform focus is geometry-invariant at deep expansion and no-op focus is retained", async ({ page }) => {
  const explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.check");
  await page.waitForTimeout(200);
  const neutral = await graphSignature(explorer);
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/architecture-source")) requests.push(request.url()); });
  for (const name of ["Cisco AI Defense", "Splunk Agent Observability", "AI Infrastructure", "All platforms"]) {
    await explorer.getByRole("radio", { name }).click();
    expect(await graphSignature(explorer)).toEqual(neutral);
  }
  expect(requests).toEqual([]);
  await explorer.getByRole("radio", { name: "AI Infrastructure" }).click();
  await explorer.getByRole("list", { name: "Assistant stages" }).getByRole("button", { name: "Check question" }).click();
  await expect(explorer).toHaveAttribute("data-platform-focus", "ai-infrastructure");
});

test("every other use case follows the continuous-system projection contract", async ({ page }) => {
  test.setTimeout(180_000);
  const cases = [
    { id: "fraud-modeling", title: "Card fraud triage", mode: "implemented" },
    { id: "company-briefing", title: "Company briefing", mode: "implemented" },
    { id: "market-research", title: "Market research", mode: "implemented" },
    { id: "client-advisory", title: "Advisor meeting prep", mode: "implemented" },
    { id: "kyc-processing", title: "KYC processing", mode: "proposed" },
    { id: "sar-support", title: "SAR investigation", mode: "implemented" },
    { id: "transaction-llm", title: "Transaction intelligence", mode: "proposed" },
  ];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const useCase of cases) {
      const explorer = await openCase(page, useCase.id, useCase.title);
      await expect(explorer).toHaveAttribute("data-mode", useCase.mode);
      if (useCase.mode === "proposed") await expect(explorer.locator(".map-mode-status")).toHaveText("Proposed");
      const sceneId = await explorer.getAttribute("data-scene-id");
      const rootIds = await explorer.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")).filter(Boolean));
      expect(rootIds.length, useCase.id).toBeGreaterThanOrEqual(3);

      const primary = explorer.locator('.react-flow__node:has([data-action="expand"])').first();
      const primaryOccurrence = await primary.getAttribute("data-id");
      expect(primaryOccurrence, `${useCase.id} primary occurrence`).toBeTruthy();
      await primary.locator('[data-action="expand"]').click();
      await page.waitForTimeout(450);
      await expect(explorer).toHaveAttribute("data-scene-id", sceneId ?? "");
      await expect(explorer).toHaveAttribute("data-expanded-groups", `${useCase.id}.group.system`);
      for (const id of rootIds) await expect(explorer.locator(`.react-flow__node[data-id="${id}"]`), `${useCase.id} retains ${id}`).toHaveCount(1);
      const systemCoreIds = await explorer.locator(`.react-flow__node[data-id^="${useCase.id}.core."]`).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")!).filter(Boolean));
      await expectGroupGeometry(explorer, primaryOccurrence!, systemCoreIds);
      await expectGroupGeometry(explorer, primaryOccurrence!, systemCoreIds);
      await expectInsideCanvas(explorer, [...rootIds, ...systemCoreIds]);

      const systemViewport = await explorer.locator(".react-flow__viewport").getAttribute("style");
      const neutral = await graphSignature(explorer);
      for (const name of ["Cisco AI Defense", "Splunk Agent Observability", "AI Infrastructure", "All platforms"]) {
        await explorer.getByRole("radio", { name }).click();
        await expect(explorer.locator(".react-flow__edge")).toHaveCount(neutral.edges.length);
        expect(await graphSignature(explorer), `${useCase.id} ${name} geometry`).toEqual(neutral);
      }

      const core = explorer.locator(`.react-flow__node[data-id^="${useCase.id}.core."]:has([data-action="expand"])`).first();
      const coreOccurrence = await core.getAttribute("data-id");
      expect(coreOccurrence, `${useCase.id} expandable core`).toBeTruthy();
      await core.locator('[data-action="expand"]').click();
      await page.waitForTimeout(450);
      await expect(explorer).toHaveAttribute("data-scene-id", sceneId ?? "");
      const expanded = await explorer.getAttribute("data-expanded-groups");
      expect(expanded, `${useCase.id} core expansion`).toContain(`${useCase.id}.group.system,${useCase.id}.group.core.`);
      const childIds = await explorer.locator(`.react-flow__node[data-id^="${coreOccurrence}."]`).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")!).filter(Boolean));
      expect(childIds.length, `${useCase.id} interior children`).toBeGreaterThan(0);
      await expectGroupGeometry(explorer, coreOccurrence!, childIds);
      await expectInsideCanvas(explorer, [coreOccurrence!, ...childIds]);
      const deepViewport = await explorer.locator(".react-flow__viewport").getAttribute("style");

      await explorer.getByRole("button", { name: "Back" }).click();
      await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", systemViewport ?? "");
      await explorer.locator(`.react-flow__node[data-id="${coreOccurrence}"] [data-action="expand"]`).click();
      await page.waitForTimeout(450);
      await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", deepViewport ?? "");
      await explorer.locator(`.react-flow__node[data-id="${coreOccurrence}"] [data-action="collapse"]`).click();
      await page.waitForTimeout(450);
      await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", systemViewport ?? "");
      await explorer.locator(`.react-flow__node[data-id="${primaryOccurrence}"] [data-action="collapse"]`).click();
      await page.waitForTimeout(450);
      await expect(explorer).toHaveAttribute("data-expanded-groups", "");
      await expect(explorer).toHaveAttribute("data-scene-id", sceneId ?? "");
      await expect(page.locator(".react-flow")).toHaveCount(1);
      await expect(page.getByRole("dialog", { name: "Unhandled Script Error" })).toHaveCount(0);
    }
  }
});

test("fraud evidence opens from its owning occurrence without changing projection", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const explorer = await openCase(page, "fraud-modeling", "Card fraud triage");
  await explorer.locator('.react-flow__node:has([data-action="expand"])').first().locator('[data-action="expand"]').click();
  await page.waitForTimeout(450);
  await explorer.locator('.react-flow__node[data-id="fraud-modeling.core.score"] [data-action="expand"]').click();
  await page.waitForTimeout(450);
  const sourceOwner = explorer.locator('.react-flow__node[data-id^="fraud-modeling.core.score."]:has(.map-source-btn)').first();
  const before = await graphSignature(explorer);
  await sourceOwner.locator(".map-source-btn").click();
  await expect(explorer.getByRole("complementary", { name: "Source inspector" })).toBeVisible();
  const open = await graphSignature(explorer);
  expect(open.nodes.map(({ id, style }) => ({ id, style }))).toEqual(before.nodes.map(({ id, style }) => ({ id, style })));
  expect(open.edges).toEqual(before.edges);
  await explorer.getByRole("button", { name: "Close source" }).click();
  await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", before.viewport ?? "");
});

test("interbank exchange keeps both banks, one crossing, and the outbound control in one canvas", async ({ page }) => {
  const explorer = await openCase(page, "interbank-a2a", "Interbank settlement investigation");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "");
  await visibleEdges(explorer, ["ib.rel.business.open", "ib.rel.business.approve", "ib.rel.support.defense", "ib.rel.support.observe", "ib.rel.support.infra"]);
  const rootIds = ["ib.open", "ib.investigation", "ib.approve", "ib.platform.defense", "ib.platform.observe", "ib.platform.infra"];

  await clickAction(page, "ib.investigation");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "ib.group.investigation");
  await expectGroupGeometry(explorer, "ib.investigation", ["ib.stage.kickoff", "ib.stage.exchange", "ib.stage.report"]);
  const stagesViewport = await explorer.locator(".react-flow__viewport").getAttribute("style");

  await clickAction(page, "ib.stage.exchange");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "ib.group.investigation,ib.group.exchange");
  for (const id of rootIds) await expect(explorer.locator(`.react-flow__node[data-id="${id}"]`)).toHaveCount(1);
  await expectGroupGeometry(explorer, "ib.a.bank", ["ib.a.coordinator", "ib.a.records", "ib.a.control", "ib.a.gateway"]);
  await expectGroupGeometry(explorer, "ib.b.bank", ["ib.b.gateway", "ib.b.investigator", "ib.b.records"]);
  await visibleEdges(explorer, ["ib.rel.x.boundary", "ib.rel.x.reply", "ib.rel.x.model-a", "ib.rel.x.model-b", "ib.rel.x.trace-a", "ib.rel.x.trace-b"]);
  await expect(explorer.locator('.react-flow__node[data-id="ib.a.bank"] [data-action="expand"]')).toHaveCount(0);
  await noCardOverlap(explorer);
  const exchange = await graphSignature(explorer);

  await clickAction(page, "ib.a.control");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "ib.group.investigation,ib.group.exchange,ib.group.outbound-control");
  await expectGroupGeometry(explorer, "ib.a.control", ["ib.a.control.evaluate", "ib.a.control.api", "ib.a.control.apply"]);
  await visibleEdges(explorer, ["ib.rel.x.control", "ib.rel.x.control-verdict", "ib.rel.x.egress", "ib.rel.x.not-sent"]);
  await noCardOverlap(explorer);
  const control = await graphSignature(explorer);
  await explorer.locator('.react-flow__node[data-id="ib.a.control.api"] .map-source-btn').click();
  await expect(explorer.getByRole("complementary", { name: "Source inspector" })).toBeVisible();
  await expect(explorer.locator(".src-view")).toBeVisible();
  const withSource = await graphSignature(explorer);
  expect(withSource.nodes.map(({ id, style }) => ({ id, style }))).toEqual(control.nodes.map(({ id, style }) => ({ id, style })));
  expect(withSource.edges).toEqual(control.edges);
  await explorer.getByRole("button", { name: "Close source" }).click();

  await explorer.getByRole("button", { name: "Back" }).click();
  await expect(explorer).toHaveAttribute("data-expanded-groups", "ib.group.investigation,ib.group.exchange");
  expect((await graphSignature(explorer)).nodes.map((node) => node.id)).toEqual(exchange.nodes.map((node) => node.id));
  await clickAction(page, "ib.stage.exchange", "collapse");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "ib.group.investigation");
  await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", stagesViewport ?? "");
  await clickAction(page, "ib.investigation", "collapse");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "");
  await expect(page.locator(".react-flow")).toHaveCount(1);
});

test("interbank inspection stages show the fail-closed stop, and demo sources open captured evidence", async ({ page }) => {
  const explorer = await openCase(page, "interbank-a2a", "Interbank settlement investigation");
  await clickAction(page, "ib.investigation");
  for (const [stage, inspect, stop, block] of [
    ["ib.stage.kickoff", "ib.kickoff.inspect", "ib.kickoff.stop", "ib.rel.kickoff.block"],
    ["ib.stage.report", "ib.report.inspect", "ib.report.stop", "ib.rel.report.block"],
  ]) {
    await clickAction(page, stage);
    await clickAction(page, inspect);
    await expectGroupGeometry(explorer, inspect, [`${inspect}.call`, `${inspect}.api`, `${inspect}.apply`]);
    await expect(explorer.locator(`.react-flow__node[data-id="${stop}"]`)).toBeVisible();
    await visibleEdges(explorer, [block]);
    await noCardOverlap(explorer);
    await clickAction(page, stage, "collapse");
  }

  await page.getByRole("tab", { name: "Use case demo" }).click();
  const integrations = page.locator("#interbank-experience");
  await integrations.getByRole("button", { name: "Bank A gateway", exact: true }).first().click();
  const panel = page.getByRole("dialog", { name: "Bank A gateway source" });
  await expect(panel.getByRole("complementary", { name: "Source inspector" })).toBeVisible();
  await expect(panel.locator(".src-view")).toContainText("bank-a-ingress-from-console");
  await panel.getByRole("button", { name: "bank-a.yaml · bank-a-egress-to-bank-b" }).click();
  await expect(panel.locator(".src-view")).toContainText("bank-a-egress-to-bank-b");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Build, hosting, Return, and answer inspection reveal locally without replacing the root", async ({ page }) => {
  const explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.build");
  await expect(explorer).toHaveAttribute("data-scene-id", "brahe.journey");
  for (const id of ["brahe.build.supervisor", "brahe.build.cards", "brahe.build.card-tool", "brahe.build.card-docs", "brahe.build.score", "brahe.build.score-tool", "brahe.build.score-value", "brahe.build.host"]) await expect(explorer.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible();
  await noCardOverlap(explorer);
  await clickAction(page, "brahe.build.host");
  await expect(explorer.locator('.react-flow__node[data-id="brahe.host.runtime"]')).toBeVisible();
  await expect(explorer.locator('.react-flow__node[data-id="brahe.host.endpoint"]')).toBeVisible();
  await noCardOverlap(explorer);
  await explorer.getByRole("button", { name: "Back" }).click();
  await explorer.getByRole("button", { name: "Back" }).click();
  await clickAction(page, "brahe.stage.return");
  for (const id of ["brahe.return.answer", "brahe.return.inspect", "brahe.answer.evaluate", "brahe.answer.control", "brahe.answer.decision", "brahe.answer.stop"]) await expect(explorer.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible();
  await clickAction(page, "brahe.return.inspect");
  for (const id of ["brahe.inspect.answer.call", "brahe.service.ai-defense", "brahe.inspect.answer.apply"]) await expect(explorer.locator(`.react-flow__node[data-id="${id}"]`)).toBeVisible();
  await noCardOverlap(explorer);
  await expect(explorer).toHaveAttribute("data-scene-id", "brahe.journey");
});

test("Collapse and Back settle every group to the same representation across repeated cycles", async ({ page }) => {
  const branches = [
    { stage: "brahe.stage.check", deep: "brahe.check.inspect", focus: "Cisco AI Defense", required: ["brahe.check.question", "brahe.check.inspect", "brahe.scope.decision", "brahe.scope.stop", "brahe.stage.build"] },
    { stage: "brahe.stage.build", deep: "brahe.build.host", focus: "AI Infrastructure", required: ["brahe.build.question", "brahe.build.supervisor", "brahe.build.draft", "brahe.build.host"] },
    { stage: "brahe.stage.return", deep: "brahe.return.inspect", focus: "Splunk Agent Observability", required: ["brahe.return.answer", "brahe.return.inspect", "brahe.answer.decision", "brahe.answer.stop", "brahe.review"] },
  ];
  for (const branch of branches) {
    let explorer = await openBrahe(page);
    await clickAction(page, "brahe.assistant");
    await explorer.getByRole("radio", { name: branch.focus }).click();
    await clickAction(page, branch.stage);
    const automaticParentViewport = await explorer.locator(".react-flow__viewport").getAttribute("style");
    await clickAction(page, branch.deep);
    await explorer.getByRole("button", { name: "Back" }).click();
    await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", automaticParentViewport ?? "");
    await expectInsideCanvas(explorer, branch.required);
    const backDeep = await normalizedSize(explorer, branch.deep);
    await explorer.getByRole("button", { name: "Back" }).click();
    const backStage = await normalizedSize(explorer, branch.stage);
    await explorer.getByRole("button", { name: "Back" }).click();
    const backAssistant = await normalizedSize(explorer, "brahe.assistant");

    explorer = await openBrahe(page);
    await clickAction(page, "brahe.assistant");
    await explorer.getByRole("radio", { name: branch.focus }).click();
    await clickAction(page, branch.stage);
    await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", automaticParentViewport ?? "");
    await clickAction(page, branch.deep);
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await page.locator(`.react-flow__node[data-id="${branch.deep}"] [data-action="collapse"]`).click();
      await page.waitForTimeout(300);
      expect(await normalizedSize(explorer, branch.deep)).toEqual(backDeep);
      await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", automaticParentViewport ?? "");
      await expectInsideCanvas(explorer, branch.required);
      await clickAction(page, branch.deep);
    }
    await page.locator(`.react-flow__node[data-id="${branch.deep}"] [data-action="collapse"]`).click();
    await page.waitForTimeout(300);
    await page.locator(`.react-flow__node[data-id="${branch.stage}"] [data-action="collapse"]`).click();
    await page.waitForTimeout(300);
    expect(await normalizedSize(explorer, branch.stage)).toEqual(backStage);
    await page.locator('.react-flow__node[data-id="brahe.assistant"] [data-action="collapse"]').click();
    await page.waitForTimeout(300);
    expect(await normalizedSize(explorer, "brahe.assistant")).toEqual(backAssistant);
    await expect(explorer).toHaveAttribute("data-platform-focus", branch.focus === "Cisco AI Defense" ? "cisco-ai-defense" : branch.focus === "AI Infrastructure" ? "ai-infrastructure" : "splunk-agent-observability");
    await expect(page.getByRole("dialog", { name: "Unhandled Script Error" })).toHaveCount(0);
  }
});

test("deep request and answer views keep input, decision, continuation, and stop visible", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    let explorer = await openBrahe(page);
    await clickAction(page, "brahe.assistant");
    await clickAction(page, "brahe.stage.check");
    await clickAction(page, "brahe.check.inspect");
    await expectInsideCanvas(explorer, ["brahe.check.question", "brahe.check.inspect", "brahe.scope.decision", "brahe.scope.stop", "brahe.stage.build"]);
    await visibleEdges(explorer, ["rel.inspect.request.summary", "rel.inspect.request.stop", "rel.scope.allow", "rel.scope.stop"]);
    const requestLabels = await explorer.locator(".map-edge-label").allTextContents();
    for (const label of ["Allowed", "Inspection denied", "Scope denied"]) expect(requestLabels).toContain(label);

    explorer = await openBrahe(page);
    await clickAction(page, "brahe.assistant");
    await clickAction(page, "brahe.stage.return");
    await clickAction(page, "brahe.return.inspect");
    await expectInsideCanvas(explorer, ["brahe.return.answer", "brahe.return.inspect", "brahe.answer.decision", "brahe.answer.stop", "brahe.review"]);
    await visibleEdges(explorer, ["rel.answer.inspect", "rel.inspect.answer.stop", "rel.answer.release", "rel.answer.stop"]);
    const answerLabels = await explorer.locator(".map-edge-label").allTextContents();
    for (const label of ["Allowed", "Inspection denied", "Policy denied"]) expect(answerLabels).toContain(label);
  }
});

test("expanded groups reserve headers and contain their current children", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.check");
  await clickAction(page, "brahe.check.inspect");
  await expectGroupGeometry(explorer, "brahe.stage.check", ["brahe.check.question", "brahe.check.inspect", "brahe.scope.evaluate", "brahe.scope.control", "brahe.scope.decision", "brahe.scope.stop"]);
  await expectGroupGeometry(explorer, "brahe.check.inspect", ["brahe.inspect.request.call", "brahe.service.ai-defense", "brahe.inspect.request.apply"]);

  explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.return");
  await clickAction(page, "brahe.return.inspect");
  await expectGroupGeometry(explorer, "brahe.stage.return", ["brahe.return.answer", "brahe.return.inspect", "brahe.answer.evaluate", "brahe.answer.control", "brahe.answer.decision", "brahe.answer.stop"]);
  await expectGroupGeometry(explorer, "brahe.return.inspect", ["brahe.inspect.answer.call", "brahe.service.ai-defense", "brahe.inspect.answer.apply"]);

  explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.build");
  await clickAction(page, "brahe.build.host");
  await expectGroupGeometry(explorer, "brahe.stage.build", ["brahe.build.question", "brahe.build.supervisor", "brahe.build.draft", "brahe.build.cards", "brahe.build.card-tool", "brahe.build.card-docs", "brahe.build.score", "brahe.build.score-tool", "brahe.build.score-value", "brahe.build.host"]);
  await expectGroupGeometry(explorer, "brahe.build.host", ["brahe.host.runtime", "brahe.host.endpoint"]);
});

test("source open frames the selected local story and facet changes do not move it", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const explorer = await openBrahe(page);
    await clickAction(page, "brahe.assistant");
    await clickAction(page, "brahe.stage.build");
    await clickAction(page, "brahe.build.host");
    const before = await explorer.locator(".react-flow__viewport").getAttribute("style");
    await explorer.locator('.react-flow__node[data-id="brahe.host.runtime"] .map-source-btn').click();
    await expect(explorer.locator(".map-source h3")).toHaveText("Setup excerpt");
    await expect(explorer.locator(".map-source-attrib")).toContainText("Initializes the agent graph, telemetry, and runtime controls");
    await expect(explorer.locator(".src-line").first()).toContainText("banking_telemetry.start");
    await page.waitForTimeout(220);
    const openViewport = await explorer.locator(".react-flow__viewport").getAttribute("style");
    const subjectVisible = await explorer.evaluate((root) => {
      const selected = root.querySelector('.react-flow__node[data-id="brahe.host.runtime"] .map-node')?.getBoundingClientRect();
      const canvas = root.querySelector(".map-canvas")?.getBoundingClientRect();
      const drawer = root.querySelector(".map-source.is-drawer")?.getBoundingClientRect();
      const usableBottom = drawer?.top ?? canvas?.bottom ?? 0;
      return Boolean(selected && canvas
        && selected.left >= canvas.left + 8
        && selected.right <= canvas.right - 8
        && selected.top >= canvas.top + 8
        && selected.bottom <= usableBottom - 8);
    });
    expect(subjectVisible).toBe(true);
    const initiallyVisibleLines = await explorer.locator(".src-line").evaluateAll((lines) => {
      const panel = lines[0]?.closest(".map-source")?.getBoundingClientRect();
      return panel ? lines.filter((line) => {
        const rect = line.getBoundingClientRect();
        return rect.top >= panel.top && rect.bottom <= panel.bottom;
      }).length : 0;
    });
    expect(initiallyVisibleLines).toBeGreaterThanOrEqual(6);
    const sourcePanel = explorer.getByRole("complementary", { name: "Source inspector" });
    await sourcePanel.getByRole("button", { name: "Expand" }).click();
    await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", openViewport ?? "");
    await sourcePanel.getByRole("button", { name: "Collapse" }).click();
    await explorer.getByRole("button", { name: "Close source" }).click();
    await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", before ?? "");
  }
});

test("Card specialist defaults to its own evidence without inherited platform menus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.build");
  await explorer.locator('.react-flow__node[data-id="brahe.build.cards"] .map-source-btn').click();
  await expect(explorer.locator(".map-source-attrib")).toContainText("Card specialist");
  await expect(explorer.locator(".map-source-attrib")).not.toContainText("Cisco AI Defense");
  await expect(explorer.locator(".map-source-switch button")).toHaveCount(0);
  await expect(explorer.locator(".src-line").first()).toContainText("create_react_agent");
  const codeInitiallyVisible = await explorer.locator(".src-view").evaluate((element) => {
    const panel = element.closest(".map-source")?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return Boolean(panel && rect.top < panel.bottom);
  });
  expect(codeInitiallyVisible).toBe(true);
  const visibleLines = await explorer.locator(".src-line").evaluateAll((lines) => {
    const panel = lines[0]?.closest(".map-source")?.getBoundingClientRect();
    return panel ? lines.filter((line) => {
      const rect = line.getBoundingClientRect();
      return rect.top >= panel.top && rect.bottom <= panel.bottom;
    }).length : 0;
  });
  expect(visibleLines).toBeGreaterThanOrEqual(6);
});

test("Environment details use the bounded panel host without growing map chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.check");
  await clickAction(page, "brahe.check.inspect");
  const before = await explorer.evaluate((root) => ({
    contextHeight: root.querySelector(".map-context")?.getBoundingClientRect().height,
    canvasHeight: root.querySelector(".map-canvas")?.getBoundingClientRect().height,
    viewport: root.querySelector(".react-flow__viewport")?.getAttribute("style"),
  }));
  await explorer.getByRole("button", { name: "Environment details" }).click();
  await expect(explorer.getByRole("complementary", { name: "Environment details" })).toBeVisible();
  const withPanel = await explorer.evaluate((root) => ({
    contextHeight: root.querySelector(".map-context")?.getBoundingClientRect().height,
    canvasHeight: root.querySelector(".map-canvas")?.getBoundingClientRect().height,
    panel: root.querySelector(".map-environment-panel")?.getBoundingClientRect(),
    stage: root.querySelector(".map-stage")?.getBoundingClientRect(),
  }));
  expect(withPanel.contextHeight).toBe(before.contextHeight);
  expect(withPanel.canvasHeight).toBe(before.canvasHeight);
  expect(withPanel.panel && withPanel.stage && withPanel.panel.top >= withPanel.stage.top && withPanel.panel.bottom <= withPanel.stage.bottom).toBe(true);
  await explorer.getByRole("button", { name: "Close details" }).click();
  await expect(explorer.locator(".react-flow__viewport")).toHaveAttribute("style", before.viewport ?? "");
});

test("full browser 1440 and 1280 views keep the explorer and source panel contained", async ({ page }) => {
  await mkdir("artifacts/explorer", { recursive: true });
  const explorer = await openBrahe(page);
  await page.screenshot({ path: "artifacts/explorer/continuous-full-1440.png", fullPage: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await explorer.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/explorer/continuous-full-1280.png", fullPage: false });
  const viewport = await page.evaluate(() => {
    const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
    const map = document.querySelector("[data-testid='architecture-explorer']")?.getBoundingClientRect();
    return { topbar: topbar?.bottom ?? 0, top: map?.top ?? 0, bottom: map?.bottom ?? 0, height: innerHeight };
  });
  expect(viewport.top).toBeGreaterThanOrEqual(viewport.topbar);
  expect(viewport.bottom).toBeLessThanOrEqual(viewport.height + 2);
  await clickAction(page, "brahe.assistant");
  await clickAction(page, "brahe.stage.check");
  const scrollY = await page.evaluate(() => window.scrollY);
  await explorer.locator('.react-flow__node[data-id="brahe.scope.control"] .map-source-btn').click();
  const contained = await explorer.evaluate((root) => {
    const stage = root.querySelector(".map-stage")?.getBoundingClientRect();
    const source = root.querySelector(".map-source")?.getBoundingClientRect();
    return Boolean(stage && source && source.top >= stage.top && source.bottom <= stage.bottom);
  });
  expect(contained).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  const code = explorer.locator(".src-view");
  await expect(code).toBeVisible();
  const codeInside = await code.evaluate((element) => {
    const source = element.closest(".map-source")?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return Boolean(source && rect.top < source.bottom);
  });
  expect(codeInside).toBe(true);
});

test("normal and reduced-motion interrupted navigation settles without stale work", async ({ browser }) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const context = await browser.newContext({
      baseURL: process.env.STUDIO_URL ?? "http://127.0.0.1:4200",
      viewport: { width: 1280, height: 800 },
      reducedMotion,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      (globalThis as typeof globalThis & { __rawWindowErrors?: string[] }).__rawWindowErrors = [];
      window.addEventListener("error", (event) => {
        (globalThis as typeof globalThis & { __rawWindowErrors?: string[] }).__rawWindowErrors?.push(event.message);
      }, true);
    });
    const explorer = await openBrahe(page);
    await page.locator('[data-id="brahe.assistant"] [data-action="expand"]').click();
    await page.waitForTimeout(40);
    await page.locator('[data-id="brahe.stage.check"] [data-action="expand"]').click();
    await page.waitForTimeout(40);
    await page.locator('[data-id="brahe.check.inspect"] [data-action="expand"]').click();
    await page.waitForTimeout(30);
    await page.locator('[data-id="brahe.check.inspect"] [data-action="collapse"]').click();
    await page.waitForTimeout(30);
    await page.locator('[data-id="brahe.check.inspect"] [data-action="expand"]').click();
    await page.waitForTimeout(500);
    await expect(explorer).toHaveAttribute("data-expanded-groups", "group.assistant,group.check,group.request-inspection");
    await expectInsideCanvas(explorer, ["brahe.check.question", "brahe.scope.decision", "brahe.scope.stop", "brahe.stage.build"]);
    expect(await page.evaluate(() => (globalThis as typeof globalThis & { __rawWindowErrors?: string[] }).__rawWindowErrors)).toEqual([]);
    await expect(page.getByRole("dialog", { name: "Unhandled Script Error" })).toHaveCount(0);
    await context.close();
  }
});

test("animation-enabled expansion recording preserves one React Flow", async ({ browser }) => {
  await mkdir("artifacts/explorer", { recursive: true });
  const context = await browser.newContext({
    baseURL: process.env.STUDIO_URL ?? "http://127.0.0.1:4200",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    recordVideo: { dir: "artifacts/explorer", size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const explorer = await openBrahe(page);
  await clickAction(page, "brahe.assistant");
  await page.waitForTimeout(450);
  await clickAction(page, "brahe.stage.check");
  await page.waitForTimeout(450);
  await explorer.locator('.react-flow__node[data-id="brahe.scope.control"] .map-source-btn').click();
  await explorer.locator(".src-view").waitFor();
  await page.waitForTimeout(450);
  await explorer.getByRole("button", { name: "Close source" }).click();
  await explorer.getByRole("button", { name: "Back" }).click();
  await expect(page.locator(".react-flow")).toHaveCount(1);
  await context.close();
});

test("expansion timing separates input, projection, visibility, and local motion", async ({ page }) => {
  const explorer = await openBrahe(page);
  const started = performance.now();
  await page.locator('.react-flow__node[data-id="brahe.assistant"] [data-action="expand"]').click();
  const playwrightClickResolvedMs = Math.round(performance.now() - started);
  await page.waitForTimeout(350);
  const timing = await page.evaluate(() => (globalThis as typeof globalThis & { __mapExpansionTiming?: Record<string, number | null> }).__mapExpansionTiming);
  expect(timing).toBeTruthy();
  expect(timing?.inputToHandlerMs).not.toBeNull();
  expect(timing?.projectionMs).toBeGreaterThanOrEqual(0);
  expect(timing?.commitToVisibleMs).toBeGreaterThanOrEqual(0);
  expect(timing?.localMotionMs).toBeGreaterThanOrEqual(0);
  expect(timing?.totalAppMs).toBeGreaterThan(0);
  expect(playwrightClickResolvedMs).toBeGreaterThanOrEqual(0);
  const beforeFocus = await page.evaluate(() => (globalThis as typeof globalThis & { __mapExpansionTiming?: Record<string, number | null> }).__mapExpansionTiming);
  await explorer.getByRole("radio", { name: "Cisco AI Defense" }).click();
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __mapExpansionTiming?: Record<string, number | null> }).__mapExpansionTiming)).toEqual(beforeFocus);
});
