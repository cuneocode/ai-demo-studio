import { memo, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Bot, Database, Cpu, Cloud, Network, ShieldCheck, TerminalSquare } from "lucide-react";
import { COMPONENTS, LINKS, ORG_LABEL, type Component } from "./architecture";

const ICON = {
  console: TerminalSquare,
  agent: Bot,
  gateway: Network,
  guardrail: ShieldCheck,
  data: Database,
  model: Cpu,
  cloud: Cloud,
};
const KIND = {
  console: "Client",
  agent: "Agent",
  gateway: "AI gateway",
  guardrail: "Guardrail",
  data: "Database",
  model: "Model",
  cloud: "Service",
};

const HANDLES: Record<string, [string, string]> = {
  "console-gwa": ["r", "t"],
  "gwa-agenta": ["b", "t"],
  "gwa-gwb": ["r", "l"],
  "gwb-agentb": ["b", "t"],
  "gwa-aida": ["l", "r"],
  "gwb-aidb": ["r", "l"],
  "aida-cisco": ["t", "l"],
  "aidb-cisco": ["t", "r"],
  "agenta-db": ["l", "r"],
  "agentb-db": ["r", "l"],
  "agenta-llm": ["r", "l"],
  "agentb-llm": ["l", "r"],
  "agenta-ctl": ["b", "l"],
  "agentb-ctl": ["b", "r"],
};

type CardData = { component: Component; state: "idle" | "active" | "denied"; selected: boolean };

const SIDES = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left } as const;

const Card = memo(function Card({ data }: NodeProps) {
  const { component: c, state, selected } = data as CardData;
  const Icon = ICON[c.kind];
  return (
    <div className={`card kind-${c.kind} org-${c.org} state-${state} ${selected ? "selected" : ""}`}>
      {Object.entries(SIDES).map(([id, side]) => (
        <span key={id}>
          <Handle id={`s-${id}`} type="source" position={side} />
          <Handle id={`t-${id}`} type="target" position={side} />
        </span>
      ))}
      <div className="card-kicker">
        <Icon size={15} />
        {ORG_LABEL[c.org] === "Shared" ? KIND[c.kind] : `${ORG_LABEL[c.org]} · ${KIND[c.kind]}`}
      </div>
      <strong>{c.label}</strong>
      <small>{c.subtitle}</small>
      <div className="card-actions">
        {c.enforcement && <span className="enforce">Enforcement point</span>}
        <span className="inspect">{c.sources.length ? "Code & config" : "Details"}</span>
      </div>
    </div>
  );
});

const Zone = memo(function Zone({ data }: NodeProps) {
  const d = data as { label: string; note: string };
  return (
    <div className="zone">
      <span>{d.label}</span>
      <em>{d.note}</em>
    </div>
  );
});

const nodeTypes = { card: Card, zone: Zone };

export function ArchitectureMap({
  used,
  active,
  denied,
  activeNodes,
  selected,
  onSelect,
  showTelemetry,
}: {
  used: Set<string>;
  active: Set<string>;
  denied: Set<string>;
  activeNodes: Set<string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  showTelemetry: boolean;
}) {
  const nodes = useMemo<Node[]>(() => {
    const zones: Node[] = [
      { id: "zone-a", type: "zone", position: { x: 100, y: 168 }, data: { label: "Bank A · Harbor Point Bank", note: "bank-a-* networks" }, style: { width: 650, height: 425 }, selectable: false, draggable: false, zIndex: -1 },
      { id: "zone-b", type: "zone", position: { x: 1080, y: 168 }, data: { label: "Bank B · Meridian Trust", note: "bank-b-* networks" }, style: { width: 650, height: 425 }, selectable: false, draggable: false, zIndex: -1 },
    ];
    return [
      ...zones,
      ...COMPONENTS.map((c) => {
        const card: CardData = {
          component: c,
          state: denied.has(c.id) ? "denied" : activeNodes.has(c.id) ? "active" : "idle",
          selected: selected === c.id,
        };
        return {
          id: c.id,
          type: "card",
          position: { x: c.x, y: c.y },
          data: card as unknown as Record<string, unknown>,
          draggable: false,
        };
      }),
    ];
  }, [activeNodes, denied, selected]);

  const edges = useMemo<Edge[]>(
    () =>
      LINKS.filter((l) => showTelemetry || !l.telemetry).map((l) => {
        const [s, t] = HANDLES[l.id] ?? ["b", "t"];
        const isDenied = denied.has(l.id);
        const isActive = active.has(l.id);
        const isUsed = used.has(l.id);
        const color = isDenied ? "#ff6b79" : isActive ? "#9bb8ff" : isUsed ? "#5f8ff2" : l.telemetry ? "#58b98e" : "#3b4a5e";
        return {
          id: l.id,
          source: l.from,
          target: l.to,
          sourceHandle: `s-${s}`,
          targetHandle: `t-${t}`,
          type: "smoothstep",
          label: l.label || undefined,
          animated: isActive || l.telemetry,
          className: l.telemetry ? "edge-telemetry" : "",
          style: { stroke: color, strokeWidth: isActive || isDenied ? 2.6 : isUsed ? 2 : 1.4, strokeDasharray: l.telemetry ? "5 6" : undefined, opacity: l.telemetry ? 0.55 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          labelStyle: { fill: isDenied ? "#ffb3bb" : "#c9d4e4", fontSize: 13, fontWeight: 600 },
          labelBgStyle: { fill: "#0d141e", stroke: "#2a3748" },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 4,
        };
      }),
    [active, denied, used, showTelemetry],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.06 }}
      minZoom={0.3}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => node.type === "card" && onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
    >
      <Background color="#1c2735" gap={22} />
      <Controls showInteractive={false} position="bottom-left" />
    </ReactFlow>
  );
}
