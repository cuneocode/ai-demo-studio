import type { Page } from '@playwright/test';

/** Industry switching stays in the platform launcher while each sidebar stays local. */
export async function switchIndustryApp(page: Page, name: string) {
  await page.getByRole('button', { name: 'Open app launcher', exact: true }).click();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('dialog', { name: 'App launcher', exact: true })
    .getByRole('button', { name: new RegExp(`^${escaped}(?:\\s|$)`) }).click();
}
