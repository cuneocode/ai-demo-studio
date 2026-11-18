'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useStudioLocation } from '../location';
import { guideDestination, object, text, type ContentEntry, type ContentSnapshot } from '../../../config/content/contract.ts';
import './content.css';

type ContentState = { moduleId: string | null; snapshot: ContentSnapshot | null; entries: ContentEntry[]; loading: boolean; error: string; audience: 'customer' | 'specialist' };
const Context = createContext<ContentState>({ moduleId: null, snapshot: null, entries: [], loading: false, error: '', audience: 'customer' });
export const useStudioContent = () => useContext(Context);
export function withModule(path: string, moduleId: string | null) {
  if (!moduleId || !path.startsWith('/') || path.startsWith('//')) return path;
  const url = new URL(path, 'http://studio.local'); url.searchParams.delete('module'); url.searchParams.set('content', moduleId);
  return url.pathname + url.search + url.hash;
}
export function StudioContentProvider({ children }: { children: ReactNode }) {
  const { search } = useStudioLocation();
  const params = new URLSearchParams(search);
  const moduleId = params.get('content') ?? params.get('module');
  const requestedAudience = params.get('audience');
  const [state, setState] = useState<{ id: string | null; snapshot: ContentSnapshot | null; error: string }>({ id: null, snapshot: null, error: '' });
  const [audience, updateAudience] = useState<'customer' | 'specialist'>('customer');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const key = `studio:content:${moduleId ?? 'bundled'}:audience`;
        const selected = requestedAudience === 'customer' || requestedAudience === 'specialist' ? requestedAudience : sessionStorage.getItem(key);
        updateAudience(moduleId && selected === 'specialist' ? 'specialist' : 'customer');
        if (moduleId && (requestedAudience === 'customer' || requestedAudience === 'specialist')) sessionStorage.setItem(key, requestedAudience);
      } catch { updateAudience(moduleId && requestedAudience === 'specialist' ? 'specialist' : 'customer'); }
    });
    return () => cancelAnimationFrame(frame);
  }, [moduleId, requestedAudience]);
  useEffect(() => {
    if (!moduleId) return;
    const controller = new AbortController();
    fetch(`/api/studio/content?module=${encodeURIComponent(moduleId)}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Content unavailable.');
      setState({ id: moduleId, snapshot: data, error: '' });
    }).catch(error => { if (!controller.signal.aborted) setState({ id: moduleId, snapshot: null, error: error.message }); });
    return () => controller.abort();
  }, [moduleId]);
  const snapshot = moduleId && state.id === moduleId ? state.snapshot : null;
  const value = useMemo(() => ({ moduleId, snapshot, entries: snapshot?.entries ?? [], loading: Boolean(moduleId && state.id !== moduleId), error: moduleId && state.id === moduleId ? state.error : '', audience }), [moduleId, snapshot, state.id, state.error, audience]);
  return <Context.Provider value={value}><ContentReviewProvider>{children}</ContentReviewProvider></Context.Provider>;
}
type ReviewState = { step: number | null; guide: Record<string, unknown>[]; notice: string; go: (index: number) => void; close: () => void };
const ReviewContext = createContext<ReviewState>({ step: null, guide: [], notice: '', go: () => {}, close: () => {} });
function ContentReviewProvider({ children }: { children: ReactNode }) {
  const content = useStudioContent(); const router = useRouter();
  const [step, setStep] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const guideKey = `studio:content:${content.moduleId ?? 'bundled'}:guide`;
  const { search } = useStudioLocation();
  const review = new URLSearchParams(search).get('review');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = review && /^[1-9][0-9]{0,2}$/.test(review) ? Number(review) - 1 : JSON.parse(sessionStorage.getItem(guideKey) ?? 'null');
        const selected = Number.isInteger(saved) && saved >= 0 ? saved : null;
        setStep(selected);
        if (selected !== null && review) sessionStorage.setItem(guideKey, String(selected));
      } catch { setStep(null); }
    });
    return () => cancelAnimationFrame(frame);
  }, [guideKey, review]);
  const saveStep = (index: number | null) => {
    setStep(index);
    try { if (index === null) sessionStorage.removeItem(guideKey); else sessionStorage.setItem(guideKey, String(index)); } catch { /* Session storage is optional. */ }
  };
  const build = content.snapshot?.document.build;
  const guide = Array.isArray(build?.guide) ? build.guide.filter(object) : [];
  const go = (index: number) => {
    const destination = guideDestination(text(guide[index]?.route), content.entries);
    if (!destination) { setNotice('This guide step has no supported Studio destination.'); return; }
    setNotice(''); saveStep(index); const target = withModule(destination, content.moduleId); if (target !== window.location.pathname + window.location.search) router.push(target);
  };
  return <ReviewContext.Provider value={{ step, guide, notice, go, close: () => { saveStep(null); setNotice(''); } }}>{children}</ReviewContext.Provider>;
}

export function ContentStatus() {
  const content = useStudioContent();
  if (content.loading) return <p role="status">Loading demo content…</p>;
  if (content.error) return <p role="alert">{content.error}</p>;
  return null;
}

export function ContentReview() {
  const { audience } = useStudioContent();
  const { step, guide, notice, go, close } = useContext(ReviewContext);
  if (step === null || !guide[step]) return notice ? <p role="status">{notice}</p> : null;
  return <section className="studio-content-review" aria-label="Guided review">
    <p>Step {step + 1} of {guide.length}: {text(guide[step][audience === 'specialist' ? 'specialist' : 'text'])}</p>
    <div className="heading-actions"><button className="secondary-button" disabled={!step} onClick={() => go(step - 1)}>Previous step</button><button className="secondary-button" onClick={() => step + 1 < guide.length ? go(step + 1) : close()}>{step + 1 < guide.length ? 'Next step' : 'Finish review'}</button><button className="secondary-button" onClick={close}>Close review</button></div>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
export function useContentAudience() { return useStudioContent().audience; }
