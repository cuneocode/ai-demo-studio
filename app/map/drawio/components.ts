import type { CanvasItem, ComponentType } from "./model.ts";
import type { Mode } from "../scene-model.ts";

/** IBM Carbon symbols from draw.io's extra icon library, version 1. */
export const componentTypes: Record<ComponentType, { label: string; icon: string; meaning: string }> = {
  agent: { label: "Agent", icon: "Bot", meaning: "Plans work and calls tools" },
  tool: { label: "Tool", icon: "Tools", meaning: "Performs a specific operation" },
  gateway: { label: "AI gateway", icon: "Gateway", meaning: "Proxies and inspects AI traffic" },
  model: { label: "AI model", icon: "Machine_Learning_Model", meaning: "Runs inference through a model or endpoint" },
  database: { label: "Database", icon: "Db2_Database", meaning: "Stores and queries persistent records" },
  service: { label: "Service", icon: "Api", meaning: "Application service or API" },
  control: { label: "Control", icon: "Security", meaning: "Checks or enforces a decision" },
  human: { label: "Human review", icon: "User", meaning: "A person reviews or approves the result" },
  data: { label: "Data", icon: "Document", meaning: "Documents, evidence, or a data artifact" },
  workflow: { label: "Workflow", icon: "Flow", meaning: "A stage containing multiple components" },
  telemetry: { label: "Telemetry", icon: "Chart_Line", meaning: "Captures or exports execution evidence" },
  infrastructure: { label: "Infrastructure", icon: "Bare_Metal_Server", meaning: "Hosts runtime processes and inference" },
  outcome: { label: "Outcome", icon: "Flag", meaning: "A returned, stopped, or withheld result" },
};
export const primaryComponentTypes: ComponentType[] = ["agent", "tool", "gateway", "model", "database"];
const html = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Same compact label in the native viewer and self-contained editable export. */
export function componentLabel(item: Pick<CanvasItem, "label" | "labelByMode" | "componentType" | "childScopeId" | "targetPageId">, expanded: boolean, mode: Mode, theme: string, symbols: Record<string, string>): string {
  const type = componentTypes[item.componentType ?? "workflow"];
  const title = html(item.labelByMode?.[mode] ?? item.label);
  const icon = `<img src="${symbols[type.icon]}" width="${expanded ? 24 : 28}" height="${expanded ? 24 : 28}" style="vertical-align:middle;${theme === "dark" ? "filter:invert(1);" : ""}" alt=""/>`;
  const kind = `<span style="font-size:12px;font-weight:400;opacity:.8">${type.label}</span>`;
  if (expanded) return `<div style="display:flex;align-items:center;gap:10px;line-height:1.3">${icon}<span style="font-weight:600;flex:1;min-width:0">${title}</span><span style="font-size:14px;font-weight:400;margin-left:auto;white-space:nowrap">− Collapse</span></div>`;
  return `<div style="display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:6px">${icon}${kind}</div><div style="font-weight:600;line-height:1.25">${title}</div>${item.childScopeId ? '<div style="font-size:12px;margin-top:6px">+ Expand</div>' : item.targetPageId ? '<div style="font-size:12px;margin-top:6px">Focus related component ›</div>' : ""}`;
}
