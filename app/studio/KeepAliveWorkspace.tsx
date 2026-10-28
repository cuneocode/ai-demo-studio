"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Retain execution and form state while inactive workspaces stay outside the document. */
export default function KeepAliveWorkspace({ active, children, demoId }: { active: boolean; children: ReactNode; demoId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = document.createElement("div");
    element.dataset.workspaceSession = demoId;
    const frame = requestAnimationFrame(() => setContainer(element));
    return () => { cancelAnimationFrame(frame); element.remove(); };
  }, [demoId]);
  useLayoutEffect(() => {
    if (!container) return;
    if (active && host.current) host.current.appendChild(container);
    else container.remove();
    return () => { container.remove(); };
  }, [active, container]);
  return <div ref={host} hidden={!active} data-active-demo={active ? demoId : undefined}>
    {container && createPortal(children, container)}
  </div>;
}
