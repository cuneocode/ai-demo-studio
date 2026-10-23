import { expect, type Page } from "@playwright/test";
import type { CanvasDocument } from "../app/map/drawio/model.ts";
import { canvasScopePath } from "../app/map/drawio/canvas-layout.ts";

export const diagram = (page: Page) => page.frameLocator('iframe[src="/diagrams/viewer.html"]');
export const component = (page: Page, id: string) => diagram(page).locator(`[data-cell-id="${id}"]`);
export async function openCanvas(page: Page, title = "Brahe Bank assistant") {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: new RegExp(`^Open ${title} experience`) }).click();
  await page.getByRole("tab", { name: "Architecture", exact: true }).click();
  const explorer = page.getByTestId("architecture-explorer");
  await expect(explorer).toHaveAttribute("data-renderer", "drawio");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await explorer.getByRole("button", { name: "Full screen diagram" }).click();
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  return explorer;
}
export async function expandTo(page: Page, doc: CanvasDocument, scopeId: string) {
  const explorer = page.getByTestId("architecture-explorer");
  const reset = explorer.getByRole("button", { name: "Collapse all", exact: true });
  if (await reset.count()) { await reset.click(); await expect(explorer).toHaveAttribute("data-phase", "idle"); }
  for (const id of canvasScopePath(doc, scopeId).slice(1)) {
    const ownerId = doc.scopes[id].ownerId!;
    const owner = doc.items[ownerId];
    if (owner.layer) {
      const toggle = explorer.getByRole("button", { name: owner.layer === "security" ? "Security" : owner.layer === "observability" ? "Observability" : "AI Infrastructure", exact: true });
      if (await toggle.getAttribute("aria-pressed") === "false") await toggle.click();
      await expect(explorer).toHaveAttribute("data-phase", "idle");
    }
    await component(page, ownerId).press("Enter");
    await expect(explorer).toHaveAttribute("data-scope-id", id);
    await expect(explorer).toHaveAttribute("data-phase", "idle");
  }
}
