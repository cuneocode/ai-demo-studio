import { runtimes, runtimeById, runtimeForUseCase } from '../config/use-cases.ts';
import { perform, runtimeLogs, serviceStatus } from './studio-services.ts';

const [action = 'status', ...ids] = process.argv.slice(2);
if (!['build', 'start', 'stop', 'restart', 'status', 'logs', 'controls'].includes(action)) {
  console.error('Use studio:containers -- build|start|stop|restart|status|logs|controls [runtime ids]');
  process.exit(1);
}
const selected = ids.length ? ids.map(id => runtimeById(id) ?? runtimeForUseCase(id)) : action === 'build' ? runtimes : [];
if (selected.some(spec => !spec) || (!selected.length && action !== 'status')) {
  console.error('Choose one or more live runtimes: ' + runtimes.map(spec => spec.id).join(', '));
  process.exit(1);
}
try {
  if (action === 'status') {
    const status = await serviceStatus();
    console.log(status.docker.detail);
    for (const row of status.services.filter(row => !selected.length || selected.some(spec => spec.id === row.id))) console.log(`${row.id}: ${row.state}${row.detail ? ` (${row.detail})` : ''}`);
  } else for (const spec of selected) {
    if (action === 'logs') console.log(await runtimeLogs(spec.id));
    else {
      const job = { state: 'running', operation: action, log: [], startedAt: new Date().toISOString() };
      console.log(`${action}: ${spec.label}`);
      const timer = setInterval(() => { for (const line of job.log.splice(0)) console.log(line); }, 500);
      try { await perform(spec, action, job); }
      finally { clearInterval(timer); for (const line of job.log) console.log(line); }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
