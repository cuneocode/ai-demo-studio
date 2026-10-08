"use client";

import Explorer from "./map/Explorer.tsx";

export default function ArchitectureMap({ caseId, title }: { caseId: string; title: string; frame?: unknown }) {
  return <Explorer caseId={caseId} title={title} />;
}
