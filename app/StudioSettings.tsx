"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Cpu, KeyRound, PlugZap, Plus, RefreshCw, RotateCcw, Save, ServerCog, Trash2 } from "lucide-react";
import { KEY_NAMES, MODEL_USE_CASES, PROVIDER_ID, providerFor, validateRegistry, type ModelProvider, type ModelRegistry } from "./studio-models";
import { SETTING_GROUPS, settingProblem, type Readiness, type SettingGroup, type SettingState } from "./studio-settings";
import "./studio-settings.css";

const MODELS_API = "/api/studio/models";
const SETTINGS_API = "/api/studio/settings";
const SERVICES_API = "/api/studio/services";

type ModelSnapshot = { saved: boolean; problem: string | null; file: string; registry: ModelRegistry; keys: Record<string, boolean> };
type SettingsSnapshot = { file: string; settings: Record<string, SettingState>; readiness: Readiness[] };
type ServiceRow = { id: string; label: string; port: number; up: boolean; detail?: string; managed: boolean; installed: boolean; install: string; pending: string[] | null };
type ServicesSnapshot = {
  services: ServiceRow[];
  interbank: { id: string; label: string; port: number; up: boolean; pending: string[] | null; job: { state: "idle" | "running" | "succeeded" | "failed"; log: string[]; finishedAt?: string } };
};
type Check = { state: "running" } | { state: "done"; ok: boolean; text: string };

const KIND_LABEL = { openai: "OpenAI API", vllm: "vLLM" } as const;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`The studio answered ${response.status}.`);
  return response.json();
}

async function sendJson<T>(url: string, method: "PUT" | "POST", body: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parsed.error ?? `The studio answered ${response.status}.`);
  return parsed;
}

const without = <T,>(record: Record<string, T>, key: string) => Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));
const loopback = (url: string) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url);

function checkText(body: { ok: boolean; detail?: string; count?: number; listed?: boolean; sample?: string[] }, model: string) {
  if (!body.ok) return body.detail ?? "The check failed.";
  if (body.listed) return `Reachable; ${model} is served.`;
  const sample = body.sample?.length ? ` It lists ${body.sample.slice(0, 4).join(", ")}${(body.count ?? 0) > 4 ? ", …" : ""}.` : "";
  return `Reachable, but ${model} is not in its model list.${sample}`;
}

function CheckResult({ check }: { check?: Check }) {
  if (check?.state !== "done") return null;
  return <span className={`st-result ${check.ok ? "ok" : "bad"}`} role="status">{check.ok ? <CircleCheck size={16} /> : <CircleAlert size={16} />}{check.text}</span>;
}

export default function StudioSettings() {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getJson<SettingsSnapshot>(SETTINGS_API).then((next) => { setSettings(next); setLoadError(null); }).catch((error: Error) => setLoadError(error.message));
  }, []);
  useEffect(reload, [reload]);

  if (loadError) return <div className="st-page"><div className="st-banner danger"><CircleAlert size={18} /><span>Studio settings are unavailable: {loadError} They are served by <code>npm run dev</code>, <code>npm run dev:studio</code>, or <code>npm run start:studio</code>.</span></div></div>;
  if (!settings) return <div className="st-page"><p className="st-muted">Loading studio settings…</p></div>;

  return (
    <div className="st-page">
      <div className="page-heading">
        <div>
          <span className="breadcrumb">FSI AI Demo Studio <span>/</span> Studio settings</span>
          <h1>Studio settings</h1>
          <p>Bring your own models and credentials. Everything is saved to <code>{settings.file}</code> on this machine, which every demo service reads. Keys are write-only: once saved, the studio shows only whether each one is set.</p>
        </div>
      </div>
      <ReadinessPanel rows={settings.readiness} />
      <ServicesPanel />
      <ModelsPanel modelKeys={settings.settings} onKeysSaved={setSettings} onModelsSaved={reload} />
      {SETTING_GROUPS.filter((group) => group.id !== "models").map((group) => (
        <SettingsGroupPanel key={group.id} group={group} states={settings.settings} onSaved={setSettings} />
      ))}
    </div>
  );
}

function ReadinessPanel({ rows }: { rows: Readiness[] }) {
  return (
    <section className="st-section" aria-labelledby="st-readiness">
      <div className="section-heading"><div><span className="eyebrow">LIVE DEMOS</span><h2 id="st-readiness">Use case readiness</h2></div></div>
      <div className="st-readiness">
        {rows.map((row) => (
          <article key={row.id} className={row.ready ? "ready" : "missing"} aria-label={`${row.title} readiness`}>
            <header>{row.ready ? <CircleCheck size={16} /> : <CircleAlert size={16} />}<strong>{row.title}</strong></header>
            {row.missing.length > 0 && <p className="st-missing">Needs {row.missing.join(", ")}</p>}
            <p className="st-muted">{row.notes.join(" · ")}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ServicesPanel() {
  const [status, setStatus] = useState<ServicesSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getJson<ServicesSnapshot>(SERVICES_API).then((next) => { setStatus(next); setError(null); }).catch(() => setError("The studio is restarting or unreachable; retrying."));
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, status?.interbank.job.state === "running" ? 1500 : 4000);
    return () => clearInterval(timer);
  }, [refresh, status?.interbank.job.state]);

  const act = async (action: string, ids?: string[]) => {
    setBusy(action);
    setError(null);
    try { setStatus(await sendJson<ServicesSnapshot>(SERVICES_API, "POST", { action, ids })); } catch (failure) { setError((failure as Error).message); } finally { setBusy(null); }
  };

  const pendingCount = status?.services.reduce((total, row) => total + (row.managed && row.pending ? row.pending.length : 0), 0) ?? 0;
  const job = status?.interbank.job;

  return (
    <section className="st-section" aria-labelledby="st-services">
      <div className="section-heading">
        <div><span className="eyebrow">APPLY CHANGES</span><h2 id="st-services">Services</h2></div>
        <button className="primary-button" disabled={!status || busy !== null} onClick={() => act("apply")}><RefreshCw size={16} /> {busy === "apply" ? "Restarting…" : pendingCount ? `Apply ${pendingCount} change${pendingCount === 1 ? "" : "s"}` : "Restart services"}</button>
      </div>
      <p className="st-muted st-intro">Services read their credentials when they start. Apply restarts the services this studio launched and starts any that are stopped; services started elsewhere must be restarted where they run.</p>
      {error && <div className="st-banner"><CircleAlert size={18} /><span>{error}</span></div>}
      <div className="st-table" role="table" aria-label="Services">
        {status?.services.map((row) => (
          <div className="st-row services" role="row" key={row.id}>
            <strong role="cell">{row.label}</strong>
            <span role="cell" className="st-muted">:{row.port}</span>
            <span role="cell" className={`st-state ${row.up ? "up" : "down"}`}>
              <ServerCog size={15} />
              {!row.installed ? <>Not installed · <code>{row.install}</code></>
                : row.up ? (row.managed ? "Running (started by the studio)" : "Running outside the studio") : row.managed ? "Starting…" : "Stopped"}
            </span>
            <span role="cell" className="st-muted">
              {row.managed && row.pending?.length ? <span className="st-pending">{row.pending.length} change{row.pending.length === 1 ? "" : "s"} to apply</span>
                : row.up && !row.managed ? "Restart it to apply settings" : row.managed ? "Up to date" : ""}
            </span>
          </div>
        ))}
        {status && (
          <div className="st-row services" role="row">
            <strong role="cell">{status.interbank.label}</strong>
            <span role="cell" className="st-muted">:{status.interbank.port}</span>
            <span role="cell" className={`st-state ${status.interbank.up ? "up" : "down"}`}><ServerCog size={15} />{job?.state === "running" ? "Rebuilding…" : status.interbank.up ? "Running" : "Stopped"}</span>
            <span role="cell" className="st-actions">
              {status.interbank.pending?.length ? <span className="st-pending">{status.interbank.pending.length} to apply</span> : status.interbank.pending === null ? <span className="st-muted">Rebuild to apply settings</span> : <span className="st-muted">Up to date</span>}
              <button className="secondary-button" disabled={job?.state === "running" || busy !== null} onClick={() => act("rebuild-interbank")}><RefreshCw size={15} /> {status.interbank.up ? "Rebuild lab" : "Start lab"}</button>
            </span>
          </div>
        )}
      </div>
      {job && job.state !== "idle" && (
        <details className="st-log" open={job.state !== "succeeded"}>
          <summary>{job.state === "running" ? "Interbank rebuild running (about a minute)" : job.state === "succeeded" ? "Interbank lab rebuilt" : "Interbank rebuild failed"}</summary>
          <pre>{job.log.join("\n")}</pre>
        </details>
      )}
    </section>
  );
}

function SettingsGroupPanel({ group, states, onSaved }: { group: SettingGroup; states: Record<string, SettingState>; onSaved: (next: SettingsSnapshot) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [clear, setClear] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | undefined>();
  const dirty = Object.keys(draft).length > 0 || clear.length > 0;
  const problem = useMemo(() => Object.entries(draft).map(([name, value]) => settingProblem(name, value.trim())).find(Boolean) ?? null, [draft]);

  const edit = (name: string, value: string) => {
    const saved = states[name]?.value ?? "";
    setDraft((current) => (!group.fields.find((field) => field.name === name)?.secret && value === saved ? without(current, name) : { ...current, [name]: value }));
    setClear((current) => current.filter((item) => item !== name));
    setCheck(undefined);
    setError(null);
  };
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const set = Object.fromEntries(Object.entries(draft).filter(([, value]) => value.trim()));
      const emptied = Object.entries(draft).filter(([, value]) => !value.trim()).map(([name]) => name);
      onSaved(await sendJson<SettingsSnapshot>(SETTINGS_API, "PUT", { set, clear: [...clear, ...emptied] }));
      setDraft({});
      setClear([]);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const runCheck = async () => {
    setCheck({ state: "running" });
    try {
      const values = Object.fromEntries(Object.entries(draft).filter(([, value]) => value.trim()));
      const body = await sendJson<{ ok: boolean; detail: string }>(`${SETTINGS_API}/check`, "POST", { target: group.test, values });
      setCheck({ state: "done", ok: body.ok, text: body.detail });
    } catch (failure) {
      setCheck({ state: "done", ok: false, text: (failure as Error).message });
    }
  };

  return (
    <section className="st-section" aria-labelledby={`st-${group.id}`}>
      <div className="section-heading">
        <div><span className="eyebrow">{group.eyebrow}</span><h2 id={`st-${group.id}`}>{group.title}</h2></div>
        <div className="heading-actions">
          {group.test && <button className="secondary-button" disabled={check?.state === "running" || Boolean(problem)} onClick={runCheck}><PlugZap size={16} /> {check?.state === "running" ? "Checking…" : "Test"}</button>}
          <button className="secondary-button" disabled={!dirty || saving} onClick={() => { setDraft({}); setClear([]); setError(null); }}><RotateCcw size={16} /> Revert</button>
          <button className="primary-button" disabled={!dirty || saving || Boolean(problem)} onClick={save}><Save size={16} /> {saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      <p className="st-muted st-intro">{group.summary}</p>
      {(error || problem) && <div className="st-banner danger" role="alert"><CircleAlert size={18} /><span>{error ?? problem}</span></div>}
      <CheckResult check={check} />
      <div className="st-fields">
        {group.fields.map((field) => {
          const state = states[field.name];
          const cleared = clear.includes(field.name);
          return (
            <label key={field.name} className="st-field">
              <span className="st-field-label">
                {field.label}
                {field.secret && <em className={cleared ? "warn" : state?.set ? "ok" : "warn"}><KeyRound size={13} />{cleared ? "Will be cleared" : state?.set ? "Set" : "Not set"}</em>}
              </span>
              {field.options ? (
                <select value={draft[field.name] ?? state?.value ?? ""} onChange={(event) => edit(field.name, event.target.value)}>
                  {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <span className="st-input-row">
                  <input
                    type={field.secret ? "password" : "text"}
                    autoComplete="off"
                    spellCheck={false}
                    value={draft[field.name] ?? (field.secret ? "" : state?.value ?? "")}
                    placeholder={field.secret ? (state?.set ? "Paste to replace" : "Paste key") : field.placeholder}
                    onChange={(event) => edit(field.name, event.target.value)}
                  />
                  {field.secret && state?.set && !cleared && <button type="button" className="st-icon" aria-label={`Clear ${field.label}`} onClick={() => { setClear((current) => [...current, field.name]); setDraft((current) => without(current, field.name)); }}><Trash2 size={15} /></button>}
                </span>
              )}
              {field.help && <small>{field.help}</small>}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function ModelsPanel({ modelKeys, onKeysSaved, onModelsSaved }: { modelKeys: Record<string, SettingState>; onKeysSaved: (next: SettingsSnapshot) => void; onModelsSaved: () => void }) {
  const [snapshot, setSnapshot] = useState<ModelSnapshot | null>(null);
  const [draft, setDraft] = useState<ModelRegistry | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    getJson<ModelSnapshot>(MODELS_API).then((next) => { setSnapshot(next); setDraft(next.registry); }).catch((error: Error) => setSaveError(error.message));
  }, []);

  const dirty = useMemo(() => Boolean(snapshot && draft && JSON.stringify(snapshot.registry) !== JSON.stringify(draft)), [snapshot, draft]);
  const problem = useMemo(() => {
    if (!draft) return null;
    const result = validateRegistry(draft);
    return "error" in result ? result.error : null;
  }, [draft]);

  if (!snapshot || !draft) return <section className="st-section"><p className="st-muted">{saveError ?? "Loading models…"}</p></section>;

  const providers = Object.entries(draft.providers);
  const keySet = (name: string) => Boolean(modelKeys[name]?.set);
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
      const body = await sendJson<{ ok: boolean; detail?: string; listed?: boolean }>(MODELS_API, "POST", { provider });
      setChecks((current) => ({ ...current, [id]: { state: "done", ok: Boolean(body.ok && body.listed), text: checkText(body, provider.model) } }));
    } catch {
      setChecks((current) => ({ ...current, [id]: { state: "done", ok: false, text: "The studio could not run the check." } }));
    }
  };
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const body = await sendJson<ModelSnapshot>(MODELS_API, "PUT", draft);
      setSnapshot(body);
      setDraft(body.registry);
      onModelsSaved();
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const saveKey = async (name: string) => {
    try {
      onKeysSaved(await sendJson<SettingsSnapshot>(SETTINGS_API, "PUT", { set: { [name]: keyDrafts[name] } }));
      setKeyDrafts((current) => without(current, name));
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  return (
    <section className="st-section st-models" aria-labelledby="st-models">
      <div className="section-heading">
        <div><span className="eyebrow">MODELS</span><h2 id="st-models">Model backends</h2></div>
        <div className="heading-actions">
          <button className="secondary-button" disabled={!dirty || saving} onClick={() => { setDraft(snapshot.registry); setSaveError(null); }}><RotateCcw size={16} /> Revert</button>
          <button className="primary-button" disabled={(!dirty && snapshot.saved) || saving || Boolean(problem)} onClick={save}><Save size={16} /> {saving ? "Saving…" : "Save models"}</button>
        </div>
      </div>
      <p className="st-muted st-intro">The OpenAI-compatible endpoint every live use case calls, with optional overrides. Changes apply on each use case&apos;s next request; no restart needed.</p>

      {snapshot.problem ? <div className="st-banner danger"><CircleAlert size={18} /><span>The saved file at <code>{snapshot.file}</code> was rejected ({snapshot.problem}). Services use their own <code>.env</code> settings until you save again.</span></div>
        : !snapshot.saved ? <div className="st-banner"><CircleAlert size={18} /><span>Nothing saved yet, so each service uses its own <code>.env</code> model settings. Saving writes <code>{snapshot.file}</code>.</span></div>
        : dirty ? <div className="st-banner"><CircleAlert size={18} /><span>Unsaved model changes.</span></div>
        : null}
      {(saveError || (dirty && problem)) && <div className="st-banner danger" role="alert"><CircleAlert size={18} /><span>{saveError ?? problem}</span></div>}

      <h3 className="st-subhead">Default for all use cases</h3>
      <div className="st-default" role="radiogroup" aria-label="Default backend">
        {providers.map(([id, provider]) => (
          <button key={id} role="radio" aria-checked={draft.default === id} className={draft.default === id ? "active" : ""} onClick={() => update({ ...draft, default: id, useCases: Object.fromEntries(Object.entries(draft.useCases).filter(([, providerId]) => providerId !== id)) })}>
            <Cpu size={17} /><span><strong>{provider.label}</strong><small>{provider.model || "No model"}</small></span>
          </button>
        ))}
      </div>

      <h3 className="st-subhead">Per use case</h3>
      <div className="st-table" role="table" aria-label="Use case overrides">
        <div className="st-row head" role="row"><span role="columnheader">Use case</span><span role="columnheader">Model calls</span><span role="columnheader">Backend</span><span role="columnheader">Takes effect</span></div>
        {MODEL_USE_CASES.map((useCase) => {
          const current = providerFor(draft, useCase.id);
          return (
            <div className="st-row" role="row" key={useCase.id}>
              <strong role="cell">{useCase.title}</strong>
              <span role="cell">{useCase.calls}</span>
              <span role="cell">
                <select aria-label={`${useCase.title} backend`} value={current.overridden ? current.id : ""} onChange={(event) => assign(useCase.id, event.target.value)}>
                  <option value="">Default ({draft.providers[draft.default]?.label})</option>
                  {providers.filter(([id]) => id !== draft.default).map(([id, provider]) => <option key={id} value={id}>{provider.label}</option>)}
                </select>
              </span>
              <span role="cell" className="st-muted">{useCase.applies}</span>
            </div>
          );
        })}
      </div>

      <div className="st-subhead-row">
        <h3 className="st-subhead">Providers</h3>
        <button className="text-button" disabled={providers.length >= 8} onClick={addProvider}><Plus size={15} /> Add provider</button>
      </div>
      <div className="st-providers">
        {providers.map(([id, provider]) => {
          const check = checks[id];
          const inUse = draft.default === id || Object.values(draft.useCases).includes(id);
          const keyName = provider.apiKeyEnv;
          return (
            <article className="st-provider" key={id} aria-label={provider.label}>
              <header>
                <span className={`st-kind ${provider.kind}`}>{KIND_LABEL[provider.kind]}</span>
                <code>{id}</code>
                {inUse && <span className="st-inuse">{draft.default === id ? "Default" : "In use"}</span>}
                <button className="st-icon" aria-label={`Remove ${provider.label}`} disabled={draft.default === id || providers.length === 1} onClick={() => removeProvider(id)}><Trash2 size={16} /></button>
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
                <select value={keyName} onChange={(event) => editProvider(id, { apiKeyEnv: event.target.value })}>
                  <option value="">None</option>
                  {KEY_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <div className="st-key">{!keyName ? <span className="st-muted">No key sent</span> : keySet(keyName) ? <span><KeyRound size={15} /> Set</span> : <span className="warn"><KeyRound size={15} /> Not set</span>}</div>
              {keyName && (
                <label className="wide"><span>{keySet(keyName) ? `Replace ${keyName}` : `Paste ${keyName}`}</span>
                  <span className="st-input-row">
                    <input type="password" autoComplete="off" spellCheck={false} value={keyDrafts[keyName] ?? ""} placeholder="Saved to .env, never shown again" onChange={(event) => setKeyDrafts((current) => ({ ...current, [keyName]: event.target.value }))} />
                    <button type="button" className="secondary-button" disabled={!keyDrafts[keyName]?.trim() || Boolean(settingProblem(keyName, keyDrafts[keyName]?.trim() ?? ""))} onClick={() => saveKey(keyName)}><Save size={15} /> Save key</button>
                  </span>
                </label>
              )}
              <label className="st-check wide">
                <input type="checkbox" checked={provider.responsesApi} onChange={(event) => editProvider(id, { responsesApi: event.target.checked })} />
                <span>Responses API with reasoning summaries (interbank only; without it, interbank uses Chat Completions)</span>
              </label>
              {provider.kind === "vllm" && loopback(provider.baseUrl) && <p className="st-note wide">The interbank containers reach this host as <code>host.docker.internal</code>. On Linux, vLLM must also listen on the Docker bridge for interbank to use it.</p>}
              <footer className="wide">
                <button className="secondary-button" disabled={check?.state === "running"} onClick={() => runCheck(id)}><PlugZap size={16} /> {check?.state === "running" ? "Checking…" : "Test connection"}</button>
                <CheckResult check={check} />
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** The backend a live use case will call, linking to Studio settings. */
export function ModelChip({ experience, onOpen }: { experience?: string; onOpen: () => void }) {
  const useCase = MODEL_USE_CASES.find((item) => item.experience === experience);
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!useCase) return;
    let live = true;
    getJson<ModelSnapshot>(MODELS_API)
      .then((snapshot) => {
        if (!live) return;
        const { provider } = providerFor(snapshot.registry, useCase.id);
        setLabel(snapshot.saved ? provider?.label ?? "Unknown" : ".env settings");
      })
      .catch(() => live && setLabel(null));
    return () => { live = false; };
  }, [useCase]);
  if (!useCase || !label) return null;
  return <button className="prototype-chip st-chip" onClick={onOpen} title="Change in Studio settings"><Cpu size={15} /> Model · {label}</button>;
}
