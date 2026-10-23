"use client";

import DrawioExplorer from "./map/drawio/DrawioExplorer.tsx";
import { architectureDiagrams } from "./map/drawio/registry.ts";

export default function ArchitectureMap({ caseId, title }: { caseId: string; title: string; frame?: unknown }) {
  const diagram = architectureDiagrams[caseId];
  if (!diagram) return null;
  return <DrawioExplorer key={caseId} {...diagram} title={title} />;
}
