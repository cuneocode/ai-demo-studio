import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { architectureDiagrams, type ArchitectureDiagram } from "../app/map/drawio/registry.ts";
import { layoutDiagram } from "./drawio-layout.ts";
import { composeCanvas } from "../app/map/drawio/canvas.ts";
import { canvasScopePath, layoutCanvas } from "../app/map/drawio/canvas-layout.ts";
import { diagramNode } from "../app/map/drawio/model.ts";
import { componentLabel, componentTypes } from "../app/map/drawio/components.ts";

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
const styles = {
  base: "rounded=1;arcSize=12;whiteSpace=wrap;html=1;fontFamily=Arial;fontSize=18;fontColor=#1e293b;strokeColor=#94a3b8;strokeWidth=1.5;fillColor=#f1f5f9;spacing=12;",
  agent: "fillColor=#ede9fe;strokeColor=#a78bfa;", checkpoint: "fillColor=#e8efff;strokeColor=#7795c6;",
  decision: "fillColor=#fff3d6;strokeColor=#bc9453;", service: "fillColor=#e7f3f2;strokeColor=#6a9b98;",
  input: "rounded=1;arcSize=40;", output: "rounded=1;arcSize=40;", group: "fillColor=#ede9fe;strokeColor=#a78bfa;", activity: "",
};
const edgeColors = { request: "#446ac4", return: "#298165", control: "#a37524", telemetry: "#8555b6", hosting: "#6c7a90" };
const symbolImages = Promise.all(Object.values(componentTypes).map(async type => [type.icon, `data:image/svg+xml;base64,${Buffer.from(await readFile(new URL(`../public/vendor/drawio/carbon/${type.icon}.svg`, import.meta.url))).toString("base64")}`])).then(Object.fromEntries);

/** One editable draw.io diagram, with native nested groups and stable cells. */
export async function renderDrawio(definition: ArchitectureDiagram) {
  const pages = await Promise.all(definition.pages.map(layoutDiagram));
  const doc = composeCanvas(pages, definition.catalog);
  const symbols = await symbolImages;
  const modes = definition.catalog.scenes[definition.catalog.rootSceneId].modes;
  const initial = layoutCanvas(doc, [], modes[0], []);
  const scopeLayouts = Object.fromEntries(Object.keys(doc.scopes).map((id) => [id, layoutCanvas(doc, canvasScopePath(doc, id).slice(1), modes[0], ["security", "observability", "deployment"])]));
  const cells = Object.values(doc.items).map((item) => {
    const node = diagramNode(definition.catalog, item);
    const ownerId = doc.scopes[item.scopeId].ownerId;
    const geometry = ownerId ? scopeLayouts[item.scopeId].cells[item.id] : initial.cells[item.id];
    const alternate = item.childScopeId ? scopeLayouts[item.childScopeId].cells[item.id] : undefined;
    const label = componentLabel(item, false, modes[0], "light", symbols);
    const typeStyle = item.componentType === "agent" ? styles.agent : item.componentType === "tool" || item.componentType === "database" ? styles.service : item.componentType === "model" || item.componentType === "gateway" ? styles.checkpoint : "";
    return `<object id="${item.id}" label="${escapeXml(label)}" studioId="${item.id}" componentType="${item.componentType}" sceneId="${item.sceneId}" instanceId="${item.instanceId}" entityId="${node.entityId ?? ""}"${item.childScopeId ? ` childScope="${item.childScopeId}"` : ""}><mxCell style="${styles.base}${styles[item.role ?? node.role]}${typeStyle}${item.childScopeId ? "container=1;collapsible=1;foldable=1;strokeWidth=2;" : ""}" vertex="1" visible="${!item.layer && (!item.modes || item.modes.includes(modes[0])) ? 1 : 0}" parent="${ownerId ?? "workflow"}"${item.childScopeId ? ' collapsed="1"' : ""}><mxGeometry x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" as="geometry">${alternate ? `<mxRectangle x="${geometry.x}" y="${geometry.y}" width="${alternate.width}" height="${alternate.height}" as="alternateBounds"/>` : ""}</mxGeometry></mxCell></object>`;
  });
  const boundaries = doc.boundaries.map((box) => {
    const geometry = scopeLayouts[box.scopeId].boundaries[box.id] ?? { x: 0, y: 0, width: 1, height: 1 };
    return `<mxCell id="${box.id}" value="${escapeXml(box.label)}" style="rounded=1;arcSize=5;whiteSpace=wrap;html=1;verticalAlign=top;align=left;spacingTop=12;spacingLeft=14;fontFamily=Arial;fontSize=15;fontColor=#64748b;fillColor=none;strokeColor=#cbd5e1;dashed=1;dashPattern=6 4;pointerEvents=0;" vertex="1" parent="${doc.scopes[box.scopeId].ownerId ?? "workflow"}"><mxGeometry x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" as="geometry"/></mxCell>`;
  });
  const edges = doc.edges.map((edge) => {
    const color = edgeColors[edge.kind ?? "request"];
    return `<object id="${edge.id}" label="${escapeXml(edge.label)}" relationshipIds="${edge.relationshipIds.join(" ")}"><mxCell edge="1" source="${edge.from}" target="${edge.to}" parent="${doc.scopes[edge.scopeId].ownerId ?? "workflow"}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;${edge.bidirectional ? "startArrow=block;startFill=1;" : ""}strokeWidth=1.7;strokeColor=${color};fontColor=${color};fontFamily=Arial;fontSize=14;labelBackgroundColor=#ffffff;${edge.layer ? "dashed=1;dashPattern=5 4;" : ""}"><mxGeometry relative="1" as="geometry"/></mxCell></object>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by npm run map:drawio. One persistent canvas with collapsible groups. -->\n<mxfile host="app.diagrams.net" version="32.5.5" type="device"><diagram id="architecture" name="Architecture" studioCanvas="${escapeXml(JSON.stringify({ ...doc, symbols }))}"><mxGraphModel grid="1" gridSize="10" page="0" pageWidth="1169" pageHeight="827"><root><mxCell id="0"/><mxCell id="workflow" parent="0"/>${[...boundaries, ...edges, ...cells].join("\n")}</root></mxGraphModel></diagram></mxfile>\n`;
}

export async function renderCanvasRuntime() {
  const source = await readFile(new URL("../app/map/drawio/canvas-layout.ts", import.meta.url), "utf8");
  return `// Generated by npm run map:drawio from app/map/drawio/canvas-layout.ts.\n${ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText}`;
}
export async function renderComponentRuntime() {
  const source = await readFile(new URL("../app/map/drawio/components.ts", import.meta.url), "utf8");
  return `// Generated by npm run map:drawio from app/map/drawio/components.ts.\n${ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText}`;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], `file://${process.cwd()}/`))) {
  await writeFile(new URL("../public/diagrams/canvas-layout.js", import.meta.url), await renderCanvasRuntime());
  await writeFile(new URL("../public/diagrams/components.js", import.meta.url), await renderComponentRuntime());
  for (const definition of Object.values(architectureDiagrams)) {
    await writeFile(new URL(`../public${definition.asset}`, import.meta.url), await renderDrawio(definition));
    console.log(`Updated public${definition.asset} (one canvas, ${definition.pages.length} scopes)`);
  }
}
