"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Cpu, KeyRound, PlugZap, Plus, RefreshCw, RotateCcw, Save, ServerCog, Trash2, X } from "lucide-react";
import { KEY_NAMES, MODEL_USE_CASES, POLICY_LABEL, PROVIDER_ID, chainFor, defaultPolicy, policyFor, validateRegistry, type ExternalPolicy, type ModelProvider, type ModelRegistry } from "./studio-models";
import { SETTING_GROUPS, settingProblem, type Readiness, type SettingGroup, type SettingState } from "./studio-settings";
import Link from "next/link";
import { appById } from "../config/apps";
import { useStudioNav } from "./studio-nav";
import type { ServicesSnapshot } from "./runtime-contract";
import "./studio-settings.css";

const MODELS_API = "/api/studio/models";
const SETTINGS_API = "/api/studio/settings";
const SERVICES_API = "/api/studio/services";

type ProviderHealth = { up: boolean; detail: string };
type Route = { chain: string[]; active: string | null; fallback: boolean };
export type ModelSnapshot = {
  revision?: string; useCases?: typeof MODEL_USE_CASES;
  saved: boolean; problem: string | null; file: string; defaultsFile?: string; registry: ModelRegistry; keys: Record<string, boolean>;
  unconfigured?: Record<string, string>; health?: Record<string, ProviderHealth>; routes?: Record<string, Route>;
};
type SettingsSnapshot = { file: string; settings: Record<string, SettingState>; readiness: Readiness[] };
type Check = { state: "running" } | { state: "done"; ok: boolean; text: string };

const KIND_LABEL = { openai: "OpenAI API", vllm: "vLLM" } as const;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`The studio answered ${response.status}.`);
  return response.json();
}

async function sendJson<T>(url: string, method: "PUT" | "POST" | "PATCH", body: unknown): Promise<T> {
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

const scopedApi = (url: string, appId?: string | null) => `${url}${appId ? `?app=${encodeURIComponent(appId)}` : ""}`;

export default function StudioSettings() {
  const { appId } = useStudioNav();
  const app = appById(appId);
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getJson<SettingsSnapshot>(scopedApi(SETTINGS_API, appId)).then((next) => { setSettings(next); setLoadError(null); }).catch((error: Error) => setLoadError(error.message));
  }, [appId]);
  useEffect(reload, [reload]);
  useEffect(() => {
    if (!settings) return;
    const reveal = () => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [settings]);

  if (loadError) return <div className="st-page"><div className="st-banner danger"><CircleAlert size={18} /><span>Studio settings are unavailable: {loadError} They are served by <code>npm run dev</code>, <code>npm run dev:studio</code>, or <code>npm run start:studio</code>.</span></div></div>;
  if (!settings) return <div className="st-page"><p className="st-muted">Loading studio settings…</p></div>;

  return (
    <div className="st-page">
      <div className="page-heading">
        <div>
          <span className="breadcrumb">AI Demo Studio <span>/</span> {app ? `${app.shortName} settings` : "Studio settings"}</span>
          <h1>{app ? `${app.name} settings` : "Studio settings"}</h1>
          <p>{app ? <>Manage this app’s runtimes and model routes. Shared providers and credentials are managed in <Link href="/settings">platform settings</Link>. </> : "Bring your own models and credentials. "} Everything is saved to <code>{settings.file}</code> on this machine. The operator supplies scoped settings to each container stack. Keys are write-only: once saved, the studio shows only whether each one is set.</p>
        </div>
      </div>
      <ReadinessPanel rows={settings.readiness} />
      <ServicesPanel appId={appId} />
      <ModelsPanel appId={appId} modelKeys={settings.settings} onKeysSaved={setSettings} onModelsSaved={reload} />
      {!app && SETTING_GROUPS.filter((group) => group.id !== "models").map((group) => (
        <SettingsGroupPanel key={group.id} group={group} states={settings.settings} onSaved={setSettings} />
      ))}
    </div>
  );
}

function ReadinessPanel({ rows }: { rows: Readiness[] }) {
  return (
    <section className="st-section" aria-labelledby="st-readiness">
      <div className="section-heading"><div><span className="eyebrow">LIVE DEMOS</span><h2 id="st-readiness">Live configuration</h2></div></div>
      <p className="st-muted">Configuration checks only. The library shows whether each live service is responding; recorded demos need no credentials.</p>
      {rows.length === 0 && <p className="st-muted">This app has no live configuration requirements yet.</p>}
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

function ServicesPanel({ appId }: { appId?: string | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  const endpoint = scopedApi(SERVICES_API, appId);
  const [status, setStatus] = useState<ServicesSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, string>>({});
  const runningJob = status?.services.some(row => row.job?.state === "running");
  const refresh = useCallback(() => {
    getJson<ServicesSnapshot>(endpoint).then(setStatus).catch(() => setError("The Studio operator is unreachable. Retrying."));
  }, [endpoint]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, runningJob ? 1500 : 4000);
    return () => clearInterval(timer);
  }, [refresh, runningJob]);
  const act = async (action: string, ids?: string[], component?: string) => {
    setBusy(action); setError(null);
    try {
      if (action === "logs" && ids) {
        const result = await sendJson<{ log: string }>(endpoint, "POST", { action, ids });
        setLogs(previous => ({ ...previous, [ids[0]]: result.log || "No container logs yet." }));
      } else setStatus(await sendJson<ServicesSnapshot>(endpoint, "POST", { action, ids, ...(component ? { component } : {}) }));
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(null); }
  };
  const pendingCount = status?.services.reduce((total, row) => total + (row.up ? row.pending?.length ?? 0 : 0), 0) ?? 0;
  const available = status?.docker?.ready !== false;
  return <section className="st-section" aria-labelledby="st-services">
    <div className="section-heading">
      <div><span className="eyebrow">USE-CASE CONTAINERS</span><h2 id="st-services">Services</h2></div>
      <button className="primary-button" disabled={!status?.services.some(row => row.managed && row.up) || !available || busy !== null || runningJob} onClick={() => act("apply", status?.services.filter(row => row.managed && row.up).map(row => row.id))}><RefreshCw size={16} />{pendingCount ? `Apply ${pendingCount} change${pendingCount === 1 ? "" : "s"}` : "Apply to running stacks"}</button>
    </div>
    <p className="st-muted st-intro">{appId ? `Operations affect this app’s library. ` : "Operations affect the selected platform runtimes. "}Start the demos you need. Each stack has its own containers and saved data. Stop preserves saved runs. Apply recreates running stacks with your saved credentials.</p>
    {status?.docker && !available && <p className="st-banner" role="alert">{status.docker.detail}</p>}
    {error && <p className="st-banner" role="alert">{error}</p>}
    {!!status?.services.length && <div className="heading-actions st-prepare"><button className="secondary-button" disabled={!available || !selected.length || busy !== null || runningJob} onClick={() => act("prepare", selected)}>Prepare {selected.length || "selected"} demo{selected.length === 1 ? "" : "s"}</button><span className="st-muted">Ready stacks stay running. Preparation starts selected stopped stacks sequentially.</span></div>}
    {status?.services.length === 0 && <p className="st-muted">This app has no executable demos yet.</p>}
    <div className="st-table" role="table" aria-label="Services">
      {status?.services.map(row => {
        const working = row.job?.state === "running";
        const disabled = !available || busy !== null || working;
        return <div className="st-stack" key={row.id}>
          <div className="st-row services" role="row" aria-label={`${row.label} stack`}>
            <label role="cell" className="st-check"><input type="checkbox" aria-label={`Prepare ${row.label}`} checked={selected.includes(row.id)} onChange={event => setSelected(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /><strong>{row.label}</strong></label><span role="cell" className="st-muted">:{row.port}</span>
            <span role="cell" className={`st-state ${row.up ? "up" : "down"}`}><ServerCog size={15} />{row.state ?? (row.up ? "Running" : "Stopped")}{row.up && !row.managed ? " · external service" : ""}</span>
            <span role="cell" className="st-actions">
              {!!row.pending?.length && <span className="st-pending">{row.pending.length} change{row.pending.length === 1 ? "" : "s"} to apply</span>}
              {!row.up && <button className="secondary-button" disabled={disabled} onClick={() => act("start", [row.id])}>Start</button>}
              {row.managed && <button className="secondary-button" disabled={disabled} onClick={() => act("stop", [row.id])}>Stop</button>}
              {row.managed && <button className="secondary-button" disabled={disabled} onClick={() => act("restart", [row.id])}>Restart</button>}
              <button className="secondary-button" disabled={disabled || (row.up && !row.managed)} onClick={() => act("build", [row.id])}>Build</button>
              <button className="secondary-button" disabled={disabled || !row.managed} onClick={() => act("logs", [row.id])}>Logs</button>
              {row.controls && <button className="secondary-button" disabled={disabled} onClick={() => act("controls", [row.id])}>Register hosted controls</button>}
            </span>
          </div>
          {row.detail && <p className="st-muted">{row.detail}</p>}
          {row.components?.map(component => <div key={component.id} className="st-note"><strong>{component.label}</strong>: {component.requirements}. <button className="secondary-button" disabled={disabled} onClick={() => act("start-component", [row.id], component.id)}>Start {component.label}</button> <button className="secondary-button" disabled={disabled} onClick={() => act("stop-component", [row.id], component.id)}>Stop {component.label}</button></div>)}
          {row.job && row.job.state !== "idle" && <details className="st-log" open={working || row.job.state === "failed"}>
            <summary>{row.label}: {row.job.operation} {row.job.state}</summary><pre>{row.job.log.join("\n")}</pre>
          </details>}
          {logs[row.id] && <details className="st-log" open><summary>{row.label} container logs</summary><pre>{logs[row.id]}</pre></details>}
        </div>;
      })}
    </div>
    {status?.packages?.filter(item => item.mode === "illustrative").map(item => <p key={item.id} className="st-note">{item.title}: illustrative module with no executable backend.</p>)}
    <p className="st-note">Stacks keep running when Studio closes. Hosted controls use the explicit registration action for each supported stack.</p>
  </section>;
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

function ModelsPanel({ appId, modelKeys, onKeysSaved, onModelsSaved }: { appId?: string | null; modelKeys: Record<string, SettingState>; onKeysSaved: (next: SettingsSnapshot) => void; onModelsSaved: () => void }) {
  const [snapshot, setSnapshot] = useState<ModelSnapshot | null>(null);
  const [draft, setDraft] = useState<ModelRegistry | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    getJson<ModelSnapshot>(scopedApi(MODELS_API, appId)).then((next) => { setSnapshot(next); setDraft(next.registry); }).catch((error: Error) => setSaveError(error.message));
  }, [appId]);

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
    update({ ...draft, providers: { ...draft.providers, [id]: { label: `Endpoint ${index}`, kind: "vllm", baseUrl: "http://127.0.0.1:8000/v1", model: "", apiKeyEnv: "", responsesApi: false, private: true } } });
  };
  const removeProvider = (id: string) => {
    const useCases = Object.fromEntries(Object.entries(draft.useCases).map(([useCase, route]) => {
      const chain = route.chain?.filter((item) => item !== id);
      return [useCase, { ...route, chain: chain?.length ? chain : undefined }];
    }));
    update({ ...draft, chain: draft.chain.filter((item) => item !== id), providers: without(draft.providers, id), useCases });
  };
  const setUseCase = (useCase: string, patch: Partial<{ chain: string[] | undefined; externalPolicy: ExternalPolicy | undefined }>, keepChain = false) => {
    const next = { ...draft.useCases[useCase], ...patch };
    if (!keepChain && next.chain && JSON.stringify(next.chain) === JSON.stringify(draft.chain)) delete next.chain;
    if (next.externalPolicy === defaultPolicy(useCase)) delete next.externalPolicy;
    const rest = without(draft.useCases, useCase);
    update({ ...draft, useCases: next.chain || next.externalPolicy ? { ...rest, [useCase]: next } : rest });
  };
  const unconfigured = snapshot.saved ? {} : snapshot.unconfigured ?? {};
  const providerStatus = (id: string) => unconfigured[id] ? { tone: "skip", text: `Skipped: ${unconfigured[id]}` }
    : snapshot.health?.[id] ? { tone: snapshot.health[id].up ? "up" : "down", text: snapshot.health[id].up ? "Answering" : snapshot.health[id].detail } : null;
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
      const routes = Object.fromEntries((snapshot.useCases ?? MODEL_USE_CASES).filter(item => JSON.stringify(snapshot.registry.useCases[item.id]) !== JSON.stringify(draft.useCases[item.id])).map(item => [item.id, draft.useCases[item.id] ?? null]));
      const body = await sendJson<ModelSnapshot>(scopedApi(MODELS_API, appId), appId ? "PATCH" : "PUT", appId ? { revision: snapshot.revision, routes } : { revision: snapshot.revision, registry: draft });
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
          <button className="secondary-button" disabled={saving} onClick={() => { getJson<ModelSnapshot>(scopedApi(MODELS_API, appId)).then(next => { setSnapshot(next); setDraft(next.registry); setSaveError(null); }).catch(error => setSaveError(error.message)); }}>Reload models</button>
          <button className="secondary-button" disabled={!dirty || saving} onClick={() => { setDraft(snapshot.registry); setSaveError(null); }}><RotateCcw size={16} /> Revert</button>
          <button className="primary-button" disabled={(!dirty && snapshot.saved) || saving || Boolean(problem)} onClick={save}><Save size={16} /> {saving ? "Saving…" : "Save models"}</button>
        </div>
      </div>
      <p className="st-muted st-intro">Every live use case tries its chain in order and uses the first backend that answers a health check, so one setting serves all demos: for example Sparky when it is up, otherwise OpenAI. Each response reports which model answered. Model routes apply on the next request. Apply saved credential changes to running stacks.</p>

      {snapshot.problem ? <div className="st-banner danger"><CircleAlert size={18} /><span>The saved file at <code>{snapshot.file}</code> was rejected ({snapshot.problem}). Services use the committed defaults until you save again.</span></div>
        : !snapshot.saved ? <div className="st-banner"><CircleAlert size={18} /><span>Nothing saved yet, so every service uses the committed defaults in <code>{snapshot.defaultsFile ?? "config/studio-models.default.json"}</code>, shown below. Saving writes <code>{snapshot.file}</code>.</span></div>
        : dirty ? <div className="st-banner"><CircleAlert size={18} /><span>Unsaved model changes.</span></div>
        : null}
      {(saveError || (dirty && problem)) && <div className="st-banner danger" role="alert"><CircleAlert size={18} /><span>{saveError ?? problem}</span></div>}

      {appId && <p className="st-muted">Provider definitions and the default chain are shared. <Link href="/settings#st-models">Edit platform models</Link>.</p>}
      <fieldset className="st-shared-config" disabled={Boolean(appId)}><h3 className="st-subhead">Default chain for all use cases</h3>
      <ChainEditor label="Default chain" chain={draft.chain} providers={draft.providers} status={providerStatus} onChange={(chain) => update({ ...draft, chain })} /></fieldset>

      <h3 className="st-subhead">Per use case</h3>
      <div className="st-table" role="table" aria-label="Use case overrides">
        <div className="st-row head st-route" role="row"><span role="columnheader">Use case</span><span role="columnheader">Model calls</span><span role="columnheader">Chain</span><span role="columnheader">Hosted models</span></div>
        {(snapshot.useCases ?? MODEL_USE_CASES).map((useCase) => {
          const current = chainFor(draft, useCase.id);
          const policy = policyFor(draft, useCase.id);
          const route = !dirty ? snapshot.routes?.[useCase.id] : undefined;
          return (
            <div className="st-row st-route" role="row" key={useCase.id} aria-label={useCase.title}>
              <span role="cell"><strong>{useCase.title}</strong><small className="st-muted st-applies">{useCase.applies}</small></span>
              <span role="cell">{useCase.calls}</span>
              <span role="cell" className="st-route-chain">
                {current.overridden
                  ? <ChainEditor label={`${useCase.title} chain`} chain={current.ids} providers={draft.providers} status={providerStatus} compact onChange={(chain) => setUseCase(useCase.id, { chain })} />
                  : <span className="st-chain-text">{current.providers.filter(({ id }) => !unconfigured[id]).map(({ id, provider }) => provider?.label ?? id).join(" → ") || "No backend"} <small className="st-muted">(default)</small></span>}
                <button type="button" className="text-button" onClick={() => setUseCase(useCase.id, { chain: current.overridden ? undefined : [...draft.chain] }, true)}>{current.overridden ? "Use default chain" : "Customize"}</button>
                {route && <small className={`st-answering ${route.active ? (route.fallback ? "fallback" : "up") : "down"}`}>{route.active ? `Answering now: ${draft.providers[route.active]?.label}${route.fallback ? " (fallback)" : ""}` : "No backend answering"}</small>}
              </span>
              <span role="cell">
                <select aria-label={`${useCase.title} hosted models`} value={policy} onChange={(event) => setUseCase(useCase.id, { externalPolicy: event.target.value as ExternalPolicy })}>
                  {(Object.keys(POLICY_LABEL) as ExternalPolicy[]).filter((value) => !(useCase.clientData && value === "allow")).map((value) => <option key={value} value={value}>{POLICY_LABEL[value]}</option>)}
                </select>
                {useCase.clientData && <small className="st-muted st-applies">Client data: a hosted model is used only after Cisco AI Defense (enforce) inspects the request; without AI Defense, the hosted model is refused and any sample fallback is labelled.</small>}
              </span>
            </div>
          );
        })}
      </div>

      {!appId && <fieldset className="st-shared-config"><div className="st-subhead-row">
        <h3 className="st-subhead">Providers</h3>
        <button className="text-button" disabled={providers.length >= 8} onClick={addProvider}><Plus size={15} /> Add provider</button>
      </div>
      <div className="st-providers">
        {providers.map(([id, provider]) => {
          const check = checks[id];
          const inDefault = draft.chain.includes(id);
          const inUse = inDefault || Object.values(draft.useCases).some((route) => route.chain?.includes(id));
          const keyName = provider.apiKeyEnv;
          const status = providerStatus(id);
          return (
            <article className="st-provider" key={id} aria-label={provider.label}>
              <header>
                <span className={`st-kind ${provider.kind}`}>{KIND_LABEL[provider.kind]}</span>
                <code>{id}</code>
                {inUse && <span className="st-inuse">{inDefault ? "Default chain" : "In use"}</span>}
                {status && <span className={`st-health ${status.tone}`}>{status.text}</span>}
                <button className="st-icon" aria-label={`Remove ${provider.label}`} disabled={(inDefault && draft.chain.length === 1) || providers.length === 1} onClick={() => removeProvider(id)}><Trash2 size={16} /></button>
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
                <input type="checkbox" checked={provider.private} onChange={(event) => editProvider(id, { private: event.target.checked })} />
                <span>Private: data stays on infrastructure you control (Sparky, a Cisco UCS node). Hosted providers trigger AI Defense pre-egress inspection for client data.</span>
              </label>
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
      </div></fieldset>}
    </section>
  );
}

type StatusFn = (id: string) => { tone: string; text: string } | null;

/** An ordered list of providers: the first healthy one answers. */
function ChainEditor({ label, chain, providers, status, onChange, compact = false }: {
  label: string; chain: string[]; providers: Record<string, ModelProvider>; status: StatusFn; onChange: (chain: string[]) => void; compact?: boolean;
}) {
  const move = (index: number, by: number) => {
    const next = [...chain];
    next.splice(index + by, 0, ...next.splice(index, 1));
    onChange(next);
  };
  const available = Object.entries(providers).filter(([id]) => !chain.includes(id));
  return (
    <div className={`st-chain${compact ? " compact" : ""}`} role="list" aria-label={label}>
      {chain.map((id, index) => {
        const provider = providers[id];
        const state = status(id);
        return (
          <div className={`st-chain-item ${state?.tone ?? ""}`} role="listitem" key={id} aria-label={`${index + 1}. ${provider?.label ?? id}`}>
            <span className="st-chain-index">{index + 1}</span>
            <span className="st-chain-copy"><strong><Cpu size={14} /> {provider?.label ?? id}</strong>{!compact && <small>{provider?.model}{provider?.private ? " · private" : " · hosted"}</small>}{state && <small className={`st-health ${state.tone}`}>{state.text}</small>}</span>
            <span className="st-chain-actions">
              <button type="button" className="st-icon plain" aria-label={`Move ${provider?.label ?? id} up in ${label}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
              <button type="button" className="st-icon plain" aria-label={`Move ${provider?.label ?? id} down in ${label}`} disabled={index === chain.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
              <button type="button" className="st-icon" aria-label={`Remove ${provider?.label ?? id} from ${label}`} disabled={chain.length === 1} onClick={() => onChange(chain.filter((item) => item !== id))}><X size={14} /></button>
            </span>
          </div>
        );
      })}
      {available.length > 0 && (
        <select className="st-chain-add" aria-label={`Add a backend to ${label}`} value="" onChange={(event) => { if (event.target.value) onChange([...chain, event.target.value]); }}>
          <option value="">Add fallback…</option>
          {available.map(([id, provider]) => <option key={id} value={id}>{provider.label}</option>)}
        </select>
      )}
    </div>
  );
}
