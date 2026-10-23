import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { architectureDiagrams } from "../app/map/drawio/registry.ts";
import { composeCanvas } from "../app/map/drawio/canvas.ts";
import { canvasScopePath, visibleCanvasItems } from "../app/map/drawio/canvas-layout.ts";
import { component, diagram, expandTo, openCanvas } from "./drawio-helpers";

const titles: Record<string, string> = {
  "code-vulnerability": "Code vulnerability analysis", "brahe-bank": "Brahe Bank assistant", "fraud-modeling": "Card fraud triage",
  "company-briefing": "Company briefing", "market-research": "Market research", "client-advisory": "Advisor meeting prep",
  "kyc-processing": "KYC processing", "sar-support": "SAR investigation", "transaction-llm": "Transaction intelligence", "interbank-a2a": "Interbank settlement investigation",
};
test.use({ actionTimeout: 15000 });
for (const [caseId, definition] of Object.entries(architectureDiagrams)) {
  test(`${caseId}: one continuous draw.io canvas preserves context through every expansion`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const explorer = await openCanvas(page, titles[caseId]);
    const doc = composeCanvas(definition.pages, definition.catalog);
    const modes = definition.catalog.scenes[definition.catalog.rootSceneId].modes;
    await expect(explorer).toHaveAttribute("data-mode", modes[0]);
    const native = diagram(page).locator("#canvas");
    const stableScene = await explorer.getAttribute("data-scene-id");
    await component(page, doc.scopes[doc.rootScopeId].cellIds[0]).evaluate(element => element.setAttribute("data-persistent", "yes"));
    await mkdir(`artifacts/drawio/continuous/${caseId}`, { recursive: true });
    for (const scope of Object.values(doc.scopes)) {
      await expandTo(page, doc, scope.id);
      await expect(explorer).toHaveAttribute("data-phase", "idle");
      await expect(explorer).toHaveAttribute("data-scene-id", stableScene!);
      await expect(native).toHaveAttribute("data-model-loads", "1");
      const expanded = canvasScopePath(doc, scope.id).slice(1);
      const activeLayers = (await explorer.locator('.drawio-layers button[aria-pressed="true"]').allTextContents()).map(label => label === "AI Infrastructure" ? "deployment" : label.toLowerCase()) as ("security" | "observability" | "deployment")[];
      const visible = visibleCanvasItems(doc, expanded, modes[0], activeLayers);
      await expect(diagram(page).locator("[data-cell-id]")).toHaveCount(visible.length);
      for (const item of visible) await expect(component(page, item.id)).toBeVisible();
      await expect(component(page, doc.scopes[doc.rootScopeId].cellIds[0])).toHaveAttribute("data-persistent", "yes");
      const boxes = await diagram(page).locator("[data-cell-id]").evaluateAll(elements => Object.fromEntries(elements.map(item => [item.getAttribute("data-cell-id")!, item.getBoundingClientRect().toJSON()])));
      // Every immediate sibling remains distinct; descendants stay inside their owner.
      for (const parent of Object.values(doc.scopes).filter(item => item.id === doc.rootScopeId || expanded.includes(item.id))) {
        const ids = parent.cellIds.filter(id => boxes[id]);
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const a = boxes[ids[i]], b = boxes[ids[j]];
          expect(a.right <= b.left + 2 || b.right <= a.left + 2 || a.bottom <= b.top + 2 || b.bottom <= a.top + 2, `${scope.id}: sibling overlap ${ids[i]} / ${ids[j]}`).toBe(true);
        }
        if (parent.ownerId && boxes[parent.ownerId]) for (const id of ids) {
          const owner = boxes[parent.ownerId], child = boxes[id];
          expect(child.left >= owner.left - 2 && child.right <= owner.right + 2 && child.top >= owner.top - 2 && child.bottom <= owner.bottom + 2, `${scope.id}: ${id} escapes ${parent.ownerId}`).toBe(true);
        }
      }
      const overflow = await diagram(page).locator("[data-label-for]").evaluateAll(elements => elements.flatMap(label => {
        const id = label.getAttribute("data-label-for");
        const shape = document.querySelector(`[data-cell-id="${id}"]`)!.getBoundingClientRect();
        const text = label.querySelector('div[style*="display: inline-block"]')!.getBoundingClientRect();
        return text.top < shape.top - 4 || text.bottom > shape.bottom + 4 || text.left < shape.left - 4 || text.right > shape.right + 4 ? [id] : [];
      }));
      expect(overflow, `${caseId}/${scope.id}: label overflow`).toEqual([]);
      await page.screenshot({ path: `artifacts/drawio/continuous/${caseId}/${scope.id}.png` });
      const leaf = visible.find(item => item.scopeId === scope.id && !item.childScopeId && !item.targetPageId);
      if (leaf) {
        const before = await native.getAttribute("data-camera");
        await component(page, leaf.id).press("Enter");
        await expect(explorer.getByRole("complementary")).toBeVisible();
        await expect(native).toHaveAttribute("data-camera", before!);
        await explorer.getByRole("button", { name: "Back", exact: true }).click();
        await expect(explorer.getByRole("complementary")).toHaveCount(0);
        await expect(native).toHaveAttribute("data-camera", before!);
      }
      if (scope.id === "system") {
        const before = await native.getAttribute("data-camera");
        for (const toggle of await explorer.locator(".drawio-layers button").all()) {
          if (await toggle.getAttribute("aria-pressed") === "false") await toggle.click();
          await expect(explorer).toHaveAttribute("data-phase", "idle");
          await expect(native).toHaveAttribute("data-camera", before!);
        }
        await page.screenshot({ path: `artifacts/drawio/continuous/${caseId}/system-layers.png` });
      }
    }
    for (const mode of modes) {
      await explorer.getByRole("button", { name: mode === "implemented" ? "Implemented" : "Proposed", exact: true }).click();
      await expect(explorer).toHaveAttribute("data-phase", "idle");
      await expect(native).toHaveAttribute("data-model-loads", "1");
    }
    await explorer.getByRole("button", { name: "Environment details" }).click();
    await expect(explorer.getByRole("complementary", { name: "Environment details" })).toBeVisible();
    await explorer.getByRole("button", { name: "Back", exact: true }).click();
    await expect(explorer.getByRole("complementary")).toHaveCount(0);
    await expect(explorer.getByRole("link", { name: "Editable diagram" })).toHaveAttribute("href", definition.asset);
    expect(errors).toEqual([]);
  });
}
