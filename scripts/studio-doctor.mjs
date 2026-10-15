// Read-only prerequisite checks. No credentials, model calls, or service starts.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
const nodeReady = major > 22 || (major === 22 && minor >= 13);
const dependencies = existsSync(`${root}node_modules/.bin/vinext`);
const row = (ok, label, fix) => console.log(`${ok ? 'OK' : 'NEEDS'}  ${label}${ok ? '' : ` — ${fix}`}`);
row(nodeReady, `Node ${process.versions.node}`, 'Install Node 22.13 or newer');
row(dependencies, 'Studio dependencies', 'npm ci');
console.log(`\nStudio frontend: ${nodeReady && dependencies ? 'ready' : 'complete the checks above'}`);
console.log('\nLive execution prerequisites:');
row(spawnSync('uv', ['--version'], { stdio: 'ignore' }).status === 0, 'uv', 'Install uv, then npm run studio:install');
for (const id of ['banking', 'fraud', 'briefing', 'wealth', 'sar']) row(existsSync(`${root}services/${id}/.venv/bin/python`), `${id} environment`, `npm run ${id}:install`);
row(spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 8000 }).status === 0, 'Docker (live interbank only)', 'Start Docker, then npm run interbank:up');
console.log('\nStart the live studio with npm run dev:studio. Recording-only preview (npm run studio:preview) is a fallback.');
console.log('Check live model endpoints and credentials in Studio settings. A configured key is not proof of a successful run.');
process.exitCode = nodeReady && dependencies ? 0 : 1;
