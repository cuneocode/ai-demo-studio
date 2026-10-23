import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { architectureDiagrams } from "../app/map/drawio/registry.ts";
import { catalogs } from "../app/map/catalog.ts";
import { diagramNode } from "../app/map/drawio/model.ts";
import { composeCanvas } from "../app/map/drawio/canvas.ts";
import { canvasScopePath, fitCanvasCamera, layoutCanvas, routeCanvasConnection, visibleCanvasEdges } from "../app/map/drawio/canvas-layout.ts";
import { sourceActionsForNode } from "../app/map/scene-model.ts";
import { evidence } from "../app/map/evidence.ts";
import { renderCanvasRuntime, renderComponentRuntime, renderDrawio } from "../scripts/build-drawio.ts";
import { componentTypes } from "../app/map/drawio/components.ts";
import { requiredLayers } from "../app/map/drawio/platform-views.ts";
import { layoutDiagram } from "../scripts/drawio-layout.ts";
import { modelConsumers } from "../app/map/drawio/implementation-views.ts";

const layers = ["security", "observability", "deployment"];
const overlap = (a, b) => a.x + a.width > b.x + 1 && b.x + b.width > a.x + 1 && a.y + a.height > b.y + 1 && b.y + b.height > a.y + 1;

test("every architecture uses the shared continuous draw.io canvas", () => {
  assert.deepEqual(Object.keys(architectureDiagrams), Object.keys(catalogs));
  assert.equal(Object.keys(architectureDiagrams).length, 10);
});
test("all ten architectures expose connected Security, Observability, and AI Infrastructure views", () => {
  for (const [caseId, { pages, catalog }] of Object.entries(architectureDiagrams)) {
    const system = pages.find(page => page.id === "system");
    assert.deepEqual(system.layers, requiredLayers, caseId);
    for (const layer of requiredLayers) {
      const providers = system.cells.filter(cell => cell.layer === layer);
      assert.ok(providers.length, `${caseId}/${layer}: visible platform content`);
      assert.ok(system.edges.some(edge => edge.layer === layer && providers.some(cell => cell.id === edge.from || cell.id === edge.to || cell.targetPageId === edge.toScopeId)), `${caseId}/${layer}: connected platform participation`);
    }
    const infrastructure = pages.find(page => page.id === "infrastructure");
    if (infrastructure) {
      assert.ok(infrastructure.cells.some(cell => cell.componentType === "model"));
      assert.deepEqual(infrastructure.cells.find(cell => cell.id === "private").modes, ["proposed"]);
      if (catalog.scenes[catalog.rootSceneId].modes.every(mode => mode === "proposed")) assert.match(infrastructure.purpose, /no live backend/);
    }
  }
  const security = architectureDiagrams["code-vulnerability"].pages.find(page => page.id === "security");
  assert.match(security.purpose, /AI Defense inspection is disabled/);
  assert.equal(security.cells.find(cell => cell.id === "inspection").label, "AI Defense disabled");
  assert.ok(security.cells.some(cell => cell.id === "egress"));
});
test("browser and generator use the same canvas layout implementation", async () => {
  assert.equal(readFileSync(new URL("../public/diagrams/canvas-layout.js", import.meta.url), "utf8"), await renderCanvasRuntime());
  assert.equal(readFileSync(new URL("../public/diagrams/components.js", import.meta.url), "utf8"), await renderComponentRuntime());
});
for (const [caseId, definition] of Object.entries(architectureDiagrams)) {
  const { catalog, pages } = definition;
  test(`${caseId}: canonical identities, boundaries, and source evidence survive composition`, () => {
    const doc = composeCanvas(pages, catalog);
    const relations = new Set(catalog.relationships.map(edge => edge.id));
    for (const scope of Object.values(doc.scopes)) {
      const path = canvasScopePath(doc, scope.id);
      assert.equal(path[0], doc.rootScopeId);
      assert.equal(new Set(path).size, path.length);
      if (scope.ownerId) assert.equal(doc.items[scope.ownerId].childScopeId, scope.id);
    }
    for (const edge of doc.edges) {
      assert.ok(doc.items[edge.from] && doc.items[edge.to], edge.id);
      for (const id of edge.relationshipIds) assert.ok(relations.has(id), id);
    }
    for (const item of Object.values(doc.items)) assert.ok(componentTypes[item.componentType], `${item.id}: explicit component vocabulary`);
    for (const scene of Object.values(catalog.scenes).filter(scene => scene.id.includes(".drawio.calls."))) {
      const ids = new Set(scene.nodes.map(node => node.instanceId));
      for (const id of [...scene.entryInstanceIds, ...scene.exitInstanceIds]) assert.ok(ids.has(id), `${scene.id}: valid entry and exit`);
    }
    for (const mode of catalog.scenes[catalog.rootSceneId].modes) {
      const sources = cells => new Set(cells.flatMap(cell => sourceActionsForNode(catalog, diagramNode(catalog, cell), mode).map(source => source.id)));
      const before = sources(pages.flatMap(page => page.cells));
      const after = sources(Object.values(doc.items).flatMap(item => [item, ...(item.aliases ?? [])]));
      assert.deepEqual(after, before);
      for (const id of after) assert.ok(evidence[id], id);
    }
  });
  test(`${caseId}: export contains one diagram with native collapsible groups`, async () => {
    const xml = readFileSync(new URL(`../public${definition.asset}`, import.meta.url), "utf8");
    assert.equal(xml, await renderDrawio(definition));
    assert.equal((xml.match(/<diagram\b/g) ?? []).length, 1);
    assert.match(xml, /<diagram id="architecture"/);
    assert.match(xml, /collapsed="1"/);
    assert.match(xml, /childScope="system"/);
    assert.match(xml, /as="alternateBounds"/);
    assert.doesNotMatch(xml, /data:page\/id/);
    assert.match(xml, /data:image\/svg\+xml;base64,/);
    assert.doesNotMatch(xml, /https:\/\/icons\.diagrams\.net/);
  });
  test(`${caseId}: every expansion stays contained and readable in all supported modes and layers`, async () => {
    const doc = composeCanvas(await Promise.all(pages.map(layoutDiagram)), catalog);
    for (const scope of Object.values(doc.scopes)) for (const mode of catalog.scenes[catalog.rootSceneId].modes) for (let bits = 0; bits < 8; bits++) {
      const activeLayers = layers.filter((_, index) => bits & (1 << index));
      const expanded = canvasScopePath(doc, scope.id).slice(1);
      const layout = layoutCanvas(doc, expanded, mode, activeLayers);
      const visible = new Set(layout.visibleIds);
      for (const parent of Object.values(doc.scopes)) {
        const members = parent.cellIds.filter(id => visible.has(id));
        for (const row of parent.flow ?? []) {
          const stages = row.filter(id => visible.has(id));
          for (let i = 1; i < stages.length; i++) {
            const a = layout.cells[stages[i - 1]], b = layout.cells[stages[i]];
            assert.ok(b.x >= a.x + a.width + 40, `${scope.id}: forward workflow order`);
            assert.ok(Math.abs(a.y + layout.anchors[stages[i - 1]] - b.y - layout.anchors[stages[i]]) < .1, `${scope.id}: aligned workflow ports`);
          }
        }
        for (const id of members) {
          const box = layout.cells[id];
          assert.ok(Object.values(box).every(Number.isFinite), `${scope.id}/${id}: finite geometry`);
          assert.ok(box.width >= 100 && box.height >= 50, `${scope.id}/${id}: readable size`);
          if (parent.ownerId) {
            const owner = layout.cells[parent.ownerId];
            assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= owner.width + 1 && box.y + box.height <= owner.height + 1, `${scope.id}/${id}: contained by ${parent.ownerId}`);
          }
        }
        for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) assert.ok(!overlap(layout.cells[members[i]], layout.cells[members[j]]), `${scope.id}: ${members[i]} overlaps ${members[j]}`);
      }
    }
  });
}

test("Brahe stitches controls and tools into the surrounding workflow", () => {
  const doc = composeCanvas(architectureDiagrams["brahe-bank"].pages, architectureDiagrams["brahe-bank"].catalog);
  assert.equal(doc.items["system::check"].childScopeId, "check");
  assert.equal(diagramNode(architectureDiagrams["brahe-bank"].catalog, doc.items["check::control"]).entityId, "controls");
  assert.equal(diagramNode(architectureDiagrams["brahe-bank"].catalog, doc.items["system::defense"]).entityId, "defense");
  assert.ok(doc.edges.some(edge => edge.scopeId === "check" && edge.from === "journey::ask" && edge.to === "check::inspect"));
  assert.ok(doc.edges.some(edge => edge.scopeId === "check" && edge.to === "system::build" && edge.label === "Allow"));
  assert.ok(doc.edges.some(edge => edge.scopeId === "return" && edge.to === "journey::review" && edge.label === "Allow"));
  assert.ok(!doc.items["build::draft"]);
  assert.ok(doc.edges.some(edge => edge.scopeId === "build" && edge.from === "build::supervisor" && edge.to === "system::release"));
});

test("large expanded areas fit in the viewport with surrounding space", () => {
  for (const bounds of [{ x: 340, y: 160, width: 2400, height: 700 }, { x: -40, y: 80, width: 800, height: 1800 }]) {
    for (const [width, height] of [[1280, 620], [900, 480]]) {
      const camera = fitCanvasCamera(bounds, width, height);
      assert.ok(camera.scale < .9);
      assert.ok((bounds.x + camera.x) * camera.scale >= 71);
      assert.ok((bounds.y + camera.y) * camera.scale >= 55);
      assert.ok((bounds.x + bounds.width + camera.x) * camera.scale <= width - 71);
      assert.ok((bounds.y + bounds.height + camera.y) * camera.scale <= height - 55);
    }
  }
});

test("component types distinguish agents, tools, gateways, model inference, and databases", () => {
  const doc = id => composeCanvas(architectureDiagrams[id].pages, architectureDiagrams[id].catalog);
  const brahe = doc("brahe-bank");
  assert.equal(brahe.items["build::supervisor"].componentType, "agent");
  assert.equal(brahe.items["build::products"].componentType, "tool");
  assert.equal(brahe.items["build::score-tool"].componentType, "tool");
  assert.equal(brahe.items["system::model"].componentType, "model");
  assert.equal(brahe.items["check::judge"].componentType, "service");
  assert.equal(brahe.items["check::control"].componentType, "control");
  const interbank = doc("interbank-a2a");
  for (const bank of ["a", "b"]) {
    assert.equal(interbank.items[`exchange::ib.${bank}.gateway`].componentType, "gateway");
    assert.equal(interbank.items[`exchange::ib.${bank}.records`].componentType, "database");
  }
  assert.equal(doc("fraud-modeling").items["graph::gnn"].componentType, "model");
  assert.equal(doc("code-vulnerability").items["system::model"].componentType, "workflow");
  assert.equal(doc("company-briefing").items["filings::nodes"].componentType, "data");
});

test("all use cases connect actual model consumers to one canonical inference endpoint", () => {
  for (const [caseId, definition] of Object.entries(architectureDiagrams)) {
    const doc = composeCanvas(definition.pages, definition.catalog);
    const infrastructure = definition.pages.some(page => page.id === "infrastructure");
    const target = infrastructure ? "infrastructure::routing" : caseId === "interbank-a2a" ? "hosting::ib.host.endpoint" : "system::model";
    const endpoint = infrastructure ? "infrastructure::endpoint" : target;
    assert.equal(doc.items[endpoint].componentType, "model", caseId);
    if (infrastructure) {
      assert.ok(doc.edges.some(edge => edge.from === target && edge.to === endpoint && (edge.kind ?? "request") === "request"), caseId);
      assert.ok(!doc.items["model::chain"] && !doc.items["model::chat"] && !doc.items["model::nim"] && !doc.items["model::model"], `${caseId}: no duplicate provider`);
    }
    for (const consumer of modelConsumers[caseId]) {
      const id = `${consumer.scopeId}::${consumer.cellId}`;
      assert.ok(doc.items[id], id);
      assert.notEqual(doc.items[id].componentType, "model", `${caseId}/${id}: caller role differs from endpoint`);
      assert.ok(doc.edges.some(edge => edge.from === id && edge.to === target && edge.kind === "request"), `${caseId}/${id}: actual model call`);
    }
  }
  const vulnerability = composeCanvas(architectureDiagrams["code-vulnerability"].pages, architectureDiagrams["code-vulnerability"].catalog);
  assert.equal(vulnerability.items["model::inference"].componentType, "agent");
  assert.equal(Object.values(vulnerability.items).filter(item => item.componentType === "model").length, 1);
  assert.ok(!vulnerability.items["observe::controls"], "Agent Control has one canonical security occurrence");
  assert.ok(!vulnerability.edges.some(edge => edge.from === "system::observe" && edge.kind === "control"), "telemetry does not enforce controls");
  const scorer = architectureDiagrams["fraud-modeling"].pages.find(page => page.id === "infrastructure").cells.find(cell => cell.id === "scorer");
  assert.equal(scorer.labelByMode?.proposed ?? scorer.label, "Configured scorer runtime");
});

test("model routes follow their canonical target through expansion, collapse, modes, and layer changes", async () => {
  for (const [caseId, definition] of Object.entries(architectureDiagrams)) {
    const doc = composeCanvas(await Promise.all(definition.pages.map(layoutDiagram)), definition.catalog);
    const providerScope = doc.scopes.infrastructure ? "infrastructure" : caseId === "interbank-a2a" ? "hosting" : undefined;
    for (const consumer of modelConsumers[caseId]) for (const mode of definition.catalog.scenes[definition.catalog.rootSceneId].modes) {
      const source = `${consumer.scopeId}::${consumer.cellId}`;
      const consumerPath = canvasScopePath(doc, consumer.scopeId).slice(1);
      for (const expanded of [consumerPath, [...new Set([...consumerPath, ...(providerScope ? canvasScopePath(doc, providerScope).slice(1) : [])])]]) {
        const layout = layoutCanvas(doc, expanded, mode, layers);
        const projected = visibleCanvasEdges(doc, expanded, mode, layers, layout.visibleIds);
        const callLabels = projected.filter(edge => edge.layer === "deployment" && edge.kind === "request" && edge.label).map(edge => `${edge.to}:${edge.label}`);
        assert.equal(new Set(callLabels).size, callLabels.length, `${caseId}: shared routes label a common call once`);
        const call = projected.find(edge => edge.original.from === source && edge.kind === "request" && edge.layer === "deployment");
        assert.ok(call, `${caseId}/${source}/${mode}: connected at every depth`);
        assert.equal(call.from, source);
        assert.ok(layout.visibleIds.includes(call.to), `${caseId}: route reaches visible endpoint or owning group`);
        const route = routeCanvasConnection(layout, doc, call.from, call.to);
        assert.ok(route.length, `${caseId}: routable model connection`);
        for (let index = 1; index < route.length; index++) for (const id of layout.visibleIds) {
          if ([call.from, call.to].includes(id) || doc.items[id].childScopeId && expanded.includes(doc.items[id].childScopeId)) continue;
          const box = layout.absolute[id], a = route[index - 1], b = route[index];
          const crosses = a[1] === b[1]
            ? a[1] > box.y && a[1] < box.y + box.height && Math.max(a[0], b[0]) > box.x && Math.min(a[0], b[0]) < box.x + box.width
            : a[0] > box.x && a[0] < box.x + box.width && Math.max(a[1], b[1]) > box.y && Math.min(a[1], b[1]) < box.y + box.height;
          assert.ok(!crosses, `${caseId}: model route crosses ${id}`);
        }
        if (providerScope) assert.equal(call.to, expanded.includes(providerScope) ? providerScope === "hosting" ? "hosting::ib.host.endpoint" : "infrastructure::routing" : doc.scopes[providerScope].ownerId);
        const hidden = layoutCanvas(doc, expanded, mode, []);
        assert.ok(!visibleCanvasEdges(doc, expanded, mode, [], hidden.visibleIds).some(edge => edge.id === call.id), `${caseId}: hidden infrastructure has no dangling calls`);
      }
    }
  }
});
