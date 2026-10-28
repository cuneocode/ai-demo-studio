import test from "node:test";
import assert from "node:assert/strict";
import { catalogs } from "../app/map/catalog.ts";
import { evidence } from "../app/map/evidence.ts";
import { architectureDiagrams } from "../app/map/drawio/registry.ts";
import { connectPlatformComponents, platformConnections } from "../app/map/drawio/platform-connections.ts";
import { composeCanvas } from "../app/map/drawio/canvas.ts";
import { canvasScopePath, layoutCanvas, visibleCanvasEdges } from "../app/map/drawio/canvas-layout.ts";
import { sourceActionsForNode } from "../app/map/scene-model.ts";
import { diagramNode } from "../app/map/drawio/model.ts";

const layers = ["security", "observability", "deployment"];
const id = endpoint => `${endpoint.scopeId}::${endpoint.cellId}`;
const diagram = caseId => { const definition = architectureDiagrams[caseId]; return { ...definition, doc: composeCanvas(definition.pages, definition.catalog) }; };
const projected = (doc, expanded, mode, enabled = layers) => {
  const layout = layoutCanvas(doc, expanded, mode, enabled);
  return visibleCanvasEdges(doc, expanded, mode, enabled, layout.visibleIds);
};

test("every catalog requires an explicit platform connection contract", () => {
  assert.deepEqual(Object.keys(platformConnections).sort(), Object.keys(catalogs).sort());
  assert.throws(() => connectPlatformComponents({ catalog: { ...catalogs["brahe-bank"], id: "unreviewed-case" }, pages: [] }), /Missing platform connection contract/);
});

for (const [caseId, contract] of Object.entries(platformConnections)) {
  test(`${caseId}: platform paths have concrete terminals, correct layers and runtime evidence`, () => {
    const { catalog, pages, doc } = diagram(caseId);
    const mode = contract.status === "proposed" ? "proposed" : "implemented";
    const expanded = Object.keys(doc.scopes).filter(scope => scope !== "journey");
    const edges = projected(doc, expanded, mode);
    assert.ok(contract.connections.some(connection => connection.kind === "telemetry"));
    assert.ok(contract.connections.some(connection => connection.kind === "control"));
    for (const connection of contract.connections) {
      const from = id(connection.from), to = id(connection.to);
      assert.ok(doc.items[from], from);
      assert.ok(doc.items[to], to);
      assert.equal(doc.items[from].childScopeId, undefined, `${caseId}: ${from} must be a concrete caller`);
      assert.equal(doc.items[to].childScopeId, undefined, `${caseId}: ${to} must be a concrete destination`);
      assert.ok(edges.some(edge => edge.from === from && edge.to === to && edge.kind === connection.kind), `${caseId}: ${from} -> ${to} visible at component detail`);
      const edge = doc.edges.find(edge => edge.from === from && edge.to === to && edge.id.includes(".platform-link."));
      assert.equal(edge.scopeId, "system");
      assert.equal(edge.layer, connection.kind === "telemetry" ? "observability" : "security");
      if (contract.status === "proposed") {
        assert.deepEqual(edge.modes, ["proposed"]);
        assert.match(edge.label, /^Proposed /);
      } else {
        assert.ok(connection.sources.length, `${caseId}: implementation needs evidence`);
        for (const ref of connection.sources) {
          assert.ok(evidence[ref]);
          assert.ok(["source", "configuration"].includes(evidence[ref].evidenceKind));
          for (const endpoint of [connection.from, connection.to]) {
            const item = pages.find(page => page.id === endpoint.scopeId).cells.find(cell => cell.id === endpoint.cellId);
            assert.ok(sourceActionsForNode(catalog, diagramNode(catalog, item), mode).some(source => source.id === ref), `${from}: ${ref} available in source inspector`);
          }
        }
      }
    }
    const summary = projected(doc, ["system"], mode);
    assert.ok(summary.some(edge => edge.layer === "security"));
    assert.ok(summary.some(edge => edge.layer === "observability"));
    assert.equal(new Set(summary.map(edge => JSON.stringify([edge.from, edge.to, edge.kind, edge.layer, edge.label]))).size, summary.length, "collapsed routes are unique");
    assert.ok(projected(doc, expanded, mode, ["deployment"]).every(edge => !["security", "observability"].includes(edge.layer)));
    for (const connection of contract.connections) {
      for (const endpoint of [connection.from, connection.to]) {
        const path = canvasScopePath(doc, endpoint.scopeId).slice(1);
        for (let depth = 0; depth <= path.length; depth++) {
          const opened = [...new Set(["system", ...path.slice(0, depth)])];
          const visible = new Set(layoutCanvas(doc, opened, mode, layers).visibleIds);
          const terminal = initial => { let current = initial; while (!visible.has(current)) current = doc.scopes[doc.items[current].scopeId].ownerId; return current; };
          const from = terminal(id(connection.from)), to = terminal(id(connection.to));
          if (from === to) continue;
          assert.ok(projected(doc, opened, mode).some(edge => edge.from === from && edge.to === to && edge.kind === connection.kind), `${caseId}: ${from} -> ${to} survives folding ${endpoint.scopeId} at depth ${depth}`);
        }
      }
    }
  });
}

test("Interbank inspection follows gateways and policy services while agents and gateways both export telemetry", () => {
  const { doc } = diagram("interbank-a2a");
  const edges = projected(doc, ["system", "exchange", "trace"], "implemented");
  for (const bank of ["a", "b"]) {
    const gateway = `exchange::ib.${bank}.gateway`, policy = `exchange::policy-${bank}`;
    const collector = `trace::${bank === "a" ? "ib.trace.gateways" : "collector-b"}`;
    assert.ok(edges.some(edge => edge.from === gateway && edge.to === policy && edge.kind === "control"));
    assert.ok(edges.some(edge => edge.from === policy && edge.to === "system::ib.platform.defense" && edge.kind === "control"));
    assert.ok(edges.some(edge => edge.from === gateway && edge.to === collector && edge.kind === "telemetry"));
    assert.ok(edges.some(edge => edge.from === collector && edge.to === "trace::ib.trace.handoff" && edge.kind === "telemetry"));
  }
  for (const agent of ["exchange::ib.a.coordinator", "exchange::ib.b.investigator"]) {
    assert.ok(edges.some(edge => edge.from === agent && edge.to === "trace::ib.trace.agents" && edge.kind === "telemetry"));
    assert.ok(!edges.some(edge => edge.from === agent && edge.to === "system::ib.platform.defense"));
  }
  assert.ok(!edges.some(edge => edge.from === "system::ib.stage.exchange" && ["security", "observability"].includes(edge.layer)));
  const summary = projected(doc, ["system"], "implemented");
  assert.ok(summary.some(edge => edge.from === "system::ib.stage.exchange" && edge.to === "system::ib.platform.defense"));
  assert.ok(summary.some(edge => edge.from === "system::ib.stage.exchange" && edge.to === "system::ib.platform.observe"));
});

test("Agent Control evaluations belong to security and disabled inspection has no active calls", () => {
  for (const definition of Object.values(architectureDiagrams)) {
    const doc = composeCanvas(definition.pages, definition.catalog);
    for (const item of Object.values(doc.items).filter(item => item.label === "Agent Control")) {
      assert.notEqual(item.scopeId, "observe");
      assert.ok(!doc.edges.some(edge => edge.to === item.id && edge.kind === "telemetry"));
      assert.ok(doc.edges.some(edge => edge.to === item.id && edge.kind === "control"));
    }
  }
  const { doc } = diagram("code-vulnerability");
  assert.equal(platformConnections["code-vulnerability"].inspection, "disabled");
  assert.ok(!doc.edges.some(edge => edge.id.includes("platform-link") && edge.to === "security::inspection"));
});

test("SDK traces and native OTLP instrumentation retain separate export paths", () => {
  for (const caseId of ["market-research", "client-advisory", "sar-support"]) {
    const { doc } = diagram(caseId);
    const trace = caseId === "sar-support" ? "trace" : "in";
    assert.ok(doc.edges.some(edge => edge.from === `observe::${trace}` && edge.to === "observe::ao"));
    assert.ok(doc.edges.some(edge => edge.from === "observe::otlp" && edge.to === "observe::otlp-destination"));
    assert.ok(!doc.edges.some(edge => edge.from === `observe::${trace}` && edge.to === "observe::otlp"));
  }
  const fraud = diagram("fraud-modeling").doc;
  assert.equal(fraud.items["observe::otlp"].label, "OTLP status only");
  assert.ok(!fraud.edges.some(edge => edge.from === "observe::otlp" || edge.to === "observe::otlp"));
  const briefing = diagram("company-briefing").doc;
  assert.ok(briefing.edges.some(edge => edge.from === "observe::in" && edge.to === "observe::otlp" && edge.label === "OTLP JSON"));
  assert.ok(!briefing.items["observe::ao"]);
});
