import test from 'node:test';
import assert from 'node:assert/strict';
import { caseMaps } from '../app/map/cases.ts';
import { evidence } from '../app/map/evidence.ts';

test('Architecture scopes reference real entities, children, and evidence', () => {
  assert.ok(caseMaps['brahe-bank']);
  assert.equal(Object.keys(caseMaps).length, 8);
  for (const map of Object.values(caseMaps)) {
    assert.ok(map.scopes[map.root], map.id);
    for (const scope of Object.values(map.scopes)) {
      const ids = new Set(scope.nodes.map((node) => node.id));
      assert.equal(ids.size, scope.nodes.length, scope.id);
      for (const node of scope.nodes) assert.ok(map.entities[node.entityId], `${scope.id} ${node.entityId}`);
      for (const edge of scope.edges) {
        assert.ok(ids.has(edge.from) && ids.has(edge.to), `${scope.id} ${edge.from} → ${edge.to}`);
        assert.ok(edge.label.trim());
      }
    }
    for (const entity of Object.values(map.entities)) {
      if (entity.childScopeId) assert.ok(map.scopes[entity.childScopeId], entity.childScopeId);
      if (entity.evidenceId) assert.ok(evidence[entity.evidenceId], entity.evidenceId);
    }
  }
  const fraud = caseMaps['fraud-modeling'];
  assert.equal(fraud.scopes['fraud.score'].edges.some((edge) => edge.from === 'model' && edge.to === 'defense'), false);
  const brahe = caseMaps['brahe-bank'];
  assert.equal(brahe.scopes['brahe.process'].nodes.length, 4);
  assert.ok(brahe.entities.answer.childScopeId);
  assert.ok(brahe.entities.defense.childScopeId);
});
