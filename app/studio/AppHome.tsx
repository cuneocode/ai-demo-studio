"use client";

import Link from "next/link";
import { ArrowRight, Grid2X2, Library, ServerCog, ShieldCheck, Activity } from "lucide-react";
import { apps } from "../../config/apps.ts";
import type { AppDefinition } from "../../config/app-contract.ts";
import { useStudioContent, withModule } from "./content/ContentProvider";
import { resolvedCatalogForApp } from "./catalog";
import { CatalogIcon } from "./catalog.ts";

export function AppHome({ enabledApps }: { enabledApps?: string[] | null }) {
  const content = useStudioContent();
  return <div className="industry-home">
    <div className="page-heading"><div><span className="breadcrumb">AI Demo Studio</span><h1>Use case libraries</h1><p>Explore industry, security, and horizontal use cases with shared models, controls, and runtime management.</p></div></div>
    <section className="industry-app-grid" aria-label="Use case libraries">
      {apps.filter(app => !enabledApps || enabledApps.includes(app.id)).map(app => {
        return <Link className="industry-app-card" href={withModule(`/apps/${app.id}`, content.moduleId)} key={app.id} aria-label={`Open ${app.name} app`}>
          <span className="industry-app-icon"><CatalogIcon name={app.iconKey} size={26} /></span>
          <div><h2>{app.name}</h2><p>{app.description}</p></div>
          <footer><span><Library size={16} />{resolvedCatalogForApp(app.id, content.entries).length} use case{resolvedCatalogForApp(app.id, content.entries).length === 1 ? "" : "s"}</span><span>{resolvedCatalogForApp(app.id, content.entries).length ? "Open library" : "Library ready for demos"}<ArrowRight size={17} /></span></footer>
        </Link>;
      })}
    </section>
    <section className="industry-platform" aria-label="Shared platform services">
      <div><span className="eyebrow">SHARED PLATFORM SERVICES</span><h2>Configure connections for every app</h2><p>Use cases inherit the platform connections and can select a different configured model when needed.</p></div>
      <div className="industry-platform-links">
        <Link href={withModule("/settings#st-models", content.moduleId)}><ServerCog size={20} /><span>Model endpoints<small>Shared defaults and per-use-case routes</small></span><ArrowRight size={17} /></Link>
        <Link href={withModule("/controls", content.moduleId)}><ShieldCheck size={20} /><span>AI Defense and controls<small>Inspection and enforcement evidence</small></span><ArrowRight size={17} /></Link>
        <Link href={withModule("/telemetry", content.moduleId)}><Activity size={20} /><span>Agent Observability<small>Run identity and trace delivery</small></span><ArrowRight size={17} /></Link>
      </div>
    </section>
  </div>;
}

export function EmptyApp({ app, stories = false }: { app: AppDefinition; stories?: boolean }) {
  const content = useStudioContent();
  return <section className="industry-empty">
    <span className="industry-app-icon"><CatalogIcon name={app.iconKey} size={30} /></span>
    <h2>{stories ? "No stories added yet" : "No use cases added yet"}</h2>
    <p>{stories ? `Stories will sequence the use cases in the ${app.name} library.` : `The ${app.name} library is ready for its use cases. Shared platform connections are available in Studio settings.`}</p>
    <div className="heading-actions"><Link className="secondary-button" href={withModule("/", content.moduleId)}><Grid2X2 size={17} />All libraries</Link><Link className="primary-button" href={withModule(`/apps/${app.id}/settings`, content.moduleId)}><ServerCog size={17} />App settings</Link></div>
  </section>;
}
