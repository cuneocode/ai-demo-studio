"use client";

import { Component, createElement, lazy, type ReactNode } from "react";
import type { WorkspaceKey } from "../../config/demo-contract.ts";
import type { WorkspaceProps } from "./workspace-contract";

const workspaces = {
  banking: lazy(() => import("../../demos/brahe-bank/ui/Workspace")),
  fraud: lazy(() => import("../../demos/fraud-modeling/ui/Workspace")),
  briefing: lazy(() => import("../../demos/company-briefing/ui/Workspace")),
  research: lazy(() => import("../../demos/market-research/ui/Workspace")),
  advisory: lazy(() => import("../../demos/client-advisory/ui/Workspace")),
  vulnerability: lazy(() => import("../../demos/code-vulnerability/ui/Workspace")),
  sar: lazy(() => import("../../demos/sar-support/ui/Workspace")),
  interbank: lazy(() => import("../../demos/interbank-a2a/ui/Workspace")),
} satisfies Record<WorkspaceKey, ReturnType<typeof lazy>>;

class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <section className="industry-empty" role="alert"><h2>Workspace unavailable</h2><p>The demo could not load. Reload to reconnect to saved runs.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload workspace</button></section> : this.props.children;
  }
}
export default function DemoWorkspace({ workspaceKey, ...props }: WorkspaceProps & { workspaceKey: WorkspaceKey }) {
  return <WorkspaceBoundary>{createElement(workspaces[workspaceKey], props)}</WorkspaceBoundary>;
}
