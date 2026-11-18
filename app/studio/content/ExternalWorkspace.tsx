'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RunStats, { DEFENSE_TILES, type RunLedger } from '../../RunStats';
const ledger: RunLedger = { runs: [], record: () => {}, discard: () => {}, reset: () => {} };
import type { ContentEntry } from '../../../config/content/contract.ts';
import { text } from '../../../config/content/contract.ts';
import { useContentAudience, useStudioContent, withModule } from './ContentProvider';

export default function ExternalWorkspace({ entry }: { entry: ContentEntry }) {
  const audience = useContentAudience(); const content = useStudioContent(); const router = useRouter();
  const view = entry[audience]; const url = text(view.url);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'loaded' | 'timeout'>('idle');
  const [embedded, setEmbedded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mixed, setMixed] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setMixed(window.location.protocol === 'https:' && url.startsWith('http:'))); return () => cancelAnimationFrame(frame); }, [url]);
  useEffect(() => { if (!embedded || phase !== 'loading') return; const timer = setTimeout(() => setPhase('timeout'), 15000); return () => clearTimeout(timer); }, [embedded, phase, attempt, url]);
  const open = (destination: string) => {
    const target = new URL(destination, window.location.origin);
    if (target.origin === window.location.origin && (/^\/apps(?:\/|$)/.test(target.pathname) || ['/', '/studio', '/studio/'].includes(target.pathname) || target.pathname.startsWith('/select/'))) {
      if (!/^\/apps\/[^/]+(?:\/demos\/[^/]+)?\/?$/.test(target.pathname) || target.pathname.includes('/demos/json-')) { setPhase('timeout'); return; }
      router.push(withModule(target.pathname + target.search + target.hash, content.moduleId));
      return;
    }
    setEmbedded(true); setAttempt(value => value + 1); setPhase('loading');
  };
  return <section className="studio-external-workspace" aria-label="External workspace">
    <h2>Workspace</h2>{typeof view.note === 'string' && <p>{view.note}</p>}
    {entry.repo && <p>Repository: {entry.repo}</p>}
    <dl>{[['Users', view.who], ['Data', view.data], ['Agent', view.agent], ['Workload', view.gpu]].filter(([, value]) => typeof value === 'string' && value).map(([label, value]) => <div key={String(label)} style={{ display: 'contents' }}><dt>{String(label)}</dt><dd>{String(value)}</dd></div>)}</dl>
    <div className="heading-actions">{url && <><a className="primary-button" href={url} target="_blank" rel="noopener noreferrer">Open workspace in new tab</a>{!mixed && <button className="secondary-button" onClick={() => open(url)}>{embedded ? 'Reload embedded workspace' : 'Open in Studio'}</button>}</>}{embedded && <button className="secondary-button" onClick={() => { setEmbedded(false); setPhase('idle'); }}>Close embedded workspace</button>}</div>
    {phase === 'timeout' && !embedded && <p role="alert">This destination cannot be embedded here. Use the new-tab link to open it directly.</p>}
    {!url && <p>No live workspace URL is supplied for this entry.</p>}
    {mixed && <p>This HTTP workspace opens in a new tab from an HTTPS Studio.</p>}
    {embedded && <><p role="status">{phase === 'loading' ? 'Loading the external application…' : phase === 'timeout' ? 'The embedded workspace could not be confirmed. Use the new-tab link to open it directly.' : 'External frame opened. Use the new-tab link if the application is unavailable or prevents embedding.'}</p><iframe key={`${url}-${attempt}`} src={url} title={entry.title} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads" onLoad={() => setPhase('loaded')} /></>}
    {entry.workspaces.length > 0 && <><h3>Additional workspaces</h3><ul>{entry.workspaces.map((space, i) => <li key={`${space.url}-${i}`}><a href={space.url} target="_blank" rel="noopener noreferrer">{space.name}</a>{space.repo ? ` · ${space.repo}` : ''}</li>)}</ul></>}
    <RunStats ledger={ledger} empty="This application has not reported run measurements to Studio." observability={{ integration: { state: 'unknown', summary: 'External application', notice: 'Trace delivery is reported by the owning application.' }, tiles: [], source: 'No external run measurements received.' }} defense={{ integration: { state: 'unknown', summary: 'External application', notice: 'Inspection and control decisions are reported by the owning application.' }, tiles: DEFENSE_TILES, source: 'No external inspection measurements received.' }} />
  </section>;
}
