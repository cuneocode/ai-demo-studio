import { runtimes } from '../config/use-cases.ts';
import { selectRuntimes } from './studio-selection.ts';
import { perform, runtimeLogs, serviceStatus } from './studio-services.ts';

const [action = 'status', ...ids] = process.argv.slice(2);
if (!['prepare', 'build', 'start', 'stop', 'restart', 'status', 'logs', 'controls'].includes(action)) {
  console.error('Use studio:containers -- prepare|build|start|stop|restart|status|logs|controls [runtime ids] [--app id | --all]');
  process.exit(1);
}
let selected, scope;
try { ({ selected, scope } = selectRuntimes(ids, action === 'build')); }
catch (error) { console.error(error.message); process.exit(1); }
if (selected.some(spec => !spec) || (!selected.length && action !== 'status' && !ids.includes('--app'))) {
  console.error('Choose one or more live runtimes: ' + runtimes.map(spec => spec.id).join(', '));
  process.exit(1);
}
try {
  const built = new Set();
  if (action === 'status') {
    const status = await serviceStatus(scope);
    console.log(status.docker.detail);
    for (const row of status.services.filter(row => !selected.length || selected.some(spec => spec.id === row.id))) console.log(`${row.id}: ${row.state}${row.detail ? ` (${row.detail})` : ''}`);
  } else for (const spec of selected) {
    if (action === 'logs') console.log(await runtimeLogs(spec.id));
    else {
      const job = { state: 'running', operation: action, log: [], startedAt: new Date().toISOString() };
      console.log(`${action}: ${spec.label}`);
      const timer = setInterval(() => { for (const line of job.log.splice(0)) console.log(line); }, 500);
      try { await perform(spec, action, job, undefined, built); }
      finally { clearInterval(timer); for (const line of job.log) console.log(line); }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
