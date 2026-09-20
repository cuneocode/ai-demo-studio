import test from 'node:test';
import assert from 'node:assert/strict';
import { bankingKnowledge, bankingRuntime, briefingKnowledge, briefingRuntime, capabilityDiagram, deploymentDiagram, fraudKnowledge, fraudRuntime, knowledgeDiagram, profiles, proposedRuntime, securityDiagram } from '../app/architecture-model.ts';

const sample={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:Array.from({length:4},(_,i)=>({title:`Step ${i}`,detail:'Business step'})),ai:Array.from({length:3},(_,i)=>({point:`${i} → ${i+1}`,label:`AI ${i}`,detail:'Capability'}))}};
const fraudFrame={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:[{title:'Select a payment',detail:'Held-out TabFormer card events'},{title:'Score the graph edge',detail:'Neighborhood + transaction features'},{title:'Inspect evidence',detail:'Probability + Shapley groups'},{title:'Decide disposition',detail:'Analyst-owned hold / review / clear'}],ai:[{point:'01 → 02',label:'GraphSAGE + XGBoost + Shapley',detail:'Score path never enters AI Defense.'},{point:'02 → 03',label:'Threshold band',detail:'hold ≥ 0.50'},{point:'03 → 04',label:'Optional narrative',detail:'AI Defense inspects only this hop.'}]}};
const briefingFrame={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:[{title:'Identify the issuer',detail:'Ticker, name, or upload'},{title:'Ingest the annual report',detail:'EDGAR 10-K or uploaded file'},{title:'Extract grounded themes',detail:'TOC nodes + companyfacts'},{title:'Accept studio context',detail:'Presenter-owned accept-gate'}],ai:[{point:'01 → 02',label:'Deep Agent supervisor',detail:'Plans and delegates. Never reads filing nodes.'},{point:'02 → 03',label:'Theme subagents',detail:'read_filing_node plus XBRL facts.'},{point:'03 → 04',label:'Ground and accept',detail:'Cite-or-abstain verifier, then Use this company.'}]}};
const graphs=[bankingRuntime(),bankingKnowledge(),fraudRuntime(),fraudKnowledge(),briefingRuntime(),briefingKnowledge(),...Object.keys(profiles).flatMap(id=>[proposedRuntime(id),knowledgeDiagram(id),securityDiagram(id),deploymentDiagram(id)]),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(sample,i)),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(fraudFrame,i,'fraud-modeling')),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(briefingFrame,i,'company-briefing'))];
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
test('Live fraud score path does not wait on the LLM explainer',()=>{
 const live=fraudRuntime();
 assert.ok(live.edges.some(e=>e.from==='shap'&&e.to==='release'&&e.label.includes('no LLM')));
 assert.ok(live.edges.some(e=>e.from==='shap'&&e.to==='narrative'));
 assert.ok(live.nodes.find(n=>n.id==='defense')?.detail.includes('narrative'));
 assert.ok(live.edges.some(e=>e.from==='defense'&&e.to==='omit'));
 assert.ok(!live.nodes.some(n=>n.title.includes('financial-fraud-training')));
});
test('Fraud training stays on the offline backend map',()=>{
 const knowledge=fraudKnowledge();
 assert.ok(knowledge.nodes.some(n=>n.id==='train'));
 assert.ok(knowledge.nodes.some(n=>n.id==='fixtureTable'));
 assert.ok(knowledge.note.includes('never starts'));
});
test('Fraud capability keeps AI Defense off the score path',()=>{
 for(const step of [0,1,2,3]){
  const graph=capabilityDiagram(fraudFrame,step,'fraud-modeling');
  assert.ok(!graph.edges.some(e=>e.from==='ai'&&e.to==='defense'));
  assert.ok(graph.edges.some(e=>e.from==='narrative'&&e.to==='defense'));
  assert.ok(graph.edges.some(e=>e.from==='ai'&&e.to==='p2'&&e.label.includes('no Defense')));
  assert.ok(graph.nodes.find(n=>n.id==='defense')?.detail.includes('narrative'));
  assert.ok(graph.nodes.some(n=>n.id==='ai'&&n.title.includes('GraphSAGE')));
  assert.ok(graph.nodes.find(n=>n.id==='narrative')?.subtitle.toLowerCase().includes('off'));
 }
});
test('Brahe capability keeps Defense on the model path',()=>{
 const graph=capabilityDiagram(sample,1,'brahe-bank');
 assert.ok(graph.edges.some(e=>e.from==='ai'&&e.to==='defense'));
});
test('Inspection has allow and block paths; telemetry remains separate',()=>{
 const graph=securityDiagram('client-advisory');assert.ok(graph.edges.some(e=>e.from==='input'&&e.to==='model'&&e.label==='allow'));assert.ok(graph.edges.some(e=>e.from==='input'&&e.to==='stop'));assert.ok(graph.edges.some(e=>e.from==='output'&&e.to==='stop'));assert.ok(graph.edges.some(e=>e.from==='collector'&&e.to==='splunk'&&e.kind==='telemetry'));
});
test('Company briefing profile exists and proposed views stay sequential and non-vector',()=>{
 assert.ok(profiles['company-briefing']);
 const proposed=proposedRuntime('company-briefing');
 assert.ok(proposed.edges.some(e=>e.from==='left'&&e.to==='right'&&e.label.includes('next task')));
 const knowledge=knowledgeDiagram('company-briefing');
 assert.ok(knowledge.note.includes('no vector index'));
 assert.ok(!knowledge.nodes.some(n=>n.title==='Embedding model'||/pinecone/i.test(n.title)));
});
test('Live briefing keeps Defense off EDGAR, filesystem, and grounding',()=>{
 const live=briefingRuntime();
 const offInspection=new Set(['edgar','upload','sandbox','toc','facts','nodes','grounding','resolve','ingestFail','path']);
 assert.ok(!live.edges.some(e=>offInspection.has(e.from)&&e.to==='defense'));
 assert.ok(!live.edges.some(e=>e.from==='defense'&&offInspection.has(e.to)));
 assert.ok(!live.edges.some(e=>e.from==='supervisor'&&e.to==='nodes'));
 assert.ok(live.nodes.some(n=>n.id==='gate'&&n.title.includes('accept-gate')));
 assert.ok(live.note.includes('does not assert live SEC or OpenAI'));
 assert.ok(live.note.includes('No vector index'));
 assert.ok(!live.nodes.some(n=>/vector index|pinecone|tavily/i.test(`${n.title} ${n.subtitle}`)));
});
test('Live briefing puts Defense on every model hop',()=>{
 const live=briefingRuntime();
 assert.ok(live.edges.some(e=>e.from==='supervisor'&&e.to==='defense'));
 assert.ok(live.edges.some(e=>e.from==='subagents'&&e.to==='defense'));
 assert.ok(live.edges.some(e=>e.from==='model'&&e.to==='defense'));
 assert.ok(live.edges.some(e=>e.from==='defense'&&e.to==='errors'));
 assert.ok(live.edges.some(e=>e.from==='nodes'&&e.to==='subagents'&&e.label.includes('read_filing_node')));
});
test('Briefing filing retrieval is a map, not embeddings',()=>{
 const knowledge=briefingKnowledge();
 assert.ok(knowledge.nodes.some(n=>n.id==='tickers'));
 assert.ok(knowledge.nodes.some(n=>n.id==='cache'));
 assert.ok(knowledge.nodes.some(n=>n.id==='facts'));
 assert.ok(knowledge.nodes.some(n=>n.id==='upload'));
 assert.ok(knowledge.nodes.some(n=>n.id==='nodes'&&/not embeddings/i.test(n.detail)));
 assert.ok(knowledge.note.includes('not embeddings'));
 assert.ok(!knowledge.nodes.some(n=>/embedding model|vector index|pinecone/i.test(`${n.title} ${n.detail}`)));
});
test('Briefing capability keeps Defense off EDGAR/filesystem and on model hops',()=>{
 for(const step of [0,1,2,3]){
  const graph=capabilityDiagram(briefingFrame,step,'company-briefing');
  assert.ok(!graph.edges.some(e=>['ingest','nav','xbrl','grounding'].includes(e.from)&&e.to==='defense'));
  assert.ok(graph.edges.some(e=>e.from==='supervisor'&&e.to==='defense'));
  assert.ok(graph.edges.some(e=>e.from==='subagents'&&e.to==='defense'));
  assert.ok(graph.nodes.find(n=>n.id==='defense')?.detail.includes('Filing bytes never enter'));
  assert.ok(graph.note.includes('does not assert live SEC or OpenAI'));
 }
});
