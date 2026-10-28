import { expect, test, type Page } from "@playwright/test";

const demos = [
  { id: "interbank-a2a", ready: ".ib-controls", surfaces: [".ib-controls", ".ib-prompt textarea", ".ib-terminal", ".ib-terminal > header"] },
  { id: "brahe-bank", ready: ".chat-card", surfaces: [".chat-card", ".chat-composer input"] },
  { id: "fraud-modeling", ready: ".fx-queue", surfaces: [".fx-queue", ".fx-scenario"] },
  { id: "company-briefing", ready: ".briefing-card", surfaces: [".briefing-card", ".briefing-search input"] },
  { id: "market-research", ready: ".mr-start", surfaces: [".mr-start", ".mr-ticker input"] },
  { id: "client-advisory", ready: ".ax-context", surfaces: [".ax-context", ".ax-households label"] },
  { id: "sar-support", ready: ".sar-demo", surfaces: [".sar-card", ".sar-runtime"] },
  { id: "code-vulnerability", ready: ".cv-panel", surfaces: [".cv-panel", ".cv-status"] },
];

async function assertSurfaces(page: Page, selectors: string[], light?: boolean) {
  const observations = await page.evaluate((selectors) => {
    const rgba = (color: string) => color.match(/[\d.]+/g)!.map(Number);
    const luminance = (color: number[]) => color.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const background = (element: Element | null): number[] => {
      if (!element) return [255, 255, 255];
      const color = rgba(getComputedStyle(element).backgroundColor);
      const alpha = color[3] ?? 1;
      if (alpha === 1) return color;
      return background(element.parentElement).map((value, index) => color[index] * alpha + value * (1 - alpha));
    };
    return selectors.map(selector => {
      const element = document.querySelector(`#case-panel-demo ${selector}`);
      if (!element) return { selector, missing: true, luminance: 0, contrast: 0 };
      const bg = luminance(background(element));
      const ink = luminance(rgba(getComputedStyle(element).color));
      return { selector, missing: false, luminance: bg, contrast: (Math.max(bg, ink) + 0.05) / (Math.min(bg, ink) + 0.05) };
    });
  }, selectors);
  for (const observation of observations) {
    expect(observation.missing, `${observation.selector} exists`).toBe(false);
    expect(observation.contrast, `${observation.selector} text contrast`).toBeGreaterThanOrEqual(4.5);
    if (light) expect(observation.luminance, `${observation.selector} light surface`).toBeGreaterThan(0.6);
    else if (light === false) expect(observation.luminance, `${observation.selector} dark surface`).toBeLessThan(0.18);
  }
}

for (const width of [1440, 390]) {
  for (const demo of demos) {
    test(`${demo.id}: rendered surfaces follow both themes at ${width}px`, async ({ page }, info) => {
      const assertTheme = async (light: boolean) => {
        await assertSurfaces(page, demo.surfaces, light);
        if (demo.id === "interbank-a2a") await assertSurfaces(page, [".ib-synthetic-note", ".ib-primary", ".ib-lab-state", ".ib-empty"]);
      };
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/apps/fsi/demos/${demo.id}`);
      await expect(page.locator(`#case-panel-demo ${demo.ready}`).first()).toBeVisible();
      await assertTheme(false);
      await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await expect(async () => assertTheme(true)).toPass({ timeout: 15_000 });
      await page.screenshot({ path: info.outputPath(`${demo.id}-light-${width}.png`), fullPage: true });
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await expect(page.locator(`#case-panel-demo ${demo.ready}`).first()).toBeVisible();
      await assertTheme(true);
      await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
      await assertTheme(false);
      await page.screenshot({ path: info.outputPath(`${demo.id}-dark-${width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        width: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("#case-panel-demo *")].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(element => ({ className: element.className, width: element.getBoundingClientRect().width })),
      }));
      expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(width + 1);
    });
  }
}
