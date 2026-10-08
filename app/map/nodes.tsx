"use client";

import { memo, useLayoutEffect, useRef } from "react";
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import type { FocusRelevance, NodeRole, PlatformId } from "./scene-model.ts";

export type SceneNodeData = {
  instanceId: string;
  representationKey: string;
  role: NodeRole;
  displayLabel: string;
  supportingText?: string;
  technicalLabel?: string;
  serviceLabel?: string;
  emphasis?: "customer" | "assisted";
  detail?: string;
  drillInto?: string;
  expandGroupId?: string;
  expanded?: boolean;
  platformFocus?: PlatformId;
  compact?: boolean;
  dense?: boolean;
  hasSource?: boolean;
  portAlong?: Record<string, number>;
  ports?: string[];
  nodeRelevance?: FocusRelevance;
  sourceRelevance?: FocusRelevance;
  capabilityLines?: { id: string; text: string; relevance: FocusRelevance }[];
  attribution?: { name: string; label: string; role: string; relevance: FocusRelevance }[];
  onMeasure?: (instanceId: string, width: number, height: number) => void;
  minHeight?: number;
  onExplore?: () => void;
  onSource?: () => void;
};

type PortSpec = { id: string; type: "source" | "target"; side: "t" | "r" | "b" | "l"; along: number };

const BASE_PORT_IDS = ["in-t", "out-t", "in-l", "out-l", "in-r", "out-r", "in-b", "out-b", "out-b-l", "out-b-r"];

/** Handles are derived from the port ids a scene actually uses, so a route can never reference a handle that was never rendered. */
export function parsePort(id: string): PortSpec | null {
  if (id === "out-b-l" || id === "in-b-l") return { id, type: id.startsWith("out") ? "source" : "target", side: "b", along: 0.32 };
  if (id === "out-b-r" || id === "in-b-r") return { id, type: id.startsWith("out") ? "source" : "target", side: "b", along: 0.68 };
  const match = /^(in|out)-([lrbt])(?:@([\d.]+))?$/.exec(id);
  if (!match) return null;
  return { id, type: match[1] === "out" ? "source" : "target", side: match[2] as PortSpec["side"], along: match[3] ? Number(match[3]) : 0.5 };
}

function portSpecs(used?: string[]): PortSpec[] {
  const ids = new Set([...BASE_PORT_IDS, ...(used ?? [])]);
  return [...ids].map(parsePort).filter((port): port is PortSpec => port !== null);
}

const position: Record<PortSpec["side"], Position> = {
  t: Position.Top,
  r: Position.Right,
  b: Position.Bottom,
  l: Position.Left,
};

function Ports({ along, used }: { along?: Record<string, number>; used?: string[] }) {
  return (
    <>
      {portSpecs(used).map((port) => {
        const value = along?.[port.id] ?? port.along;
        const style = port.side === "t" || port.side === "b"
          ? { left: `${value * 100}%`, opacity: 0 }
          : { top: `${value * 100}%`, opacity: 0 };
        return <Handle key={port.id} id={port.id} type={port.type} position={position[port.side]} style={style} />;
      })}
    </>
  );
}

function Body({ data, selected, kind }: { data: SceneNodeData; selected?: boolean; kind: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const portKey = (data.ports ?? []).join("|");
  const instanceId = data.instanceId;
  const representationKey = data.representationKey;
  const onMeasure = data.onMeasure;
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const report = () => onMeasure?.(instanceId, card.offsetWidth, card.offsetHeight);
    const timer = window.setTimeout(report, 0);
    return () => window.clearTimeout(timer);
  }, [instanceId, onMeasure, portKey, representationKey]);
  return (
    <div ref={cardRef} className={`map-node ${kind} ${data.compact ? "is-compact" : ""} ${data.dense ? "is-dense" : ""} ${selected ? "is-selected" : ""}`} data-instance-id={data.instanceId} data-representation-key={representationKey} data-relevance={data.nodeRelevance ?? "context"} style={data.minHeight ? { minHeight: data.minHeight } : undefined}>
      <Ports along={data.portAlong} used={data.ports} />
      <strong title={data.technicalLabel}>{data.displayLabel}</strong>
      {data.serviceLabel && data.serviceLabel !== data.displayLabel && !data.attribution?.some((item) => item.name === data.serviceLabel) ? <small>{data.serviceLabel}</small> : null}
      {data.attribution?.length ? (
        <span className="map-node-platforms">
          {data.attribution.map((item) => <span key={`${item.name}-${item.role}`} className={`map-platform role-${item.role}`} data-relevance={item.relevance}>{item.label}</span>)}
        </span>
      ) : null}
      {data.supportingText ? <em>{data.supportingText}</em> : null}
      {data.capabilityLines?.length ? (
        <span className="map-capabilities">
          {data.capabilityLines.map((line) => <span key={line.id} data-relevance={line.relevance}>{line.text}</span>)}
        </span>
      ) : null}
      {data.detail ? <em>{data.detail}</em> : null}
      <span className="map-node-actions">
        {data.drillInto || data.expandGroupId ? <button type="button" className="map-explore" data-action={data.expandGroupId ? "expand" : "explore"}>Explore</button> : null}
        {!data.drillInto && !data.expandGroupId && data.hasSource ? <button type="button" className="map-source-btn" data-action="source" data-relevance={data.sourceRelevance ?? "context"}>Source</button> : null}
      </span>
    </div>
  );
}

function ActivityNodeView({ data, selected }: NodeProps) {
  return <Body data={data as SceneNodeData} selected={selected} kind="activity" />;
}
function AgentNodeView({ data, selected }: NodeProps) {
  return <Body data={data as SceneNodeData} selected={selected} kind="agent" />;
}
function CheckpointNodeView({ data, selected }: NodeProps) {
  return <Body data={data as SceneNodeData} selected={selected} kind="checkpoint" />;
}
function ServiceNodeView({ data, selected }: NodeProps) {
  return <Body data={data as SceneNodeData} selected={selected} kind="service" />;
}
function DecisionNodeView({ data, selected }: NodeProps) {
  return <Body data={data as SceneNodeData} selected={selected} kind="decision" />;
}
function ContextAnchorNodeView({ data, selected }: NodeProps) {
  return <Body data={data as SceneNodeData} selected={selected} kind="context" />;
}

function GroupNodeView({ data, selected }: NodeProps) {
  const item = data as SceneNodeData;
  const updateNodeInternals = useUpdateNodeInternals();
  useLayoutEffect(() => {
    const timer = window.setTimeout(() => updateNodeInternals(item.instanceId), 0);
    return () => window.clearTimeout(timer);
  }, [item.expanded, item.instanceId, item.representationKey, updateNodeInternals]);
  if (!item.expanded) return <Body data={item} selected={selected} kind="group-summary" />;
  return (
    <div className={`map-group ${selected ? "is-selected" : ""}`} data-instance-id={item.instanceId} data-relevance={item.nodeRelevance ?? "context"}>
      <Ports along={item.portAlong} used={item.ports} />
      <div className="map-group-header">
        <strong>{item.displayLabel}</strong>
        {item.expandGroupId ? <button type="button" data-action="collapse">Collapse</button> : item.supportingText ? <small>{item.supportingText}</small> : null}
      </div>
    </div>
  );
}

const ActivityNode = memo(ActivityNodeView);
const AgentNode = memo(AgentNodeView);
const CheckpointNode = memo(CheckpointNodeView);
const ServiceNode = memo(ServiceNodeView);
const DecisionNode = memo(DecisionNodeView);
const ContextAnchorNode = memo(ContextAnchorNodeView);
const GroupNode = memo(GroupNodeView);

export const nodeTypes = {
  activity: ActivityNode,
  agent: AgentNode,
  checkpoint: CheckpointNode,
  service: ServiceNode,
  decision: DecisionNode,
  context: ContextAnchorNode,
  group: GroupNode,
};
