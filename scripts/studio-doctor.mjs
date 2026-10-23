// Read-only prerequisite checks. No credentials, model calls, or service starts.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.some(arg => !['--live', '--interbank', '--help'].includes(arg))) {
  console.error('Use studio:doctor [--live] [--interbank].');
  process.exit(1);
}
if (args.includes('--help')) {
  console.log('studio:doctor checks frontend prerequisites. --live also requires uv and six Python environments. --interbank adds live requirements and Docker Compose.');
  process.exit(0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const interbank = args.includes('--interbank');
const live = interbank || args.includes('--live');
let ready = true;
const row = (ok, label, fix, required = true) => {
  console.log(`${ok ? 'OK' : required ? 'NEEDS' : 'OPTIONAL'}  ${label}${ok ? '' : `: ${fix}`}`);
  if (required && !ok) ready = false;
};
const [major, minor] = process.versions.node.split('.').map(Number);
row(major > 22 || (major === 22 && minor >= 18), `Node ${process.versions.node}`, 'Install Node 24 or Node 22.18+');
row(existsSync(`${root}node_modules/.bin/vinext`), 'Studio dependencies', 'npm ci');
row(spawnSync('uv', ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0, 'uv (live Studio)', 'Install uv, then npm run studio:install', live);
for (const id of ['banking', 'fraud', 'briefing', 'wealth', 'sar', 'vulnerability']) {
  const python = `${root}services/${id}/.venv/bin/python`;
  const check = existsSync(python) ? spawnSync(python, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3]))); import fastapi, uvicorn; sys.exit(0 if (3, 12) <= sys.version_info[:2] < (3, 14) else 1)'], { encoding: 'utf8', timeout: 5000 }) : null;
  const version = check?.stdout?.trim();
  row(check?.status === 0, `${id} Python environment${version ? ` (${version})` : ''}`, `npm run ${id}:install with Python 3.12 or 3.13`, live);
}
if (interbank) {
  const compose = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8', timeout: 8000 });
  const composeMajor = Number(compose.stdout?.trim().replace(/^v/, '').split('.')[0]);
  row(compose.status === 0 && composeMajor >= 2, 'Docker Compose v2+', 'Install Docker with the Compose plugin');
  row(spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 8000 }).status === 0, 'Docker daemon', 'Start Docker');
} else {
  console.log('Optional interbank lab: check Docker with npm run studio:doctor -- --interbank.');
}
console.log(`\n${live ? 'Live Studio' : 'Frontend'} prerequisites: ${ready ? 'ready' : 'complete the required checks above'}`);
console.log('Start with npm run dev:studio, or npm run studio:preview for recordings only.');
console.log('Check models, credentials, policies, and delivery in Studio settings and the live run.');
process.exitCode = ready ? 0 : 1;
