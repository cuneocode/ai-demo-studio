"use client";

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { FocusRelevance, Point, RelationshipKind } from "./scene-model.ts";

export type RoutedEdgeData = {
  points: Point[];
  kind: RelationshipKind;
  label?: string;
  labelOffset?: Point;
  relevance?: FocusRelevance;
  localTransition?: boolean;
};

import { labelAnchor } from "./scene-model.ts";

function RoutedEdgeView({ id, data, markerEnd, style }: EdgeProps) {
  const edge = data as RoutedEdgeData;
  const points = edge.points ?? [];
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const labelAt = labelAnchor(points);
  const labelX = labelAt.x + (edge.labelOffset?.x ?? 0);
  const labelY = labelAt.y + (edge.labelOffset?.y ?? 0);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} className={`map-edge-path relevance-${edge.relevance ?? "context"} ${edge.localTransition ? "is-local-edge" : ""}`} />
      {edge.label ? (
        <EdgeLabelRenderer>
          <div className={`map-edge-label kind-${edge.kind} relevance-${edge.relevance ?? "context"}`} data-relevance={edge.relevance ?? "context"} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {edge.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function SupportEdgeView({ id, data, style }: EdgeProps) {
  const edge = data as RoutedEdgeData;
  const points = edge.points ?? [];
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const labelAt = labelAnchor(points);
  const labelX = labelAt.x + (edge.labelOffset?.x ?? 0);
  const labelY = labelAt.y + (edge.labelOffset?.y ?? 0);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`map-edge-path relevance-${edge.relevance ?? "context"} ${edge.localTransition ? "is-local-edge" : ""}`}
        style={{ ...style, fill: "none", stroke: "var(--map-support-stroke)", strokeWidth: 1.5 }}
      />
      {edge.label ? (
        <EdgeLabelRenderer>
          <div className={`map-edge-label kind-support relevance-${edge.relevance ?? "context"}`} data-relevance={edge.relevance ?? "context"} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {edge.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const edgeTypes = { routed: RoutedEdgeView, support: SupportEdgeView };
