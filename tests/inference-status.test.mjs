import test from 'node:test';
import assert from 'node:assert/strict';
import { inferenceStatus } from '../app/inference-status.ts';
const snapshot = {
  saved: true,
  registry: { version: 2, chain: ['private', 'hosted'], useCases: {}, providers: {
    private: { label: 'Private endpoint', model: 'local-model', private: true },
    hosted: { label: 'Hosted endpoint', model: 'cloud-model', private: false },
  } },
  health: { private: { up: false }, hosted: { up: true } },
  routes: { research: { active: 'hosted' }, advisory: { active: 'private' }, stopped: { active: null } },
};
test('a healthy cloud fallback is shown without calling the private chain local', () => {
  assert.equal(inferenceStatus(snapshot).label, 'Cloud model');
  assert.equal(inferenceStatus(snapshot, 'research').label, 'Cloud model');
});
test('each active demo follows its own selected route', () => {
  assert.equal(inferenceStatus(snapshot, 'advisory').label, 'Local inference');
  assert.equal(inferenceStatus(snapshot, 'stopped').label, 'Inference unavailable');
  assert.equal(inferenceStatus(snapshot, 'unknown-case').kind, 'unknown');
});
test('unavailable model status never claims local or cloud execution', () => {
  assert.equal(inferenceStatus(null).kind, 'unknown');
  assert.equal(inferenceStatus({ ...snapshot, health: {} }).kind, 'unknown');
});
test('unconfigured default providers are excluded', () => {
  const next = { ...snapshot, saved: false, unconfigured: { private: 'Missing configuration' }, health: { private: { up: true }, hosted: { up: true } } };
  assert.equal(inferenceStatus(next).label, 'Cloud model');
});
