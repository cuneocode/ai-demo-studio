"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Cpu, KeyRound, PlugZap, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { KEY_NAMES, MODEL_USE_CASES, PROVIDER_ID, providerFor, validateRegistry, type ModelProvider, type ModelRegistry } from "./studio-models";
import "./model-backends.css";

const API = "/api/studio/models";

type Snapshot = {
  saved: boolean;
  problem: string | null;
  file: string;
  registry: ModelRegistry;
  keys: Record<string, boolean>;
};

type Check = { state: "running" } | { state: "done"; ok: boolean; text: string };

const KIND_LABEL = { openai: "OpenAI API", vllm: "vLLM" } as const;

async function loadSnapshot(): Promise<Snapshot> {
  const response = await fetch(API, { cache: "no-store" });
  if (!response.ok) throw new Error(`The studio answered ${response.status}.`);
  return response.json();
}

function checkText(body: { ok: boolean; detail?: string; count?: number; listed?: boolean; sample?: string[] }, model: string) {
  if (!body.ok) return body.detail ?? "The check failed.";
  if (body.listed) return `Reachable; ${model} is served.`;
  const sample = body.sample?.length ? ` It lists ${body.sample.slice(0, 4).join(", ")}${(body.count ?? 0) > 4 ? ", …" : ""}.` : "";
  return `Reachable, but ${model} is not in its model list.${sample}`;
}

const without = <T,>(record: Record<string, T>, key: string) => Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));

const loopback = (url: string) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url);

export default function ModelBackends() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<ModelRegistry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});

  const reload = useCallback(() => {
    loadSnapshot()
      .then((next) => { setSnapshot(next); setDraft(next.registry); setLoadError(null); })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  useEffect(reload, [reload]);

  const dirty = useMemo(() => Boolean(snapshot && draft && JSON.stringify(snapshot.registry) !== JSON.stringify(draft)), [snapshot, draft]);
  const problem = useMemo(() => {
    if (!draft) return null;
    const result = validateRegistry(draft);
    return "error" in result ? result.error : null;
  }, [draft]);

  if (loadError) return <div className="mb-page"><div className="mb-banner danger"><CircleAlert size={18} /><span>Model backends are unavailable: {loadError} They are served by the studio dev server or <code>npm run start:studio</code>.</span></div></div>;
  if (!snapshot || !draft) return <div className="mb-page"><p className="mb-muted">Loading model backends…</p></div>;

  const providers = Object.entries(draft.providers);
  const update = (next: ModelRegistry) => { setDraft(next); setSaveError(null); };
  const editProvider = (id: string, patch: Partial<ModelProvider>) => {
    update({ ...draft, providers: { ...draft.providers, [id]: { ...draft.providers[id], ...patch } } });
    setChecks((current) => without(current, id));
  };
  const addProvider = () => {
    let index = providers.length + 1;
    while (draft.providers[`endpoint-${index}`]) index += 1;
    const id = `endpoint-${index}`;
    if (!PROVIDER_ID.test(id)) return;
    update({ ...draft, providers: { ...draft.providers, [id]: { label: `Endpoint ${index}`, kind: "vllm", baseUrl: "http://127.0.0.1:8000/v1", model: "", apiKeyEnv: "", responsesApi: false } } });
  };
  const removeProvider = (id: string) => {
    const useCases = Object.fromEntries(Object.entries(draft.useCases).filter(([, providerId]) => providerId !== id));
    update({ ...draft, providers: without(draft.providers, id), useCases });
  };
  const assign = (useCase: string, providerId: string) => {
    const rest = without(draft.useCases, useCase);
    update({ ...draft, useCases: providerId === draft.default || !providerId ? rest : { ...rest, [useCase]: providerId } });
  };
  const runCheck = async (id: string) => {
    const provider = draft.providers[id];
    setChecks((current) => ({ ...current, [id]: { state: "running" } }));
    try {
      const response = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider }) });
      const body = await response.json();
      setChecks((current) => ({ ...current, [id]: { state: "done", ok: Boolean(body.ok && body.listed), text: checkText(body, provider.model) } }));
    } catch {
      setChecks((current) => ({ ...current, [id]: { state: "done", ok: false, text: "The studio could not run the check." } }));
    }
  };
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(API, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `The studio answered ${response.status}.`);
      setSnapshot(body);
      setDraft(body.registry);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-page">
      <div className="page-heading">
        <div>
          <span className="breadcrumb">FSI AI Demo Studio <span>/</span> Model backends</span>
          <h1>Model backends</h1>
          <p>Choose the OpenAI-compatible endpoint every live use case calls, then override it per use case. Keys stay in <code>.env</code>; this page saves only the name of each key variable.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" disabled={!dirty || saving} onClick={() => { setDraft(snapshot.registry); setSaveError(null); }}><RotateCcw size={16} /> Revert</button>
          <button className="primary-button" disabled={(!dirty && snapshot.saved) || saving || Boolean(problem)} onClick={save}><Save size={16} /> {saving ? "Saving…" : "Save"}</button>
        </div>
      </div>

      {snapshot.problem ? <div className="mb-banner danger"><CircleAlert size={18} /><span>The saved file at <code>{snapshot.file}</code> was rejected ({snapshot.problem}). Services are using their own <code>.env</code> settings until you save again.</span></div>
        : !snapshot.saved ? <div className="mb-banner"><CircleAlert size={18} /><span>Nothing saved yet, so each service uses its own <code>.env</code> settings. Saving writes <code>{snapshot.file}</code> and applies it to every use case.</span></div>
        : dirty ? <div className="mb-banner"><CircleAlert size={18} /><span>Unsaved changes. Services keep the saved choices until you save.</span></div>
        : null}
      {(saveError || (dirty && problem)) && <div className="mb-banner danger" role="alert"><CircleAlert size={18} /><span>{saveError ?? problem}</span></div>}

      <section className="mb-section" aria-labelledby="mb-default">
        <div className="section-heading"><div><span className="eyebrow">ALL USE CASES</span><h2 id="mb-default">Default backend</h2></div></div>
        <div className="mb-default" role="radiogroup" aria-label="Default backend">
          {providers.map(([id, provider]) => (
            <button key={id} role="radio" aria-checked={draft.default === id} className={draft.default === id ? "active" : ""} onClick={() => update({ ...draft, default: id, useCases: Object.fromEntries(Object.entries(draft.useCases).filter(([, providerId]) => providerId !== id)) })}>
              <Cpu size={17} /><span><strong>{provider.label}</strong><small>{provider.model || "No model"}</small></span>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-section" aria-labelledby="mb-usecases">
        <div className="section-heading"><div><span className="eyebrow">PER USE CASE</span><h2 id="mb-usecases">Use case overrides</h2></div></div>
        <div className="mb-table" role="table" aria-label="Use case overrides">
          <div className="mb-row head" role="row"><span role="columnheader">Use case</span><span role="columnheader">Model calls</span><span role="columnheader">Backend</span><span role="columnheader">Takes effect</span></div>
          {MODEL_USE_CASES.map((useCase) => {
            const current = providerFor(draft, useCase.id);
            return (
              <div className="mb-row" role="row" key={useCase.id}>
                <strong role="cell">{useCase.title}</strong>
                <span role="cell">{useCase.calls}</span>
                <span role="cell">
                  <select aria-label={`${useCase.title} backend`} value={current.overridden ? current.id : ""} onChange={(event) => assign(useCase.id, event.target.value)}>
                    <option value="">Default ({draft.providers[draft.default]?.label})</option>
                    {providers.filter(([id]) => id !== draft.default).map(([id, provider]) => <option key={id} value={id}>{provider.label}</option>)}
                  </select>
                </span>
                <span role="cell" className="mb-muted">{useCase.applies}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-section" aria-labelledby="mb-providers">
        <div className="section-heading">
          <div><span className="eyebrow">ENDPOINTS</span><h2 id="mb-providers">Providers</h2></div>
          <button className="text-button" disabled={providers.length >= 8} onClick={addProvider}><Plus size={15} /> Add provider</button>
        </div>
        <div className="mb-providers">
          {providers.map(([id, provider]) => {
            const check = checks[id];
            const keySet = provider.apiKeyEnv ? snapshot.keys[provider.apiKeyEnv] : null;
            const inUse = draft.default === id || Object.values(draft.useCases).includes(id);
            return (
              <article className="mb-provider" key={id} aria-label={provider.label}>
                <header>
                  <span className={`mb-kind ${provider.kind}`}>{KIND_LABEL[provider.kind]}</span>
                  <code>{id}</code>
                  {inUse && <span className="mb-inuse">{draft.default === id ? "Default" : "In use"}</span>}
                  <button className="mb-icon" aria-label={`Remove ${provider.label}`} disabled={draft.default === id || providers.length === 1} onClick={() => removeProvider(id)}><Trash2 size={16} /></button>
                </header>
                <label><span>Name</span><input value={provider.label} onChange={(event) => editProvider(id, { label: event.target.value })} /></label>
                <label><span>Type</span>
                  <select value={provider.kind} onChange={(event) => editProvider(id, { kind: event.target.value as ModelProvider["kind"] })}>
                    <option value="openai">OpenAI API</option>
                    <option value="vllm">vLLM (OpenAI-compatible)</option>
                  </select>
                </label>
                <label className="wide"><span>Base URL</span><input value={provider.baseUrl} spellCheck={false} onChange={(event) => editProvider(id, { baseUrl: event.target.value })} /></label>
                <label className="wide"><span>Model</span><input value={provider.model} spellCheck={false} onChange={(event) => editProvider(id, { model: event.target.value })} /></label>
                <label><span>Key variable</span>
                  <select value={provider.apiKeyEnv} onChange={(event) => editProvider(id, { apiKeyEnv: event.target.value })}>
                    <option value="">None</option>
                    {KEY_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <div className="mb-key"><KeyRound size={15} />{keySet === null ? <span className="mb-muted">No key sent</span> : keySet ? <span>Set in .env</span> : <span className="warn">Not set in .env</span>}</div>
                <label className="mb-check wide">
                  <input type="checkbox" checked={provider.responsesApi} onChange={(event) => editProvider(id, { responsesApi: event.target.checked })} />
                  <span>Responses API with reasoning summaries (interbank only; without it, interbank uses Chat Completions)</span>
                </label>
                {provider.kind === "vllm" && loopback(provider.baseUrl) && <p className="mb-note wide">The interbank containers reach this host as <code>host.docker.internal</code>. On Linux, vLLM must also listen on the Docker bridge for interbank to use it.</p>}
                <footer className="wide">
                  <button className="secondary-button" disabled={check?.state === "running"} onClick={() => runCheck(id)}><PlugZap size={16} /> {check?.state === "running" ? "Checking…" : "Test connection"}</button>
                  {check?.state === "done" && <span className={`mb-result ${check.ok ? "ok" : "bad"}`} role="status">{check.ok ? <CircleCheck size={16} /> : <CircleAlert size={16} />}{check.text}</span>}
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** The backend a live use case will call, linking to Model backends. */
export function ModelChip({ experience, onOpen }: { experience?: string; onOpen: () => void }) {
  const useCase = MODEL_USE_CASES.find((item) => item.experience === experience);
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!useCase) return;
    let live = true;
    loadSnapshot()
      .then((snapshot) => {
        if (!live) return;
        const { provider } = providerFor(snapshot.registry, useCase.id);
        setLabel(snapshot.saved ? provider?.label ?? "Unknown" : ".env settings");
      })
      .catch(() => live && setLabel(null));
    return () => { live = false; };
  }, [useCase]);
  if (!useCase || !label) return null;
  return <button className="prototype-chip mb-chip" onClick={onOpen} title="Change in Model backends"><Cpu size={15} /> Model · {label}</button>;
}
