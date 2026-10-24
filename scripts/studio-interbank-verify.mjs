// Explicit read-only trace verification using the package's own frozen SDKs.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runtimeById } from '../config/use-cases.ts';
import { composeArgs } from './studio-services.ts';
import { runtimeDirectory } from './studio-container-config.ts';

const [runId, mode, ...extra] = process.argv.slice(2);
if (!/^inv-[a-z0-9-]{6,90}$/.test(runId ?? '') || (mode && mode !== 'blocked') || extra.length) {
  console.error('Use npm run interbank:verify -- <investigation-id> [blocked]');
  process.exit(1);
}
if (!existsSync(path.join(runtimeDirectory(), 'interbank.env'))) {
  console.error('Start Interbank through Studio before verifying its traces.');
  process.exit(1);
}
const args = composeArgs(runtimeById('interbank'), ['run', '--rm', '--no-deps', 'setup', 'python', '-m', 'tools.verify_splunk', runId, ...(mode ? [mode] : [])]);
const child = spawn('docker', args, {
  stdio: 'inherit',
  env: { ...process.env, STUDIO_RUNTIME_DIR: runtimeDirectory(), LAB_UID: String(process.getuid?.() ?? 10001), LAB_GID: String(process.getgid?.() ?? 10001), COMPOSE_PARALLEL_LIMIT: '1' },
});
child.once('error', () => { console.error('Docker is unavailable. Start its engine and retry.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
