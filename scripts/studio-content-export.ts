import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { apps } from '../config/apps.ts';
import { demoDefinitions } from '../config/demos.ts';
import { demoNarratives } from '../app/demo-narratives.ts';
import { vulnerabilityStory } from '../demos/code-vulnerability/narrative.ts';
import { presenterNotes } from '../app/presenter-notes.ts';
import { useCaseFrames } from '../app/studio/frames.ts';
import { TOURS } from '../app/guide/tours/index.ts';
import { mergeContent, normalizeContent, type ApprovedModule, type ContentDocument } from '../config/content/contract.ts';

export function exportContent(baseUrl: string, repo = '', legacyTemplate?: unknown) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Use an http(s) origin as --base-url.');
  const modules: { module: ApprovedModule; document: ContentDocument }[] = [];
  for (const app of apps) {
    const usecases = app.catalog.map(member => {
      const demo = demoDefinitions.find(item => item.id === member.demoId)!;
      const narrative = demo.id === 'code-vulnerability' ? vulnerabilityStory : demoNarratives[demo.id];
      const presenter = presenterNotes[demo.id];
      const frame = useCaseFrames[demo.id];
      const category = app.categories.find(item => item.id === member.categoryId)?.label ?? 'General';
      return {
        id: demo.id, title: demo.title, tagline: demo.description, status: demo.mode === 'illustrative' ? 'REF' : 'LIVE', icon: 'grid',
        who: frame?.transformation.humanControl ?? '', data: frame?.workbenchSummary ?? '', agent: demo.model?.calls ?? 'Illustrative workflow', gpu: 'Size with Capacity planning using workload assumptions and available observations.',
        ...(repo ? { repo } : {}), url: new URL(`/apps/${app.id}/demos/${demo.id}`, base).href,
        story: narrative?.sections.map(section => [section.title, section.paragraphs.join('\n\n'), '']) ?? [],
        'x-studio': { appId: app.id, nativeDemoId: demo.id, category, outcome: demo.outcome, architectureId: demo.architectureId, ...(narrative ? { narrative } : {}), ...(presenter ? { presenter } : {}), frame, tours: Object.values(TOURS).filter(tour => tour.useCaseId === demo.id) },
      };
    });
    modules.push({ module: { id: app.id, name: app.name, description: app.description, dir: app.id, content: 'content.json', base: 'phoenix', entry: 'app/site/index.html', 'x-studio': { appId: app.id } }, document: { title: app.name, headline: app.name, subtitle: app.description, usecases, 'x-studio': { schemaVersion: 1, app }, build: { ...(repo ? { repo } : {}), views: { customer: { label: 'Customer', note: 'Stakeholder needs, workflow, and outcomes.' } }, guide: usecases.map(item => ({ route: `uc/${item.id}/demo`, text: item.tagline })) } } });
  }
  const all = modules.flatMap(item => item.document.usecases);
  modules.push({ module: { id: 'industry-apps', name: 'Industry apps', dir: 'industry-apps', content: 'content.json', base: 'phoenix', entry: 'app/site/index.html' }, document: { title: 'Use case libraries', headline: 'AI Demo Studio', subtitle: 'Industry, security, and horizontal workflows.', usecases: all, 'x-studio': { schemaVersion: 1, apps }, build: { ...(repo ? { repo } : {}), views: { customer: { label: 'Customer' } }, guide: all.map(item => ({ route: `uc/${item.id}/demo`, text: item.tagline ?? item.title ?? item.id })) } } });
  if (legacyTemplate !== undefined) {
    normalizeContent(legacyTemplate);
    for (const item of modules) item.document = mergeContent(legacyTemplate, item.document) as ContentDocument;
  }
  for (const item of modules) {
    normalizeContent(item.document);
    if (Buffer.byteLength(JSON.stringify(item.document, null, 2)) > 256 * 1024) throw new Error(`Module ${item.module.id} exceeds 256 KiB. Export a smaller catalog or reduce the template.`);
  }
  return modules;
}
export async function writeContentExport(directory: string, baseUrl: string, repo = '', legacyTemplate?: unknown) {
  const modules = exportContent(baseUrl, repo, legacyTemplate);
  await mkdir(directory, { recursive: true });
  for (const { module, document } of modules) {
    const target = path.join(directory, 'modules', module.dir);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'content.json'), JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
  }
  await writeFile(path.join(directory, 'content.schema.json'), await readFile(new URL('../config/content/content.schema.json', import.meta.url)), { flag: 'wx' });
  await writeFile(path.join(directory, 'approved.json'), JSON.stringify(modules.map(item => item.module), null, 2) + '\n', { flag: 'wx' });
  await writeFile(path.join(directory, 'export-report.json'), JSON.stringify({ format: 'Neil content-load-default with x-studio v1', modules: modules.length, baseUrl, legacyTemplate: legacyTemplate !== undefined, sageHost: 'Merge approved.json rows into the host manifest. Modules inherit the host-owned phoenix shell. Supply --legacy-template for the existing Phoenix app.js, whose overview and calculators require its additional data fields.', preserved: ['narratives', 'references', 'presenter notes', 'workspace framing', 'tours', 'library membership'], consumerNotes: ['Legacy consumers render story paragraphs and guided navigation. Full references, presenter-only notes, native bindings, and action tours require x-studio support.', 'Native UI, backend code, and draw.io assets remain installed capabilities.'] }, null, 2) + '\n', { flag: 'wx' });
  return modules;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (name: string) => args[args.indexOf(name) + 1];
  if (!args.includes('--out') || !args.includes('--base-url')) throw new Error('Usage: npm run studio:content:export -- --out <new-directory> --base-url <origin> [--repo <owner/repo>] [--legacy-template <content.json>]');
  const modules = await writeContentExport(path.resolve(option('--out')), option('--base-url'), args.includes('--repo') ? option('--repo') : '', args.includes('--legacy-template') ? JSON.parse(await readFile(option('--legacy-template'), 'utf8')) : undefined);
  console.log(`Exported ${modules.length} content modules.`);
}
