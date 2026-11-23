"use client";

import { useMemo, useState } from "react";
import type { Graph, GraphNode } from "./triage-state";

const SIZE = 340;
const CENTER = SIZE / 2;
const ILLUSTRATIVE_LAYOUT = "The counts are data; the card dots, last-4s, and dates are generated to match them.";

const day = (iso?: string) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
};

type Placed = GraphNode & { x: number; y: number; r: number };

/** Point-in-time merchant neighborhood: the merchant at the centre, the scored card, and the cards seen before the payment. */
export default function NetworkGraph({ graph }: { graph: Graph }) {
  const [focus, setFocus] = useState<Placed | null>(null);
  const placed = useMemo(() => layout(graph), [graph]);
  const fraud = placed.filter((node) => node.kind === "fraud").length;
  const clean = placed.filter((node) => node.kind === "clean").length;
  const center = placed.find((node) => node.kind === "merchant");
  const caption = focus
    ? `${focus.label} · ${focus.detail ?? ""}${focus.kind === "fraud" && focus.confirmed_at ? ` · confirmed ${day(focus.confirmed_at)}` : ""}${graph.layout !== "data" && (focus.kind === "fraud" || focus.kind === "clean") ? " · illustrative" : ""}`
    : `${graph.cards_confirmed_fraud} of ${graph.cards_seen.toLocaleString("en-US")} cards seen at ${graph.merchant} had confirmed fraud before this payment.`;
  return (
    <figure className="fx-graph">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Network of ${graph.merchant}: ${graph.cards_confirmed_fraud} confirmed-fraud cards of ${graph.cards_seen} seen`}>
        <circle cx={CENTER} cy={CENTER} r={112} className="fx-ring" />
        <circle cx={CENTER} cy={CENTER} r={152} className="fx-ring" />
        {placed.filter((node) => node.kind !== "merchant").map((node) => (
          <line key={`e-${node.id}`} x1={CENTER} y1={CENTER} x2={node.x} y2={node.y} className={`fx-edge ${node.kind}`} />
        ))}
        {placed.map((node) => (
          <g
            key={node.id}
            className={`fx-node ${node.kind}${focus?.id === node.id ? " focused" : ""}`}
            tabIndex={node.kind === "merchant" ? -1 : 0}
            onMouseEnter={() => setFocus(node)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(node)}
            onBlur={() => setFocus(null)}
          >
            <circle cx={node.x} cy={node.y} r={node.r} />
            <title>{`${node.label}${node.detail ? ` · ${node.detail}` : ""}`}</title>
            {node.kind === "scored" && <text x={node.x + node.r + 5} y={node.y + 4} textAnchor="start" className="fx-card-label">{node.label}</text>}
          </g>
        ))}
        {center && <text x={CENTER} y={CENTER + center.r + 16} textAnchor="middle" className="fx-merchant-label">{graph.merchant}</text>}
      </svg>
      <figcaption>
        <span className="fx-graph-caption" aria-live="polite">{caption}</span>
        <span className="fx-legend">
          <span><i className="dot fraud" /> Confirmed fraud ({fraud}{graph.shown && graph.cards_confirmed_fraud > fraud ? ` of ${graph.cards_confirmed_fraud}` : ""})</span>
          <span><i className="dot clean" /> No fraud ({clean} of {graph.shown?.clean_total ?? clean})</span>
          <span><i className="dot scored" /> This card</span>
        </span>
        <small>{graph.source} · only payments before this one count{graph.window_days ? ` · last ${graph.window_days} days` : ""}</small>
        {graph.layout !== "data" && <small className="fx-graph-layout"><span className="fx-tag illustrative">Illustrative layout</span> {graph.layout_note ?? ILLUSTRATIVE_LAYOUT}</small>}
      </figcaption>
    </figure>
  );
}

function layout(graph: Graph): Placed[] {
  const asOf = graph.as_of ? Date.parse(graph.as_of) : NaN;
  const window = (graph.window_days || 21) * 86_400_000;
  const cards = graph.nodes.filter((node) => node.kind === "fraud" || node.kind === "clean");
  const out: Placed[] = [];
  for (const node of graph.nodes) {
    if (node.kind === "merchant") out.push({ ...node, x: CENTER, y: CENTER, r: 15 });
    if (node.kind === "scored") out.push({ ...node, x: CENTER, y: CENTER - 66, r: 8 });
  }
  cards.forEach((node, index) => {
    const angle = (index / Math.max(1, cards.length)) * Math.PI * 2 + Math.PI / 2 + 0.12;
    const radius = node.kind === "fraud" ? 112 : 152;
    const seen = Date.parse(node.bought_at ?? "");
    const recency = Number.isFinite(asOf) && Number.isFinite(seen) ? Math.max(0, Math.min(1, 1 - (asOf - seen) / window)) : 0.5;
    out.push({ ...node, x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius, r: node.kind === "fraud" ? 3.5 + recency * 3 : 3.5 });
  });
  return out;
}
