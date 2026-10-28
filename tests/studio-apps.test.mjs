import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { apps, validateCatalog } from '../config/apps.ts';
import { demoDefinitions } from '../config/demos.ts';
import { runtimes, runtimeForUseCase } from '../config/use-cases.ts';
import { MODEL_USE_CASES, validateRegistry } from '../app/studio-models.ts';
import { parseStudioRoute, studioPath } from '../app/studio/route.ts';
import { appStorageKey, readStored, writeStored, removeStored } from '../app/studio/storage.ts';
import { installationNamespace } from '../scripts/studio-installation.ts';
import { resolveScope, requestScope, scopedRuntimeIds } from '../scripts/studio-scope.ts';
import { registryRevision, mergeModelUpdate } from '../scripts/studio-models-api.ts';
import { selectRuntimes } from '../scripts/studio-selection.ts';
import { handleStudioApi } from '../scripts/studio-api.ts';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/fsi-compatibility.json', import.meta.url), 'utf8'));
const defaults = () => validateRegistry(JSON.parse(readFileSync(new URL('../config/studio-models.default.json', import.meta.url), 'utf8'))).registry;

test('five app manifests retain the exact FSI catalog, identities, and isolated empty libraries', () => {
  assert.deepEqual(validateCatalog(), []);
  assert.equal(apps.length, 5);
  assert.equal(demoDefinitions.length, 10);
  assert.equal(runtimes.length, 8);
  assert.deepEqual(apps[0].catalog.map(item => item.demoId), demoDefinitions.map(item => item.id));
  for (const app of apps.slice(1)) { assert.deepEqual(app.catalog, []); assert.equal(app.context, null); assert.deepEqual(app.defaultStory, []); }
  for (const demo of demoDefinitions) {
    const old = baseline.demos.find(item => item.id === demo.id);
    assert.ok(old, demo.id);
    assert.equal(demo.mode, old.mode);
    const runtime = runtimeForUseCase(demo.id);
    assert.equal(runtime?.id ?? null, old.runtimeId);
    if (runtime) { assert.equal(runtime.port, old.port); assert.equal(runtime.prefix, old.prefix); assert.equal(runtime.modelUseCase, old.modelUseCase); }
    for (const asset of Object.values(demo.assets).filter(Boolean)) assert.ok(existsSync(asset), `${demo.id}: ${asset}`);
  }
  assert.equal(MODEL_USE_CASES.length, 8);
});

test('catalog validation rejects duplicate ownership, missing runtimes, and cross-app story references', () => {
  const badApps = [{ ...apps[1], catalog: [{ demoId: 'unknown', categoryId: 'missing' }], defaultStory: ['sar-support'] }];
  const errors = validateCatalog(demoDefinitions, badApps).join(' ');
  assert.match(errors, /unknown demo/); assert.match(errors, /unknown category/); assert.match(errors, /outside its library/);
  assert.match(validateCatalog([...demoDefinitions, demoDefinitions[0]], apps).join(' '), /Duplicate demo/);
  assert.match(validateCatalog([{ ...demoDefinitions[0], runtimeId: undefined }], []).join(' '), /needs a runtime/);
});

test('deep routes, tab URLs, unknown memberships and legacy tour links are explicit', () => {
  const deep = parseStudioRoute('/apps/fsi/demos/sar-support', '?tab=capacity');
  assert.equal(deep.demoId, 'sar-support'); assert.equal(deep.tab, 'capacity');
  assert.equal(parseStudioRoute('/apps/healthcare/demos/sar-support').valid, false);
  assert.equal(parseStudioRoute('/apps/healthcare/briefing').valid, false);
  assert.equal(parseStudioRoute('/apps/unknown').valid, false);
  assert.equal(parseStudioRoute('/').view, 'apps');
  assert.equal(parseStudioRoute('/', '?guide=sar-support&step=sar.run').appId, 'fsi');
  assert.equal(studioPath('fsi', 'overview', 'sar-support'), '/apps/fsi/demos/sar-support');
  assert.throws(() => studioPath('healthcare', 'overview', 'sar-support'), /outside/);
});

test('scoped route patches preserve unseen overrides and reject stale tabs before writing', () => {
  const initial = defaults();
  const scope = resolveScope('fsi');
  const a = { ...scope, appId: 'fsi', useCaseIds: ['brahe-bank'] };
  const b = { ...scope, appId: 'healthcare', useCaseIds: ['sar-support'] };
  const revision = registryRevision(initial);
  const first = mergeModelUpdate({ revision, routes: { 'brahe-bank': { chain: ['openai'] } } }, initial, a, 'PATCH');
  assert.throws(() => mergeModelUpdate({ revision, routes: { 'sar-support': { externalPolicy: 'deny' } } }, first, b, 'PATCH'), /another window/);
  const merged = mergeModelUpdate({ revision: registryRevision(first), routes: { 'sar-support': { externalPolicy: 'deny' } } }, first, b, 'PATCH');
  assert.deepEqual(merged.useCases['brahe-bank'], { chain: ['openai'] });
  assert.deepEqual(merged.useCases['sar-support'], { externalPolicy: 'deny' });
  const cleared = mergeModelUpdate({ revision: registryRevision(merged), routes: { 'sar-support': null } }, merged, b, 'PATCH');
  assert.deepEqual(cleared.useCases['brahe-bank'], { chain: ['openai'] }); assert.equal(cleared.useCases['sar-support'], undefined);
  assert.throws(() => mergeModelUpdate({ revision, routes: { 'sar-support': {} } }, initial, a, 'PATCH'), /outside/);
  assert.throws(() => mergeModelUpdate({ revision, registry: initial }, initial, a, 'PUT'), /platform settings/);
  assert.throws(() => mergeModelUpdate({ routes: {} }, initial, a, 'PATCH'), /revision/);
  assert.throws(() => mergeModelUpdate({ revision, routes: {}, providers: {} }, initial, a, 'PATCH'), /routes only/);
});

test('browser migration copies FSI data once, dual-writes, and tombstones prevent resurrection', () => {
  const data = new Map([['fsi-demo-studio.company-profile', 'legacy-profile']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  assert.equal(readStored(storage, 'fsi-demo-studio.company-profile'), 'legacy-profile');
  assert.equal(data.get(appStorageKey('fsi', 'company-profile')), 'legacy-profile');
  assert.equal(readStored(storage, appStorageKey('healthcare', 'company-profile')), null);
  writeStored(storage, 'fsi-demo-studio.company-profile', 'updated');
  assert.equal(data.get('fsi-demo-studio.company-profile'), 'updated');
  removeStored(storage, 'fsi-demo-studio.company-profile');
  data.set('fsi-demo-studio.company-profile', 'old-browser-value');
  assert.equal(readStored(storage, 'fsi-demo-studio.company-profile'), null);
  data.set('fsi-studio.planner.v1:sar-support:assessment', 'assessment-original');
  assert.equal(readStored(storage, 'fsi-studio.planner.v1:sar-support:assessment'), 'assessment-original');
  assert.equal(data.get(appStorageKey('fsi', 'planner-assessment', 'sar-support')), 'assessment-original');
});

test('installation adoption preserves the original Docker namespace across checkout moves', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'studio-installation-'));
  const file = path.join(directory, 'installation.json');
  try {
    const adopted = installationNamespace('/original/checkout', file);
    assert.match(adopted, /^fsi-[a-f0-9]{8}$/);
    assert.equal(installationNamespace('/moved/checkout', file), adopted);
    writeFileSync(file, '{"version":1,"namespace":"invalid;command"}');
    assert.throws(() => installationNamespace('/moved/checkout', file), /Invalid/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('app-aware CLI selects unique runtimes and rejects mixed scope before execution', () => {
  assert.equal(selectRuntimes(['--app', 'fsi']).selected.length, 8);
  assert.equal(selectRuntimes(['--app', 'healthcare']).selected.length, 0);
  assert.equal(selectRuntimes(['sar', 'sar-support']).selected.length, 1);
  assert.throws(() => selectRuntimes(['--app', 'healthcare', 'sar']), /outside/);
  assert.throws(() => selectRuntimes(['--app', 'fsi', '--all']), /Choose/);
  assert.throws(() => scopedRuntimeIds(['sar', 'unknown'], resolveScope('fsi')), /outside/);
  assert.throws(() => requestScope({ url: '/api/studio/status?app=fsi&app=healthcare' }), /one industry/);
  assert.throws(() => requestScope({ url: '/api/studio/status?app=fsi' }, { appId: 'healthcare' }), /conflicting/);
});

test('restricted installations block live aliases, recordings, examples, and lifecycle writes at the host', async () => {
  const previous = process.env.STUDIO_ENABLED_APPS;
  process.env.STUDIO_ENABLED_APPS = 'healthcare';
  const server = http.createServer((request, response) => { if (!handleStudioApi(request, response)) { response.writeHead(404); response.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/api/banking/health', '/api/wealth/health', '/api/research/health', '/api/interbank/sources/server', '/api/studio/recordings/sar', '/api/studio/examples/fraud/scenarios']) assert.equal((await fetch(base + path)).status, 403, path);
    assert.equal((await fetch(base + '/api/studio/status?app=fsi')).status, 403);
    const empty = await fetch(base + '/api/studio/status?app=healthcare').then(response => response.json());
    assert.deepEqual(empty.services, []); assert.deepEqual(empty.interbank.runs, []); assert.deepEqual(empty.readiness, []);
    for (const action of ['start', 'stop', 'build', 'apply', 'prepare', 'controls']) assert.equal((await fetch(base + '/api/studio/services?app=healthcare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ids: ['sar'] }) })).status, 403, action);
    assert.equal((await fetch(base + '/api/studio/settings?app=healthcare', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"set":{}}' })).status, 403);
  } finally {
    if (previous === undefined) delete process.env.STUDIO_ENABLED_APPS; else process.env.STUDIO_ENABLED_APPS = previous;
    await new Promise(resolve => server.close(resolve));
  }
});
