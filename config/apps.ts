import { app as fsi } from "../verticals/fsi/app.ts";
import { app as healthcare } from "../verticals/healthcare/app.ts";
import { app as manufacturing } from "../verticals/manufacturing/app.ts";
import { app as retail } from "../verticals/retail/app.ts";
import { app as publicSector } from "../verticals/public-sector/app.ts";
import { demoDefinitions } from "./demos.ts";
import type { AppDefinition } from "./app-contract.ts";

export const apps: readonly AppDefinition[] = [fsi, healthcare, manufacturing, retail, publicSector];
export const appById = (id: string | null | undefined) => apps.find(app => app.id === id);
export const appForDemo = (id: string) => apps.find(app => app.catalog.some(entry => entry.demoId === id));
export const demoIdsForApp = (id: string | null | undefined): string[] => {
  if (id == null) return demoDefinitions.map(demo => demo.id);
  const app = appById(id);
  if (!app) throw new Error("Unknown industry app.");
  return app.catalog.map(entry => entry.demoId);
};

/** Validate registrations at their shared boundary, including empty vertical libraries. */
export function validateCatalog(definitions = demoDefinitions, applications = apps): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const demo of definitions) {
    if (ids.has(demo.id)) errors.push(`Duplicate demo ${demo.id}.`);
    ids.add(demo.id);
    if (demo.mode === "live" && (!demo.runtimeId || !demo.workspaceKey || !demo.model)) errors.push(`${demo.id}: live package needs a runtime, workspace, and model metadata.`);
    if (demo.mode === "illustrative" && demo.runtimeId) errors.push(`${demo.id}: illustrative package cannot own a live runtime.`);
    if (!demo.assets.narrative || !demo.assets.presenter || !demo.architectureId) errors.push(`${demo.id}: missing story, presenter, or architecture metadata.`);
  }
  const appIds = new Set<string>();
  for (const app of applications) {
    if (appIds.has(app.id)) errors.push(`Duplicate app ${app.id}.`);
    appIds.add(app.id);
    const categories = new Set(app.categories.map(category => category.id));
    const members = new Set<string>();
    for (const entry of app.catalog) {
      if (!ids.has(entry.demoId)) errors.push(`${app.id}: unknown demo ${entry.demoId}.`);
      if (members.has(entry.demoId)) errors.push(`${app.id}: duplicate membership ${entry.demoId}.`);
      if (!categories.has(entry.categoryId)) errors.push(`${app.id}: unknown category ${entry.categoryId}.`);
      members.add(entry.demoId);
    }
    for (const id of app.defaultStory) if (!members.has(id)) errors.push(`${app.id}: story references demo outside its library: ${id}.`);
  }
  return errors;
}

const problems = validateCatalog();
if (problems.length) throw new Error(problems.join("\n"));
