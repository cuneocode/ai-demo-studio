import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { normalizeContent, mergeContent, resolveEntries, safeUrl, guideDestination } from '../config/content/contract.ts';
import { contentSnapshot } from '../scripts/studio-content-api.ts';
import { handleStudioApi } from '../scripts/studio-api.ts';
import { exportContent, writeContentExport } from '../scripts/studio-content-export.ts';
import { demoDefinitions } from '../config/demos.ts';
import { apps, appForDemo } from '../config/apps.ts';
import { parseStudioRoute, studioPath } from '../app/studio/route.ts';
import { resolvedCatalogForApp } from '../app/studio/catalog.ts';
const fixture = name => readFile(new URL(`../fixtures/content/${name}.json`, import.meta.url), 'utf8').then(JSON.parse);
const installed = demoDefinitions.map(demo => ({ id: demo.id, appId: appForDemo(demo.id).id }));
const appIds = apps.map(app => app.id);
function request(url, { method = 'GET', body, cookie, origin } = {}) {
  return new Promise((resolve, reject) => {
    const req = new PassThrough(); Object.assign(req, { url, method, headers: { host: 'localhost:4205', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) }, socket: {} });
    const headers = {};
    const res = { headersSent: false, setHeader: (name, value) => { headers[name.toLowerCase()] = value; }, writeHead(status, values) { this.status = status; Object.assign(headers, values); this.headersSent = true; }, end(value) { resolve({ status: this.status, headers, body: value ? JSON.parse(value) : null }); } };
    if (!handleStudioApi(req, res)) return reject(new Error('Unhandled route'));
    req.end(body === undefined ? '' : JSON.stringify(body));
  });
}

test('legacy documents retain unknown fields, inherit audience content and sanitize URLs', async () => {
  const doc = normalizeContent(await fixture('neil-dev-studios'));
  assert.equal(doc.usecases[0].specialist.tagline, doc.usecases[0].tagline);
  assert.equal(doc.usecases[1].specialist.tagline, 'Inspect evidence retrieval and approval controls.');
  assert.equal(doc.build.views.specialist.label, 'Specialist');
  assert.equal(doc.build.views.specialist.note, doc.build.views.customer.note);
  assert.equal(doc.build.guide[0].specialist, doc.build.guide[0].text);
  assert.equal(doc.usecases[0].workspaces.length, 1);
  for (const value of ['javascript:alert(1)', '//evil.invalid', '/\\evil.invalid', 'https://user:pass@example.invalid', '/path\nother']) assert.equal(safeUrl(value), undefined);
  assert.equal(safeUrl('/assistant/'), '/assistant/');
  assert.throws(() => normalizeContent({ usecases: 'invalid' }), /list/);
  assert.throws(() => normalizeContent({ title: [] }), /string/);
  assert.throws(() => normalizeContent({ usecases: [{ id: 'same' }, { id: 'same' }] }), /Duplicate/);
  assert.throws(() => normalizeContent(JSON.parse('{"__proto__":{}}')), /Reserved/);
  assert.throws(() => normalizeContent({ 'x-studio': { schemaVersion: 2 } }), /schemaVersion/);
  assert.deepEqual(mergeContent({ title: 'old', nested: { a: 1, b: 2 }, usecases: [1] }, { title: null, nested: { b: 3 }, usecases: [] }), { nested: { a: 1, b: 3 }, usecases: [] });
});

test('legacy application summaries and external entries use the canonical app routes', async () => {
  const doc = normalizeContent(await fixture('neil-industry-apps'));
  const entries = resolveEntries(doc, { id: 'industry-apps' }, installed, appIds);
  assert.equal(entries[0].appId, 'fsi'); assert.equal(entries[1].appId, 'retail');
  assert.equal(entries[0].nativeDemoId, undefined);
  const route = `/apps/fsi/demos/${entries[0].id}`;
  assert.equal(parseStudioRoute(route, '', entries).valid, true);
  assert.equal(parseStudioRoute(route.replace('/fsi/', '/retail/'), '', entries).valid, false);
  assert.equal(studioPath('fsi', 'overview', entries[0].id, entries), route);
  assert.equal(guideDestination('uc/fsi/arch', entries), `${route}?tab=architecture`);
  assert.equal(guideDestination('https://evil.invalid', entries), null);
  assert.equal(guideDestination('library', entries), '/');
  assert.equal(guideDestination('library', [entries[0]]), '/apps/fsi/library');
  const left = resolveEntries(normalizeContent({ usecases: [{ id: 'c' }] }), { id: 'a-b' }, installed, appIds)[0];
  const right = resolveEntries(normalizeContent({ usecases: [{ id: 'b-c' }] }), { id: 'a' }, installed, appIds)[0];
  assert.notEqual(left.id, right.id);
  assert.equal(resolvedCatalogForApp('fsi', entries).length, apps.find(app => app.id === 'fsi').catalog.length + 1);
  assert.equal(resolvedCatalogForApp('retail', entries).length, 1);
});

test('exports preserve current library ownership, native identities and rich content deterministically', () => {
  const exported = exportContent('https://studio.example/', 'example/studio');
  assert.deepEqual(exported, exportContent('https://studio.example/', 'example/studio'));
  const combined = exported.find(item => item.module.id === 'industry-apps');
  const doc = normalizeContent(combined.document);
  const entries = resolveEntries(doc, combined.module, installed, appIds);
  assert.equal(entries.length, demoDefinitions.length);
  assert.equal(entries.find(item => item.id === 'code-vulnerability').appId, 'cyber-ai-foundry');
  assert.equal(entries.find(item => item.id === 'sar-support').nativeDemoId, 'sar-support');
  const sar = doc.usecases.find(item => item.id === 'sar-support')['x-studio'];
  assert.ok(sar.narrative.references.length); assert.ok(sar.presenter.cisco); assert.ok(sar.tours.length); assert.ok(sar.frame.liveExperience);
  assert.ok(Buffer.byteLength(JSON.stringify(combined.document, null, 2)) < 256 * 1024);
  assert.throws(() => exportContent('javascript:alert(1)'), /origin/);
  assert.equal(combined.module.base, 'phoenix'); assert.equal(combined.module.entry, 'app/site/index.html');
  const template = { usecases: [{ id: 'old' }], ask: [['Library', 'Choose a workflow', 'library']], layers: [], scale: { defaults: { population: 1 } }, build: { extra: 'host data' } };
  const templated = exportContent('https://studio.example/', '', template).find(item => item.module.id === 'fsi');
  assert.deepEqual(templated.document.scale, template.scale); assert.deepEqual(templated.document.ask, template.ask);
  assert.equal(templated.document.build.extra, 'host data'); assert.equal(templated.document.usecases.some(item => item.id === 'old'), false);
});

test('content APIs isolate sessions and modules, merge/reset overrides, enforce bindings and paths', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'studio-content-test-'));
  const previousRoot = process.env.STUDIO_CONTENT_ROOT;
  const previousApps = process.env.STUDIO_ENABLED_APPS;
  process.env.STUDIO_CONTENT_ROOT = directory;
  delete process.env.STUDIO_ENABLED_APPS;
  try {
    await writeContentExport(directory, 'https://studio.example/');
    await mkdir(path.join(directory, 'modules', 'legacy'));
    const raw = await fixture('neil-dev-studios');
    await writeFile(path.join(directory, 'modules', 'legacy', 'content.json'), JSON.stringify(raw));
    const approved = JSON.parse(await readFile(path.join(directory, 'approved.json'), 'utf8'));
    approved.push({ id: 'legacy', name: 'Legacy', dir: 'legacy', content: 'content.json', base: 'phoenix', entry: 'app/site/index.html' });
    approved.push({ id: 'empty', name: 'Empty', dir: 'legacy' });
    await writeFile(path.join(directory, 'approved.json'), JSON.stringify(approved));
    assert.equal((await request('/api/motion/content/?module=legacy')).status, 200);
    const first = await request('/api/studio/content?module=legacy'); assert.equal(first.status, 200);
    const cookie = first.headers['set-cookie'].split(';')[0];
    const changed = await request('/api/motion/content', { cookie, method: 'POST', body: { content: { headline: 'Session title', subtitle: null } } });
    assert.equal(changed.status, 200); assert.equal(changed.body.headline, 'Session title'); assert.equal(changed.body.subtitle, undefined);
    assert.equal((await request('/api/motion/content', { cookie })).body.subtitle, undefined);
    assert.equal((await request('/api/studio/content?module=legacy')).body.document.headline, raw.headline);
    assert.equal((await request('/api/motion/content?module=fsi', { cookie })).body.headline, 'Financial Services');
    assert.equal((await request('/api/motion/content?module=legacy', { cookie })).body.headline, 'Session title');
    const replaced = await request('/api/motion/content?module=legacy', { cookie, method: 'POST', body: { usecases: [{ id: 'only', title: 'Only entry' }] } }); assert.equal(replaced.body.usecases.length, 1);
    await request('/api/motion/content?module=legacy', { cookie, method: 'POST', body: { load: 'default' } });
    assert.equal((await request('/api/motion/content?module=legacy', { cookie })).body.usecases.length, 2);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'modules', 'legacy', 'content.json'), 'utf8')), raw);
    assert.equal((await request('/api/motion/content?module=legacy', { cookie, method: 'POST', origin: 'https://elsewhere.invalid', body: {} })).status, 403);
    assert.equal((await request('/api/motion/content?module=empty', { cookie, method: 'POST', body: { headline: 'x' } })).status, 404);
    assert.equal((await request('/api/motion/content?module=fsi', { cookie, method: 'POST', body: { usecases: [{ id: 'sar-support', 'x-studio': { nativeDemoId: 'brahe-bank' } }] } })).status, 400);
    const snapshot = await contentSnapshot('fsi'); assert.equal(snapshot.entries.length, 9);
    process.env.STUDIO_ENABLED_APPS = 'horizontal'; assert.equal((await contentSnapshot('fsi')).entries.length, 0); delete process.env.STUDIO_ENABLED_APPS;
    await symlink(path.join(directory, 'approved.json'), path.join(directory, 'modules', 'legacy', 'outside.json'));
    approved.find(item => item.id === 'legacy').content = 'outside.json';
    await writeFile(path.join(directory, 'approved.json'), JSON.stringify(approved));
    await assert.rejects(() => contentSnapshot('legacy'), /inside/);
    assert.equal((await request('/api/studio/content?module=missing')).status, 404);
    // Aliases reuse the existing frontend.
    const req = new PassThrough(); req.url = '/select/legacy';
    let location;
    assert.equal(handleStudioApi(req, { writeHead(status, headers) { assert.equal(status, 302); location = headers.location; }, end() {} }), true);
    assert.equal(location, '/?content=legacy');
  } finally {
    if (previousRoot === undefined) delete process.env.STUDIO_CONTENT_ROOT; else process.env.STUDIO_CONTENT_ROOT = previousRoot;
    if (previousApps === undefined) delete process.env.STUDIO_ENABLED_APPS; else process.env.STUDIO_ENABLED_APPS = previousApps;
    await rm(directory, { recursive: true, force: true });
  }
});
