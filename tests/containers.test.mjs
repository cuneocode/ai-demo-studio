import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { runtimes, useCasePackages, runtimeForPath, rewriteRuntimePath } from '../config/use-cases.ts';
import { containerUrl, prepareContainerConfig } from '../scripts/studio-container-config.ts';
import { composeArgs, perform, projectName, queueOperation, runtimeLogs } from '../scripts/studio-services.ts';

test('all eight executable demos have independent registered stacks; illustrative modules stay explicit', () => {
  assert.equal(useCasePackages.length, 10);
  assert.equal(runtimes.length, 8);
  assert.equal(new Set(runtimes.map(spec => spec.id)).size, 8);
  assert.equal(new Set(runtimes.map(spec => spec.port)).size, 8);
  for (const spec of runtimes) {
    const compose = readFileSync(new URL(`../${spec.compose}`, import.meta.url), 'utf8');
    assert.match(compose, /volumes:/);
    assert.ok(compose.includes('127.0.0.1:'));
    assert.ok(projectName(spec).endsWith(`-${spec.id}`));
  }
  assert.deepEqual(useCasePackages.filter(item => !item.runtime).map(item => item.id), ['kyc-processing', 'transaction-llm']);
});

test('independent Wealth proxies preserve upstream APIs and query strings', () => {
  const research = runtimeForPath('/api/research/runs/id?after=2');
  const advisory = runtimeForPath('/api/advisory/runs/id?after=2');
  assert.notEqual(research.port, advisory.port);
  assert.equal(rewriteRuntimePath(advisory, '/api/advisory/runs/id?after=2'), '/api/wealth/runs/id?after=2');
  assert.equal(runtimeForPath('/api/sarcastic'), undefined);
  assert.equal(runtimeForPath('/api/wealth/health').id, 'research');
  assert.equal(containerUrl('http://localhost:8003/v1'), 'http://host.docker.internal:8003/v1');
  assert.equal(containerUrl('https://models.example/v1'), 'https://models.example/v1');
});

test('operator scopes configuration, preserves stopped data, and refuses unregistered stacks', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'studio-containers-'));
  const previous = { ...process.env };
  const calls = path.join(directory, 'calls.jsonl');
  const owned = path.join(directory, 'owned.json');
  writeFileSync(owned, '[]');
  const executable = path.join(directory, 'docker');
  writeFileSync(executable, `#!/usr/bin/env node\nconst fs = require('node:fs'); const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n'); if(args.includes('ps')) console.log(fs.readFileSync(${JSON.stringify(owned)},'utf8')); if(args.includes('logs')) { process.stdout.write('container-'); setTimeout(()=>process.stdout.write('test-key\\n'), 10); }`);
  chmodSync(executable, 0o755);
  process.env.STUDIO_DOCKER_BIN = executable;
  process.env.STUDIO_MIN_FREE_GB = '0';
  process.env.STUDIO_ENV_FILE = path.join(directory, '.env');
  process.env.STUDIO_RUNTIME_DIR = path.join(directory, 'runtime');
  process.env.STUDIO_MODELS_FILE = path.join(directory, 'models.json');
  writeFileSync(process.env.STUDIO_ENV_FILE, 'OPENAI_API_KEY=container-test-key\nUNRELATED_SECRET=keep-out\nGALILEO_PROJECT=test\nAGENT_CONTROL_URL=http://localhost:8000\n');
  writeFileSync(process.env.STUDIO_MODELS_FILE, '{"version":2,"providers":{}}');
  const server = http.createServer((request, response) => { response.setHeader('content-type', 'application/json'); response.end('{"ready":true}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const spec = { ...runtimes.find(item => item.id === 'sar'), port: server.address().port };
  try {
    // Refuse occupied ports before writing runtime configuration.
    await assert.rejects(perform(spec, 'start'), /outside this stack/);
    assert.equal(existsSync(path.join(process.env.STUDIO_RUNTIME_DIR, 'sar.env')), false);
    await perform(spec, 'build');
    // Stopped owned containers cannot claim a port now used by another process.
    writeFileSync(owned, JSON.stringify([{ State: 'exited', Labels: 'com.docker.compose.service=api' }]));
    await assert.rejects(perform(spec, 'start'), /outside this stack/);
    const environment = readFileSync(path.join(process.env.STUDIO_RUNTIME_DIR, 'sar.env'), 'utf8');
    assert.match(environment, /OPENAI_API_KEY=container-test-key/);
    assert.doesNotMatch(environment, /UNRELATED_SECRET/);
    assert.match(environment, /AGENT_CONTROL_URL=http:\/\/host.docker.internal:8000/);
    prepareContainerConfig(runtimes.find(item => item.id === 'interbank'));
    assert.match(readFileSync(path.join(process.env.STUDIO_RUNTIME_DIR, 'interbank.env'), 'utf8'), /AGENT_CONTROL_URL=http:\/\/localhost:8000/);
    assert.ok(existsSync(path.join(process.env.STUDIO_RUNTIME_DIR, 'models/models.json')));
    await perform(spec, 'stop');
    const commands = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(commands.at(-1), composeArgs(spec, ['--profile', '*', 'stop', '--timeout', '25']));
    assert.ok(commands.every(command => !command.includes('--volumes') && !command.includes('down')));
    assert.throws(() => queueOperation(['not-a-package'], 'start'), /registered/);
    assert.equal((await runtimeLogs('sar')).trim(), '[redacted]');
    writeFileSync(calls, '');
    await Promise.all([perform(spec, 'build'), perform(spec, 'build')]);
    const queued = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(queued.map(args => args.includes('build') ? 'build' : args[0]), ['info', 'build', 'info', 'build']);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(directory, { recursive: true, force: true });
  }
});
