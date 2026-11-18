import { obligationReferences, type DemoNarrative } from '../../demo-narratives.ts';
import type { PresenterNote } from '../../presenter-notes.ts';
import { useCaseFrames, type UseCaseFrame } from '../frames.ts';
import type { UseCase } from '../catalog.ts';
import { object, text, type ContentEntry } from '../../../config/content/contract.ts';

export function contentPresenter(value: unknown): PresenterNote | undefined {
  if (!object(value) || !['problem', 'ai', 'cisco'].every(key => typeof value[key] === 'string')) return;
  return { problem: text(value.problem), ai: text(value.ai), cisco: text(value.cisco), ...(typeof value.lifecycle === 'string' ? { lifecycle: value.lifecycle } : {}) };
}
export function contentNarrative(entry: ContentEntry | undefined, audience: 'customer' | 'specialist'): DemoNarrative | undefined {
  if (!entry) return;
  const full = entry.narrative;
  if (!(audience === 'specialist' && JSON.stringify(entry.specialist.story) !== JSON.stringify(entry.customer.story)) && object(full) && typeof full.headline === 'string' && Array.isArray(full.sections)) {
    const sections = full.sections.filter(object).flatMap(section => typeof section.title === 'string' && Array.isArray(section.paragraphs) && section.paragraphs.every(p => typeof p === 'string') ? [{ title: section.title, paragraphs: section.paragraphs as string[], ...(object(section.option) && typeof section.option.label === 'string' && typeof section.option.text === 'string' ? { option: { label: section.option.label, text: section.option.text } } : {}) }] : []);
    const references = Array.isArray(full.references) ? full.references.filter(object).flatMap(reference => typeof reference.id === 'string' && Object.hasOwn(obligationReferences, reference.id) && typeof reference.evidence === 'string' ? [{ id: reference.id as keyof typeof obligationReferences, evidence: reference.evidence }] : []) : [];
    if (sections.length) return { headline: full.headline, sections, references, planned: full.planned === true };
  }
  const view = entry[audience];
  if (!Array.isArray(view.story)) return;
  const sections = view.story.flatMap(row => Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'string' ? [{ title: row[0], paragraphs: row[1].split('\n\n') }] : []);
  return sections.length ? { headline: text(view.title, entry.title), sections, references: [] } : undefined;
}
export function frameFor(item: UseCase): UseCaseFrame {
  const base = useCaseFrames[item.id];
  if (base) {
    const copy = object(item.content?.frame) ? item.content.frame : {};
    const strings = (value: unknown, keys: string[]) => object(value) ? Object.fromEntries(keys.filter(key => typeof value[key] === 'string').map(key => [key, value[key]])) : {};
    return { ...base, ...strings(copy, ['workbenchLabel', 'workbenchTitle', 'workbenchSummary', 'primaryAction']), transformation: { ...base.transformation, ...strings(copy.transformation, ['friction', 'aiShift', 'humanControl']) }, ...(Array.isArray(copy.evidence) && copy.evidence.every(value => typeof value === 'string') ? { evidence: copy.evidence } : {}) };
  }
  return { transformation: { friction: item.description, aiShift: text(item.content?.customer.agent), humanControl: text(item.content?.customer.who) }, architecture: { process: [], ai: [] }, metrics: [], rows: [], workbenchLabel: 'Workspace', workbenchTitle: item.title, workbenchSummary: item.description, evidence: [], primaryAction: 'Open workspace' };
}
