import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { plannerInitialization, plannerAssessmentId, validatePlannerConnection } from '../app/planner-integration.ts';
import { handleStudioApi } from '../scripts/studio-api.ts';

const run = { id: 'run-1', label: 'Private prompt stays in Studio', status: 'completed', startedAt: 1792936800000, durationMs: 2000,
  llmCalls: 4, inputTokens: 2400, outputTokens: 800, provenance: 'live', servedBy: { model: 'openai/gpt-oss-20b' } };

test('planner imports provider totals with provenance and keeps production demand unknown', () => {
  const seed = plannerInitialization('sar-support', 'assessment-1', 'SAR investigation', 'Review the investigation workflow', run);
  assert.equal(seed.workloads[0].modelId, 'zai-org/GLM-5.3');
  assert.equal(seed.assessment.name, 'SAR investigation');
  assert.deepEqual(seed.workloads[0].measurements, { modelCalls: 4, inputTokens: 2400, outputTokens: 800 });
  assert.equal(seed.workloads[0].provenance.kind, 'measured');
  assert.equal(seed.workloads[0].productionDemand, undefined);
  assert.equal(seed.workloads[0].measurements.inputTokens, 2400);
  assert.ok(!JSON.stringify(seed).includes(run.label));
  assert.ok(!JSON.stringify(seed).includes('durationMs'));
});

test('unknown fields stay unknown; explicit zero is observed zero', () => {
  const seed = plannerInitialization('sar-support', 'a', 'SAR', '', { ...run, llmCalls: 0, inputTokens: undefined, outputTokens: 0 });
  const serialized = JSON.parse(JSON.stringify(seed)).workloads[0];
  assert.deepEqual(serialized.measurements, { modelCalls: 0, outputTokens: 0 });
  const empty = plannerInitialization('sar-support', 'a', 'SAR', '').workloads[0];
  assert.equal(empty.modelId, 'zai-org/GLM-5.3');
  assert.equal(empty.measurements, undefined);
  assert.equal(empty.provenance, undefined);
});

test('recordings remain reported evidence; sample and incomplete runs do not become measured demand', () => {
  const recorded = plannerInitialization('sar-support', 'a', 'SAR', '', { ...run, provenance: 'recorded', recordedAt: '2026-10-12T12:00:00Z' }).workloads[0];
  assert.equal(recorded.provenance.kind, 'reported');
  assert.equal(recorded.provenance.capturedAt, '2026-10-12T12:00:00.000Z');
  for (const observation of [{ ...run, provenance: 'sample' }, { ...run, status: 'running' }, { ...run, status: 'failed' }]) {
    assert.equal(plannerInitialization('sar-support', 'a', 'SAR', '', observation).workloads[0].measurements, undefined);
  }
});

test('all use cases default to GLM 5.3 while keeping demo observations', () => {
  const workload = plannerInitialization('interbank-a2a', 'a', 'Interbank', '', run).workloads[0];
  assert.equal(workload.modelId, 'zai-org/GLM-5.3');
  assert.equal(workload.measurements.modelCalls, 4);
});

test('assessment IDs survive remounts and remain isolated by use case', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(plannerAssessmentId(storage, 'sar-support', false, () => 'first'), 'first');
  assert.equal(plannerAssessmentId(storage, 'sar-support', false, () => 'unused'), 'first');
  assert.equal(plannerAssessmentId(storage, 'brahe-bank', false, () => 'second'), 'second');
  assert.equal(plannerAssessmentId(storage, 'sar-support', true, () => 'new-assessment'), 'new-assessment');
  assert.equal(plannerAssessmentId(storage, 'brahe-bank'), 'second');
  assert.equal(plannerAssessmentId(storage, 'brahe-bank', false, () => 'healthcare-assessment', 'healthcare'), 'healthcare-assessment');
  assert.equal(plannerAssessmentId(storage, 'brahe-bank'), 'second');
  assert.equal(plannerAssessmentId(storage, 'brahe-bank', false, () => 'unused', 'healthcare'), 'healthcare-assessment');
  assert.equal(plannerAssessmentId({ getItem() { throw Error(); }, setItem() { throw Error(); } }, 'sar-support', false, () => 'session-only'), 'session-only');
});

test('planner connection accepts local or HTTPS release URLs and rejects credentials or an invalid API base', () => {
  assert.deepEqual(validatePlannerConnection('', ''), { configured: false });
  assert.equal(validatePlannerConnection('http://localhost:4173/embed/1.0.0/planner.js', 'http://localhost:3101').configured, true);
  assert.equal(validatePlannerConnection('https://planner.example/embed/1.0.0/planner.js', 'https://api.example').configured, true);
  for (const [bundle, api] of [
    ['http://remote.example/planner.js', 'https://api.example'],
    ['https://user:secret@planner.example/planner.js', 'https://api.example'],
    ['https://planner.example/planner.js', 'https://api.example/api'],
    ['https://planner.example/planner.js?key=secret', 'https://api.example'],
  ]) assert.equal(validatePlannerConnection(bundle, api).configured, false);
});

test('planner configuration is read-only and usable in preview without exposing other settings', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'studio-planner-'));
  const previous = process.env.STUDIO_ENV_FILE;
  const file = path.join(directory, '.env');
  writeFileSync(file, 'STUDIO_PLANNER_BUNDLE_URL=http://localhost:4173/embed/1.0.0/planner.js\nSTUDIO_PLANNER_API_BASE_URL=http://localhost:3101\nOPENAI_API_KEY=never-return-this\n');
  process.env.STUDIO_ENV_FILE = file;
  const server = http.createServer((req, res) => { if (!handleStudioApi(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/studio/planner`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { configured: true, bundleUrl: 'http://localhost:4173/embed/1.0.0/planner.js', apiBaseUrl: 'http://localhost:3101' });
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.STUDIO_ENV_FILE; else process.env.STUDIO_ENV_FILE = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
