// Local orchestration only. Services and deployment may evolve; preserve the UI theme.
// The studio dev server launches the Python services itself (scripts/studio-services.ts),
// so Studio settings can restart them after credentials change.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
for (const service of ['banking', 'fraud', 'briefing', 'wealth', 'sar', 'vulnerability']) {
  if (!existsSync(`${root}services/${service}/.venv/bin/python`)) {
    console.error(`Run npm run ${service}:install before starting the studio.`);
    process.exit(1);
  }
}
const studio = spawn(process.execPath, [`${root}node_modules/.bin/vinext`, 'dev', '--port', process.env.STUDIO_PORT || '4200', '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_LOG_PATH: '.wrangler/wrangler.log', STUDIO_START_SERVICES: '1', STUDIO_PREVIEW: '0' },
});
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  studio.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500);
}
studio.on('error', () => stop(1));
studio.on('exit', code => { stopping = true; process.exit(code ?? 1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
