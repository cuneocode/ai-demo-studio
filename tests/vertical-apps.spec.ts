import { expect, test } from '@playwright/test';
import { apps } from '../config/apps.ts';
import { switchIndustryApp } from './app-navigation';

const failures = (page: import('@playwright/test').Page) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
};

test('launcher exposes five apps, shared platform routes, and the new product identity', async ({ page }) => {
  const errors = failures(page);
  await page.goto('/');
  await expect(page).toHaveTitle('AI Demo Studio');
  await expect(page.getByRole('heading', { name: 'Industry apps', exact: true })).toBeVisible();
  for (const app of apps) await expect(page.getByRole('link', { name: `Open ${app.name} app`, exact: true })).toHaveAttribute('href', `/apps/${app.id}`);
  await expect(page.getByRole('region', { name: 'Shared platform services' })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const app of apps.slice(1)) {
  test(`${app.name} has scoped empty libraries, stories, controls, telemetry, and settings`, async ({ page }) => {
    const errors = failures(page);
    const mutations: string[] = [];
    page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/studio/services')) mutations.push(request.url()); });
    await page.goto(`/apps/${app.id}`);
    await expect(page).toHaveTitle(`${app.name} | AI Demo Studio`);
    const navigation = page.locator('.side-nav');
    await expect(navigation.getByRole('link', { name: 'All industry apps', exact: true })).toHaveAttribute('href', '/');
    for (const industry of apps) await expect(navigation.getByRole('button', { name: industry.name, exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No use cases added yet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open company briefing', exact: true })).toHaveCount(0);
    await expect(page.getByText('Explore by domain', { exact: true })).toHaveCount(0);
    await page.locator('.side-nav').getByRole('button', { name: 'Use case library', exact: true }).click();
    await expect(page).toHaveURL(`/apps/${app.id}/library`);
    await expect(page.getByRole('heading', { name: 'No use cases added yet' })).toBeVisible();
    await page.locator('.side-nav').getByRole('button', { name: /Story builder/ }).click();
    await expect(page.getByRole('heading', { name: 'No stories added yet' })).toBeVisible();
    await page.getByRole('button', { name: 'Controls', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Runtime controls' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Runtime controls by use case' }).getByRole('row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Telemetry', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Telemetry by use case' }).getByRole('row')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Recent interbank investigations' })).toHaveCount(0);
    await page.locator('.side-nav').getByRole('button', { name: 'Studio settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: `${app.name} settings` })).toBeVisible();
    await expect(page.getByText('This app has no executable demos yet.')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Use case overrides' }).getByRole('row')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Apply to running stacks' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'platform settings', exact: true })).toHaveAttribute('href', '/settings');
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const width of [1440, 390]) {
  test(`industry navigation returns to Studio home and retains demo drafts at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/apps/fsi');
    const navigation = page.locator('.side-nav');
    if (width < 901) await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    await expect(navigation.getByRole('link', { name: 'All industry apps', exact: true })).toBeVisible();
    await expect(navigation.getByText('Industry apps', { exact: true })).toHaveCount(0);
    for (const industry of apps) await expect(navigation.getByRole('button', { name: industry.name, exact: true })).toHaveCount(0);
    await expect(page.locator('.sidebar-platform')).not.toContainText('Status unavailable');
    await page.screenshot({ path: info.outputPath(`fsi-navigation-dark-${width}.png`) });
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: info.outputPath(`fsi-navigation-light-${width}.png`) });
    await navigation.getByRole('link', { name: 'All industry apps', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Industry apps', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar')).not.toHaveClass(/\bopen\b/);
    for (const industry of apps) await expect(page.getByRole('link', { name: `Open ${industry.name} app`, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Open Financial Services app', exact: true }).click();
    await page.getByRole('button', { name: 'Open Brahe Bank assistant experience', exact: true }).click();
    await page.getByLabel('Message Brahe Bank').fill('Keep this draft when I return to Studio home');
    await page.getByRole('link', { name: 'AI Demo Studio home', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.getByRole('link', { name: 'Open Financial Services app', exact: true }).click();
    await page.getByRole('button', { name: 'Open Brahe Bank assistant experience', exact: true }).click();
    await expect(page.getByLabel('Message Brahe Bank')).toHaveValue('Keep this draft when I return to Studio home');
    if (width >= 901) {
      await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
      await expect(navigation.getByRole('link', { name: 'All industry apps', exact: true })).toBeVisible();
      await navigation.getByRole('link', { name: 'All industry apps', exact: true }).click();
      await expect(page).toHaveURL('/');
    }
  });
}

test('app launcher and keyboard search expose the Studio homepage', async ({ page }) => {
  await page.goto('/apps/fsi');
  await page.getByRole('button', { name: 'Open app launcher', exact: true }).click();
  await page.getByRole('dialog', { name: 'App launcher', exact: true }).getByRole('button', { name: 'All industry apps', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: 'Open Financial Services app', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('textbox', { name: 'Search demos and pages', exact: true }).fill('dashboard');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Industry apps', exact: true })).toBeVisible();
});

test('deep links and reload retain the demo tab; browser history returns to the owning app', async ({ page }) => {
  const errors = failures(page);
  await page.goto('/apps/fsi/library');
  await page.getByRole('button', { name: 'Open Brahe Bank assistant experience', exact: true }).click();
  await expect(page).toHaveURL('/apps/fsi/demos/brahe-bank');
  await page.getByLabel('Message Brahe Bank').fill('Keep this draft across tabs and apps');
  await page.getByRole('tab', { name: 'Architecture', exact: true }).click();
  await expect(page).toHaveURL('/apps/fsi/demos/brahe-bank?tab=architecture');
  await expect(page.locator('iframe[title*="architecture canvas"]')).toBeVisible();
  await page.getByRole('tab', { name: 'Use case demo', exact: true }).click();
  await expect(page.getByLabel('Message Brahe Bank')).toHaveValue('Keep this draft across tabs and apps');
  await switchIndustryApp(page, 'Healthcare');
  await expect(page).toHaveURL('/apps/healthcare');
  await expect(page.getByRole('heading', { name: 'Healthcare', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Message Brahe Bank')).toHaveValue('Keep this draft across tabs and apps');
  await page.getByRole('tab', { name: 'Capacity planning', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Capacity planning', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: /Capacity planning for Brahe Bank assistant/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a live reply finishes across an app switch and survives refresh with one stats observation', async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let sends = 0;
  const mutations: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/studio/services') && request.method() !== 'GET') mutations.push(request.url()); });
  await page.route('**/api/banking/chat', async route => {
    sends++;
    await gate;
    await route.fulfill({ json: { session_id: 'shared-session-1', answer: 'Orbit Basic has no annual fee.', sources: [], trace: [], duration_ms: 900,
      usage: { llm_calls: 2, input_tokens: 100, output_tokens: 20 }, served_by: { provider: 'qa', label: 'QA model', model: 'qa-model', private: true } } });
  });
  await page.goto('/apps/fsi/demos/brahe-bank');
  await page.getByLabel('Message Brahe Bank').fill('What is the annual fee?');
  await page.getByLabel('Message Brahe Bank').press('Enter');
  await expect.poll(() => sends).toBe(1);
  await switchIndustryApp(page, 'Manufacturing');
  await expect(page.getByRole('heading', { name: 'Manufacturing', exact: true })).toBeVisible();
  release!();
  await page.goBack();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('Orbit Basic has no annual fee.');
  await page.reload();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(1);
  await expect(page.locator('.chat-message.assistant').last()).toContainText('Orbit Basic has no annual fee.');
  await expect(page.getByRole('region', { name: 'Live run stats', exact: true })).toContainText('2');
  expect(sends).toBe(1); expect(mutations).toEqual([]);
});

test('host denies cross-app runtime, recording and settings writes without changing configuration', async ({ request }) => {
  for (const path of ['/api/sar/health?app=healthcare', '/api/wealth/health?app=healthcare', '/api/studio/recordings/sar?app=healthcare', '/api/studio/examples/fraud/scenarios?app=healthcare']) expect((await request.get(path)).status()).toBe(403);
  for (const action of ['start', 'stop', 'restart', 'build', 'apply', 'prepare', 'controls']) expect((await request.post('/api/studio/services?app=healthcare', { data: { action, ids: ['sar'] } })).status()).toBe(403);
  const before = await request.get('/api/studio/models').then(response => response.json());
  expect((await request.patch('/api/studio/models?app=healthcare', { data: { revision: before.revision, routes: { 'sar-support': { externalPolicy: 'deny' } } } })).status()).toBe(403);
  const after = await request.get('/api/studio/models').then(response => response.json());
  expect(after.revision).toEqual(before.revision);
});

test('unknown apps and cross-app deep links provide a usable recovery route', async ({ page }) => {
  for (const route of ['/apps/missing', '/apps/healthcare/demos/sar-support']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Page unavailable', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All industry apps', exact: true })).toBeVisible();
  }
});

for (const width of [1440, 390]) {
  test(`launcher and empty app remain usable in both themes at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Open Public Sector app', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.locator(".sidebar-platform")).not.toContainText("Status unavailable");
    await page.screenshot({ path: info.outputPath(`apps-dark-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.locator('.industry-app-card').first().evaluate(element => { const values = getComputedStyle(element).backgroundColor.match(/\d+/g) ?? []; return values.slice(0, 3).every(value => Number(value) > 220); })).toBe(true);
    await page.screenshot({ path: info.outputPath(`apps-light-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Open Retail app', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Retail', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`retail-light-${width}.png`), fullPage: true });
  });
}

test('company context and product navigation fit the desktop header', async ({ page }) => {
  await page.goto('/apps/fsi');
  const company = page.getByRole('button', { name: 'Open company briefing', exact: true });
  await expect(company).toBeVisible();
  for (const width of [1440, 1250, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const company = document.querySelector('.tenant-switcher')!.getBoundingClientRect();
      const label = document.querySelector('.tenant-switcher > span')!.getBoundingClientRect();
      const chevron = document.querySelector('.tenant-switcher svg')!.getBoundingClientRect();
      const nav = document.querySelector('.product-nav')!.getBoundingClientRect();
      return { companyRight: company.right, labelRight: label.right, chevronLeft: chevron.left, chevronRight: chevron.right, navLeft: nav.left, width: company.width };
    });
    expect(layout.companyRight).toBeLessThan(layout.navLeft - 8);
    expect(layout.labelRight).toBeLessThanOrEqual(layout.chevronLeft);
    expect(layout.chevronRight).toBeLessThanOrEqual(layout.companyRight);
    expect(layout.width).toBeGreaterThan(60);
  }
});
