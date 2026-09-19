import test from 'node:test';
import assert from 'node:assert/strict';
import { bankingKnowledge, bankingRuntime, capabilityDiagram, deploymentDiagram, knowledgeDiagram, profiles, proposedRuntime, securityDiagram } from '../app/architecture-model.ts';

const sample={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:Array.from({length:4},(_,i)=>({title:`Step ${i}`,detail:'Business step'})),ai:Array.from({length:3},(_,i)=>({point:`${i} → ${i+1}`,label:`AI ${i}`,detail:'Capability'}))}};
const graphs=[bankingRuntime(),bankingKnowledge(),...Object.keys(profiles).flatMap(id=>[proposedRuntime(id),knowledgeDiagram(id),securityDiagram(id),deploymentDiagram(id)]),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(sample,i))];
for(const graph of graphs)test(`Valid connected diagram: ${graph.title}`,()=>{
 const ids=new Set(graph.nodes.map(n=>n.id));assert.equal(ids.size,graph.nodes.length);
 for(const node of graph.nodes){assert.ok(node.title&&node.detail);assert.ok(node.x>=0&&node.y>=0);assert.ok(node.x+240<=graph.width,`${node.id} outside width`);assert.ok(node.y+128<=graph.height,`${node.id} outside height`);assert.ok(graph.edges.some(e=>e.from===node.id||e.to===node.id),`${node.id} disconnected`);}
 for(const edge of graph.edges){assert.ok(ids.has(edge.from)&&ids.has(edge.to),`Dangling edge ${edge.from} → ${edge.to}`);assert.ok(edge.label.trim());}
});
test('Running bank does not claim proposed controls or private inference',()=>{
 const live=bankingRuntime();assert.ok(live.nodes.some(n=>n.title==='InMemorySaver'));assert.ok(live.nodes.some(n=>n.title==='OpenAI hosted model'));assert.ok(live.nodes.some(n=>n.title==='Cisco AI Defense'));assert.ok(live.nodes.some(n=>n.title==='Splunk OTLP export'));assert.ok(live.edges.some(e=>e.from==='supervisor'&&e.to==='cards'));assert.ok(live.edges.some(e=>e.from==='supervisor'&&e.to==='score'));
});
test('Brahe inspection is on every model boundary and can fail before answer release',()=>{
 const live=bankingRuntime();assert.ok(live.edges.some(e=>e.from==='api'&&e.to==='defense'&&e.label.includes('full context')));assert.ok(live.edges.some(e=>e.from==='defense'&&e.to==='model'&&e.label.startsWith('allow')));assert.ok(live.edges.some(e=>e.from==='model'&&e.to==='defense'&&e.label.includes('tool args')));assert.ok(live.edges.some(e=>e.from==='defense'&&e.to==='errors'));assert.ok(live.nodes.find(n=>n.id==='splunk')?.detail.includes('only when configured'));
});
test('Fraud scoring does not wait on the investigation agent',()=>{
 const graph=proposedRuntime('fraud-modeling');assert.ok(graph.edges.some(e=>e.from==='left'&&e.to==='result'));assert.ok(graph.edges.some(e=>e.to==='right'&&e.kind==='telemetry'));
});
test('Inspection has allow and block paths; telemetry remains separate',()=>{
 const graph=securityDiagram('client-advisory');assert.ok(graph.edges.some(e=>e.from==='input'&&e.to==='model'&&e.label==='allow'));assert.ok(graph.edges.some(e=>e.from==='input'&&e.to==='stop'));assert.ok(graph.edges.some(e=>e.from==='output'&&e.to==='stop'));assert.ok(graph.edges.some(e=>e.from==='collector'&&e.to==='splunk'&&e.kind==='telemetry'));
});
