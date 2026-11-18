import { approvedModules, contentSnapshot } from './studio-content-api.ts';
for (const contentModule of await approvedModules()) {
  if (!contentModule.content) { console.log(`${contentModule.id}: no presentation content`); continue; }
  const snapshot = await contentSnapshot(contentModule.id);
  console.log(`${contentModule.id}: ${snapshot.entries.length} entries, revision ${snapshot.revision}`);
}
