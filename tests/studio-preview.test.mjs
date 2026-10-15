import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handleStudioApi } from '../scripts/studio-api.ts';

test('preview serves all recordings and fixture cards while blocking live APIs', async () => {
  const previous = process.env.STUDIO_PREVIEW;
  process.env.STUDIO_PREVIEW = '1';
  const server = http.createServer((req, res) => {
    if (!handleStudioApi(req, res)) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const service of ['banking', 'fraud', 'briefing', 'wealth', 'sar', 'interbank']) {
      const listing = await fetch(`${base}/api/studio/recordings/${service}`).then(r => r.json());
      assert.ok(listing.recordings.length > 0, service);
      for (const recording of listing.recordings) {
        const response = await fetch(`${base}/api/studio/recordings/${service}/${recording.name}`);
        assert.equal(response.status, 200);
        const doc = await response.json();
        assert.ok(doc.result || doc.run, `${service}/${recording.name}`);
        assert.ok(Array.isArray(doc.events));
      }
      for (const method of ['GET', 'POST']) assert.equal((await fetch(`${base}/api/${service}/health`, { method })).status, 503);
    }
    for (const [path, key] of [['fraud/scenarios','scenarios'], ['fraud/cases','cases'], ['sar/scenarios','scenarios'], ['wealth/households','households']]) {
      const doc = await fetch(`${base}/api/studio/examples/${path}`).then(r => r.json());
      assert.ok(doc[key].length > 0, path);
    }
    assert.equal((await fetch(`${base}/api/studio/recordings/wealth/%2e%2e%2f.env`)).status, 404);
    assert.equal((await fetch(`${base}/api/studio/recordings/wealth/research-hcyn`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/api/studio/examples/fraud/scenarios`, { method: 'POST' })).status, 405);
    const status = await fetch(`${base}/api/studio/status`).then(r => r.json());
    assert.equal(status.mode, 'preview');
    assert.ok(status.services.every(s => !s.up));
  } finally {
    if (previous === undefined) delete process.env.STUDIO_PREVIEW; else process.env.STUDIO_PREVIEW = previous;
    await new Promise(resolve => server.close(resolve));
  }
});


test('normal studio mode leaves live demo requests for the live service proxy', () => {
  const previous = process.env.STUDIO_PREVIEW;
  delete process.env.STUDIO_PREVIEW;
  try {
    for (const path of ['/api/banking/chat', '/api/fraud/runs', '/api/wealth/research/analyze', '/api/wealth/advisory/brief', '/api/sar/runs', '/api/briefing/analyze', '/api/interbank/kickoff']) {
      assert.equal(handleStudioApi({ url: path, method: 'POST' }, {}), false, path);
    }
  } finally {
    if (previous !== undefined) process.env.STUDIO_PREVIEW = previous;
  }
});
