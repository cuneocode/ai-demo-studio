import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewedRecording } from '../scripts/recording-review.ts';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
test('research review removes the false claim without changing original evidence', () => {
  const original = read('../services/wealth/data/recorded/research-hcyn.json');
  const before = JSON.stringify(original);
  const reviewed = reviewedRecording('wealth', 'research-hcyn', original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(reviewed.result.update.counts.verified, 4);
  assert.equal(reviewed.result.update.counts.unverified, 1);
  const disputed = reviewed.result.update.claims.find(c => c.text.includes('forward P/E'));
  assert.equal(disputed.original_verdict.status, 'verified');
  assert.equal(disputed.status, 'unverified');
  assert.match(reviewed.result.review, /13.92x \/ 18.35x/);
  assert.deepEqual(reviewed.events, original.events);
});
test('interbank review distinguishes the pending v3 change from active v2', () => {
  const original = read('../services/interbank/recorded/trd-847-allowed.json');
  const reviewed = reviewedRecording('interbank', 'trd-847-allowed', original);
  assert.match(reviewed.review, /active v2/);
  assert.match(reviewed.review, /2026-10-01/);
  assert.equal(reviewed.run.report, original.run.report);
  assert.deepEqual(reviewed.events, original.events);
  assert.equal(reviewedRecording('interbank', 'trd-847-blocked', original).review, undefined);
});
