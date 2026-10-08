// Local orchestration only. Services and deployment may evolve; preserve the UI theme.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const bankingPython = `${root}services/banking/.venv/bin/python`;
const fraudPython = `${root}services/fraud/.venv/bin/python`;
const briefingPython = `${root}services/briefing/.venv/bin/python`;
const wealthPython = `${root}services/wealth/.venv/bin/python`;
if (!existsSync(bankingPython)) {
  console.error('Run npm run banking:install before starting the studio.');
  process.exit(1);
}
if (!existsSync(fraudPython)) {
  console.error('Run npm run fraud:install before starting the studio.');
  process.exit(1);
}
if (!existsSync(briefingPython)) {
  console.error('Run npm run briefing:install before starting the studio.');
  process.exit(1);
}
if (!existsSync(wealthPython)) {
  console.error('Run npm run wealth:install before starting the studio.');
  process.exit(1);
}
const children = [
  spawn(bankingPython, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8011'], { cwd: `${root}services/banking`, stdio: 'inherit' }),
  spawn(fraudPython, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8012'], { cwd: `${root}services/fraud`, stdio: 'inherit' }),
  spawn(briefingPython, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8013'], { cwd: `${root}services/briefing`, stdio: 'inherit' }),
  spawn(wealthPython, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8014'], { cwd: `${root}services/wealth`, stdio: 'inherit' }),
  spawn(process.execPath, [`${root}node_modules/.bin/vinext`, 'dev', '--port', process.env.STUDIO_PORT || '4200', '--strictPort'], { cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_LOG_PATH: '.wrangler/wrangler.log' } }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 800);
}
children.forEach(child => {
  child.on('error', () => stop(1));
  child.on('exit', code => stop(code ?? 1));
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
