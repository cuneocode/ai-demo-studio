// Read-only prerequisite checks. No credentials, model calls, or container starts.
import { existsSync, statfsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectRuntimes } from './studio-selection.ts';
const args = process.argv.slice(2);
let runtimes;
try { ({ selected: runtimes } = selectRuntimes(args.filter(arg => !['--live', '--interbank', '--source', '--help'].includes(arg)), true)); }
catch (error) { console.error(error.message); process.exit(1); }
if (args.includes('--help')) {
  console.log('Checks Studio dependencies. --live requires Docker Compose 2.30+ and a running engine. --source checks optional Python development environments.'); process.exit(0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const live = args.includes('--live') || args.includes('--interbank');
let ready = true;
const row = (ok, label, fix, required = true) => {
  console.log(`${ok ? 'OK' : required ? 'NEEDS' : 'OPTIONAL'}  ${label}${ok ? '' : `: ${fix}`}`);
  if (required && !ok) ready = false;
};
const [major, minor] = process.versions.node.split('.').map(Number);
row(major > 22 || (major === 22 && minor >= 18), `Node ${process.versions.node}`, 'Install Node 24 or Node 22.18+');
row(existsSync(`${root}node_modules/.bin/vinext`), 'Studio dependencies', 'npm ci');
for (const spec of runtimes) row(existsSync(`${root}${spec.compose}`), `${spec.label} package`, `Restore ${spec.compose}`);
if (live) {
  const disk = statfsSync(root);
  const freeGB = disk.bavail * disk.bsize / 1024 ** 3;
  row(freeGB >= 15, `Host disk: ${freeGB.toFixed(1)} GB free`, 'Free at least 15 GB; allow 30 GB for the image suite. Preserve saved-data volumes.');
  const result = spawnSync('docker', ['compose', 'version', '--short'], { encoding: 'utf8', timeout: 8000 });
  const [composeMajor, composeMinor] = (result.stdout?.trim().replace(/^v/, '') || '0').split('.').map(Number);
  row(result.status === 0 && (composeMajor > 2 || (composeMajor === 2 && composeMinor >= 30)), 'Docker Compose 2.30+', 'Install or update Docker Compose');
  row(spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 8000 }).status === 0, 'Docker engine', 'Start Docker');
}
if (args.includes('--source')) {
  row(spawnSync('uv', ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0, 'uv for source development', 'Install uv');
  for (const directory of new Set(runtimes.filter(spec => spec.id !== 'interbank').map(spec => spec.directory))) {
    row(existsSync(`${root}services/${directory}/.venv/bin/python`), `${directory} development environment`, `npm run ${directory}:install`);
  }
}
console.log(`\nStudio prerequisites: ${ready ? 'ready' : 'complete the required checks above'}`);
console.log('Open npm run dev:studio and start selected stacks in Studio settings. Preview uses npm run studio:preview.');
process.exitCode = ready ? 0 : 1;
