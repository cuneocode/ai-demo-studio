import test from 'node:test';
import assert from 'node:assert/strict';
import { advisoryKnowledge, advisoryRuntime, bankingKnowledge, bankingRuntime, briefingKnowledge, briefingRuntime, capabilityDiagram, deploymentDiagram, fraudKnowledge, fraudRuntime, knowledgeDiagram, presentDiagram, profiles, proposedRuntime, researchKnowledge, researchRuntime, securityDiagram } from '../app/architecture-model.ts';
import { buildZoomScene, routeSceneEdge, zoomCaseIds, zoomMaps } from '../app/architecture-zoom.ts';

const sample={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:Array.from({length:4},(_,i)=>({title:`Step ${i}`,detail:'Business step'})),ai:Array.from({length:3},(_,i)=>({point:`${i} → ${i+1}`,label:`AI ${i}`,detail:'Capability'}))}};
const fraudFrame={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:[{title:'Select a payment',detail:'Held-out TabFormer card events'},{title:'Score the graph edge',detail:'Neighborhood + transaction features'},{title:'Inspect evidence',detail:'Probability + TreeSHAP groups'},{title:'Decide disposition',detail:'Analyst-owned hold / review / clear'}],ai:[{point:'01 → 02',label:'GraphSAGE + XGBoost + TreeSHAP',detail:'Score path never enters AI Defense.'},{point:'02 → 03',label:'Threshold band',detail:'hold ≥ 0.50'},{point:'03 → 04',label:'Optional narrative',detail:'AI Defense inspects only this hop.'}]}};
const briefingFrame={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:[{title:'Identify the issuer',detail:'Ticker, name, or upload'},{title:'Ingest the annual report',detail:'EDGAR 10-K or uploaded file'},{title:'Extract grounded themes',detail:'TOC nodes + companyfacts'},{title:'Accept studio context',detail:'Presenter-owned accept-gate'}],ai:[{point:'01 → 02',label:'Deep Agent supervisor',detail:'Plans and delegates. Never reads filing nodes.'},{point:'02 → 03',label:'Theme subagents',detail:'read_filing_node plus XBRL facts.'},{point:'03 → 04',label:'Ground and accept',detail:'Cite-or-abstain verifier, then Use this company.'}]}};
const researchFrame={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:[{title:'Select a ticker',detail:'Any US ticker'},{title:'Fetch or reuse cache',detail:'Yahoo + FRED'},{title:'Review indicators + conflicts',detail:'CPU tools'},{title:'Accept research note',detail:'Presenter-owned accept-gate'}],ai:[{point:'01 → 02',label:'Fetch + snapshot cache',detail:'Allowlisted yfinance and FRED.'},{point:'02 → 03',label:'CPU tools + conflicts',detail:'Structured rows before the LLM.'},{point:'03 → 04',label:'Model-chain note + accept-gate',detail:'Sparky vLLM, else the OpenAI API. Defense on hops only.'}]}};
const advisoryFrame={transformation:{friction:'Before',aiShift:'After',humanControl:'Review'},architecture:{process:[{title:'Enter live holdings',detail:'Ticker + weight'},{title:'Assemble entitled context',detail:'Accepted briefing + note'},{title:'Run suitability rules',detail:'CPU rules'},{title:'Accept meeting brief',detail:'Advisor-owned accept-gate'}],ai:[{point:'01 → 02',label:'Entitled context assembly',detail:'Posted accepted context. Off Inspection.'},{point:'02 → 03',label:'Suitability rules',detail:'Not an LLM and not sent to Defense.'},{point:'03 → 04',label:'Model-chain brief + advisor gate',detail:'Sparky vLLM, else OpenAI under enforced AI Defense. Holdings remain if brief omitted.'}]}};
const graphs=[bankingRuntime(),bankingKnowledge(),fraudRuntime(),fraudKnowledge(),briefingRuntime(),briefingKnowledge(),researchRuntime(),researchKnowledge(),advisoryRuntime(),advisoryKnowledge(),...Object.keys(profiles).flatMap(id=>[proposedRuntime(id),knowledgeDiagram(id),securityDiagram(id),deploymentDiagram(id)]),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(sample,i)),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(fraudFrame,i,'fraud-modeling')),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(briefingFrame,i,'company-briefing')),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(researchFrame,i,'market-research')),...[0,1,2,3,99,-1].map(i=>capabilityDiagram(advisoryFrame,i,'client-advisory'))];
for(const graph of graphs)test(`Valid connected diagram: ${graph.title}`,()=>{
 const ids=new Set(graph.nodes.map(n=>n.id));assert.equal(ids.size,graph.nodes.length);
 for(const node of graph.nodes){assert.ok(node.title&&node.detail);assert.ok(node.x>=0&&node.y>=0);assert.ok(node.x+240<=graph.width,`${node.id} outside width`);assert.ok(node.y+128<=graph.height,`${node.id} outside height`);assert.ok(graph.edges.some(e=>e.from===node.id||e.to===node.id),`${node.id} disconnected`);}
 for(const edge of graph.edges){assert.ok(ids.has(edge.from)&&ids.has(edge.to),`Dangling edge ${edge.from} → ${edge.to}`);assert.ok(edge.label.trim());}
});
test('Running bank does not claim proposed controls or private inference',()=>{
 const live=bankingRuntime();assert.ok(live.nodes.some(n=>n.title==='InMemorySaver'));assert.ok(live.nodes.some(n=>n.title==='Studio model chain'&&/OpenAI API/.test(n.detail)&&/no NVIDIA NIM or Cisco UCS GPU/.test(n.detail)));assert.ok(live.nodes.some(n=>n.title==='Cisco AI Defense'));assert.ok(live.nodes.some(n=>n.title==='Splunk OTLP export'));assert.ok(live.edges.some(e=>e.from==='supervisor'&&e.to==='cards'));assert.ok(live.edges.some(e=>e.from==='supervisor'&&e.to==='score'));
});
test('Brahe inspection is on every model boundary and can fail before answer release',()=>{
 const live=bankingRuntime();assert.ok(live.edges.some(e=>e.from==='api'&&e.to==='defense'&&e.label.includes('full context')));assert.ok(live.edges.some(e=>e.from==='defense'&&e.to==='model'&&e.label.startsWith('allow')));assert.ok(live.edges.some(e=>e.from==='model'&&e.to==='defense'&&e.label.includes('tool args')));assert.ok(live.edges.some(e=>e.from==='defense'&&e.to==='errors'));assert.ok(live.nodes.find(n=>n.id==='splunk')?.detail.includes('only when configured'));
});
test('Fraud scoring does not wait on the investigation agent',()=>{
 const graph=proposedRuntime('fraud-modeling');assert.ok(graph.edges.some(e=>e.from==='left'&&e.to==='result'));assert.ok(graph.edges.some(e=>e.to==='right'&&e.kind==='telemetry'));
});
test('Live fraud score path does not wait on the triage agent',()=>{
 const live=fraudRuntime();
 assert.ok(live.edges.some(e=>e.from==='shap'&&e.to==='release'&&e.label.includes('no LLM')));
 assert.ok(live.edges.some(e=>e.from==='shap'&&e.to==='narrative'));
 assert.ok(live.nodes.find(n=>n.id==='defense')?.detail.includes('dispute note'));
 assert.ok(live.nodes.find(n=>n.id==='shap')?.title.includes('TreeSHAP'));
 assert.ok(live.nodes.find(n=>n.id==='analyst')?.subtitle.includes('fraud.take_action'));
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
  assert.ok(graph.nodes.find(n=>n.id==='defense')?.detail.includes('dispute note'));
  assert.ok(graph.nodes.some(n=>n.id==='ai'&&n.title.includes('GraphSAGE')));
  assert.ok(graph.nodes.find(n=>n.id==='narrative')?.title.includes('triage agent'));
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
test('Live research keeps Defense off calc tools, the verifier, and policy checks',()=>{
 const live=researchRuntime();
 const offInspection=new Set(['fixtures','cache','tools','grounding','scan','precheck','control','gate','store']);
 assert.ok(!live.edges.some(e=>offInspection.has(e.from)&&e.to==='defense'));
 assert.ok(!live.edges.some(e=>e.from==='defense'&&offInspection.has(e.to)));
 assert.ok(live.edges.some(e=>e.from==='news'&&e.to==='defense'),'news is inspected as a tool result');
 assert.ok(live.edges.some(e=>e.from==='api'&&e.to==='precheck'),'the restricted-list pre-check runs first');
 assert.ok(live.edges.some(e=>e.from==='precheck'&&e.to==='blocked'));
 assert.ok(live.nodes.some(n=>n.id==='gate'&&n.title.includes('Strategist publishes')));
 assert.ok(live.note.includes('does not assert live Yahoo, FRED, or model'));
 assert.ok(/not investment advice/i.test(live.note));
 assert.ok(!live.nodes.some(n=>/vector index|tavily|fixture pack/i.test(`${n.title} ${n.subtitle} ${n.detail}`)));
});
test('Live research puts Defense on model hops and never dies without a model',()=>{
 const live=researchRuntime();
 assert.ok(live.edges.some(e=>e.from==='nim'&&e.to==='defense'));
 assert.ok(live.edges.some(e=>e.from==='model'&&e.to==='defense'));
 assert.ok(live.edges.some(e=>e.from==='defense'&&e.to==='omit'));
 assert.ok(live.edges.some(e=>e.from==='nim'&&e.to==='grounding'));
 assert.ok(live.edges.some(e=>e.from==='gate'&&e.to==='control'));
 assert.ok(/fixture summary|code-written/i.test(live.nodes.find(n=>n.id==='omit')?.detail||''));
 assert.ok(live.nodes.find(n=>n.id==='model')?.detail.includes('127.0.0.1:8003')||live.nodes.find(n=>n.id==='compute')?.detail.includes('127.0.0.1:8003'));
});
test('Research evidence map has no vector index and searches the filing by section',()=>{
 const knowledge=researchKnowledge();
 assert.ok(knowledge.nodes.some(n=>n.id==='snap'));
 assert.ok(knowledge.nodes.some(n=>n.id==='filing'));
 assert.ok(knowledge.note.includes('No vector index'));
 assert.ok(!knowledge.nodes.some(n=>/embedding model|vector index|tavily/i.test(`${n.title} ${n.detail}`)));
});
test('Research capability keeps Defense off evidence and the verifier and on the model hop',()=>{
 for(const step of [0,1,2,3]){
  const graph=capabilityDiagram(researchFrame,step,'market-research');
  assert.ok(!graph.edges.some(e=>['evidence','grounding','precheck'].includes(e.from)&&e.to==='defense'));
  assert.ok(graph.edges.some(e=>e.from==='nim'&&e.to==='defense'));
  assert.ok(graph.edges.some(e=>e.from==='news'&&e.to==='defense'));
  assert.ok(graph.note.includes('does not assert live Yahoo, FRED, or model'));
 }
});
test('Live advisory keeps Defense off rules, actions, and the verifier, and on CRM notes',()=>{
 const live=advisoryRuntime();
 const offInspection=new Set(['suitability','nba','grounding','rows','metrics','household','posted','gate','supervisor','control','store']);
 assert.ok(!live.edges.some(e=>offInspection.has(e.from)&&e.to==='defense'));
 assert.ok(!live.edges.some(e=>e.from==='defense'&&offInspection.has(e.to)));
 assert.ok(live.edges.some(e=>e.from==='notes'&&e.to==='defense'),'CRM notes are inspected as tool results');
 assert.ok(live.edges.some(e=>e.from==='gate'&&e.to==='supervisor')&&live.edges.some(e=>e.from==='supervisor'&&e.to==='control'));
 assert.ok(live.note.includes('does not assert live Yahoo, FRED, or model'));
 assert.ok(/not advice/i.test(live.note));
});
test('Live advisory puts Defense on model hops and keeps findings if no model may answer',()=>{
 const live=advisoryRuntime();
 assert.ok(live.edges.some(e=>e.from==='nim'&&e.to==='defense'));
 assert.ok(live.edges.some(e=>e.from==='defense'&&e.to==='omit'));
 assert.ok(live.edges.some(e=>e.from==='model'&&e.to==='egress')&&live.edges.some(e=>e.from==='egress'&&e.to==='defense'));
 assert.ok(live.edges.some(e=>e.from==='suitability'&&e.to==='rows'));
 assert.ok(live.nodes.find(n=>n.id==='omit')?.detail.toLowerCase().includes('remain'));
});
test('Advisory client-context map has only synthetic households and no vector index',()=>{
 const knowledge=advisoryKnowledge();
 assert.ok(knowledge.nodes.some(n=>n.id==='briefing'));
 assert.ok(knowledge.nodes.some(n=>n.id==='research'));
 assert.ok(knowledge.note.includes('No household CRM catalog'));
 assert.ok(!knowledge.nodes.some(n=>/embedding model|vector index|tavily/i.test(`${n.title} ${n.detail}`)));
});
test('Advisory capability keeps Defense off rules and actions and on notes and the model hop',()=>{
 for(const step of [0,1,2,3]){
  const graph=capabilityDiagram(advisoryFrame,step,'client-advisory');
  assert.ok(!graph.edges.some(e=>['suitability','nba','household','grounding'].includes(e.from)&&e.to==='defense'));
  assert.ok(graph.edges.some(e=>e.from==='nim'&&e.to==='defense'));
  assert.ok(graph.note.includes('does not assert live Yahoo, FRED, or model'));
 }
});
test('No diagram claims Cisco UCS / GPU inference as implemented',()=>{
 for(const graph of graphs){
  const scope=`${graph.title} ${graph.note}`;
  for(const node of graph.nodes){
   const text=`${node.title} ${node.subtitle} ${node.detail}`;
   assert.ok(!/local nim/i.test(`${node.title} ${node.subtitle}`),`${graph.title}: ${node.id} still says Local NIM`);
   if(!/\bUCS\b/.test(text))continue;
   assert.ok(!/\bimplemented\b/i.test(text),`${graph.title}: ${node.id} claims UCS as implemented`);
   assert.ok(/proposed/i.test(text)||/proposed/i.test(scope)||/\bno\b[^.]*UCS/i.test(text),`${graph.title}: ${node.id} mentions UCS without saying proposed or absent`);
  }
 }
});
test('Wealth model host is Sparky on a DGX Spark dev box, with Cisco AI POD proposed',()=>{
 const wealth=[researchRuntime(),advisoryRuntime(),...[0,3].flatMap(i=>[capabilityDiagram(researchFrame,i,'market-research'),capabilityDiagram(advisoryFrame,i,'client-advisory')])];
 for(const graph of wealth){
  const compute=graph.nodes.find(n=>n.id==='compute');
  assert.match(compute.title,/Sparky/);
  assert.match(compute.detail,/DGX Spark/);
  assert.match(compute.detail,/not Cisco hardware/);
  assert.match(`${compute.subtitle} ${compute.detail}`,/proposed/i);
  assert.notEqual(compute.kind,'cisco',`${graph.title}: the dev host is not a Cisco node`);
  assert.match(graph.note,/Studio model chain/);
  assert.ok(!graph.edges.some(e=>/implemented/i.test(e.label)),`${graph.title}: no edge calls the dev host implemented`);
 }
 for(const graph of [researchRuntime(),advisoryRuntime()]){
  const model=graph.nodes.find(n=>n.id==='model');
  assert.equal(model.title,'Studio model chain');
  assert.match(model.subtitle,/Sparky vLLM → OpenAI API/);
 }
 assert.match(advisoryRuntime().note,/only with AI Defense forced to enforce/);
 for(const id of ['market-research','client-advisory']){
  assert.match(profiles[id].gpu,/Sparky vLLM/);
  assert.match(profiles[id].gpu,/DGX Spark/);
  assert.match(profiles[id].gpu,/proposed/);
 }
});
test('Wealth profiles describe evidence, publish, and approval gates',()=>{
 assert.ok(profiles['market-research'].store.toLowerCase().includes('cache'));
 assert.ok(profiles['market-research'].gate.toLowerCase().includes('publishes'));
 assert.ok(profiles['client-advisory'].gate.toLowerCase().includes('supervisor approves'));
 assert.ok(profiles['client-advisory'].right.toLowerCase().includes('suitability'));
});
test('Live research and advisory show optional Galileo / Splunk Agent Observability as telemetry',()=>{
 for(const graph of [researchRuntime(), advisoryRuntime()]){
  const galileo=graph.nodes.find(n=>n.id==='galileo');
  assert.ok(galileo?.title.includes('Splunk Agent Observability'));
  assert.ok(/Galileo/i.test(galileo?.detail||''));
  assert.ok(!/topic judge|stay-on-topic/i.test(`${galileo?.title} ${galileo?.subtitle}`));
  assert.ok(!/dashboard was verified|live dashboard/i.test(galileo?.detail||''));
  assert.ok(!graph.nodes.some(n=>n.id==='topic'));
  assert.ok(graph.edges.some(e=>e.to==='galileo'&&e.kind==='telemetry'));
  const splunk=graph.nodes.find(n=>n.id==='splunk');
  assert.ok(splunk?.detail.includes('only when'));
  assert.ok(graph.edges.some(e=>e.from==='api'&&e.to==='splunk'&&e.kind==='telemetry'));
 }
});
function zoomText(map) {
  const bits = [map.note];
  for (const region of map.cores) bits.push(region.title, region.subtitle, region.detail);
  for (const edge of map.coreEdges) bits.push(edge.from, edge.to, edge.label);
  for (const interior of Object.values(map.interiors)) {
    bits.push(interior.note);
    for (const entity of [...interior.entities, ...interior.stubs]) {
      bits.push(entity.title, entity.subtitle, entity.detail);
      for (const item of entity.chips ?? []) bits.push(item.title, item.subtitle, item.detail);
    }
    for (const edge of interior.edges) bits.push(edge.from, edge.to, edge.label);
  }
  return bits.join('\n');
}

test('Zoom maps cover every use case with three altitudes', () => {
  assert.deepEqual(zoomCaseIds.sort(), Object.keys(profiles).sort());
  for (const id of zoomCaseIds) {
    const map = zoomMaps[id];
    assert.ok(map.cores.length >= 2 && map.cores.length <= 6, id);
    for (const region of map.cores) assert.ok(map.interiors[region.id], `${id} missing interior ${region.id}`);
    for (const edge of map.coreEdges) {
      assert.ok(map.cores.some(region => region.id === edge.from), edge.from);
      assert.ok(map.cores.some(region => region.id === edge.to), edge.to);
    }
  }
});

test('Zoom altitudes keep the live perimeters', () => {
  const brahe = zoomText(zoomMaps['brahe-bank']);
  assert.match(brahe, /brahe-banking-scope/);
  assert.match(brahe, /InMemorySaver/);
  assert.match(brahe, /OpenAI/);
  assert.equal(zoomMaps['brahe-bank'].cores.some(region => region.id === 'defense'), true);

  const fraud = zoomMaps['fraud-modeling'];
  const fraudText = zoomText(fraud);
  assert.equal(fraud.coreEdges.some(edge => edge.from === 'graph' && edge.to === 'defense'), false);
  assert.match(fraudText, /no LLM/);
  assert.match(fraudText, /never starts training/);
  assert.match(fraudText, /recorded Sparky scores/);
  assert.match(fraudText, /triage agent/i);
  assert.match(fraudText, /TreeSHAP/);
  assert.doesNotMatch(fraudText, /Captum|Shapley/);

  const briefing = zoomText(zoomMaps['company-briefing']);
  assert.match(briefing, /does not assert live SEC or OpenAI/);
  assert.match(briefing, /No vector index/);
  assert.match(briefing, /read_filing_node/);
  assert.equal(zoomMaps['company-briefing'].coreEdges.some(edge => edge.from === 'filings' && edge.to === 'defense'), false);

  const research = zoomText(zoomMaps['market-research']);
  assert.match(research, /127\.0\.0\.1:8003/);
  assert.match(research, /not investment advice/i);
  assert.match(research, /No vector index/);
  assert.match(research, /never enter Inspection/);
  assert.match(research, /only when configured/i);
  assert.match(research, /Agent Control/);

  const advisory = zoomText(zoomMaps['client-advisory']);
  assert.match(advisory, /No household CRM catalog/);
  assert.match(advisory, /not advice/i);
  assert.match(advisory, /Findings remain/);
  assert.equal(zoomMaps['client-advisory'].coreEdges.some(edge => edge.from === 'workload' && edge.to === 'defense'), false);
  assert.equal(zoomMaps['transaction-llm'].coreEdges.some(edge => edge.from === 'pipeline' && edge.to === 'defense'), false);
  assert.equal(zoomMaps['fraud-modeling'].interiors.observe.entities.some(entity => /eval model/i.test(entity.title)), false);
  // Services that evaluate Agent Control policies must not be drawn as "traces only".
  for (const [id, policy] of [['fraud-modeling', 'fraud.take_action'], ['market-research', 'research.publish'], ['client-advisory', 'advisory.recommendation']]) {
    const observe = zoomText({ cores: [], coreEdges: [], interiors: { observe: zoomMaps[id].interiors.observe } });
    assert.doesNotMatch(observe, /does not (run|call) Agent Control/, id);
    assert.match(observe, new RegExp(policy.replace('.', '\\.')), id);
    assert.match(observe, /local check/, id);
  }
  assert.doesNotMatch(zoomText(zoomMaps['client-advisory']), /Fraud and SAR context are not wired in/);
  assert.equal(zoomMaps['kyc-processing'].implemented, false);

  const sar = zoomText(zoomMaps['sar-support']);
  assert.equal(zoomMaps['sar-support'].implemented, true);
  assert.match(sar, /e-filing is simulated/i);
  assert.match(sar, /only with AI Defense forced to enforce/);
  assert.match(sar, /sar\.file_requires_approval/);
  assert.match(sar, /Typology rules[\s\S]*Not an LLM/);
  assert.equal(zoomMaps['sar-support'].coreEdges.some(edge => edge.from === 'evidence' && edge.to === 'model'), false);
});

test('Zoom scene draws every altitude on one canvas', () => {
  const steps = sample.architecture.process;
  for (const id of zoomCaseIds) {
    const scene = buildZoomScene(zoomMaps[id], steps);
    const byId = new Map(scene.nodes.map((node) => [node.id, node]));
    assert.equal(byId.size, scene.nodes.length, `${id} duplicate ids`);
    assert.equal(scene.nodes.filter((node) => node.depth === 0).length, steps.length, id);
    for (const edge of scene.edges) {
      assert.ok(byId.has(edge.from) && byId.has(edge.to), `${id} ${edge.from} → ${edge.to}`);
      assert.ok(edge.label.trim(), id);
    }
    for (let index = 1; index < steps.length; index += 1) {
      assert.ok(scene.edges.some((edge) => edge.depth === 0 && edge.from === `p${index - 1}` && edge.to === `p${index}`), id);
    }
    for (const node of scene.nodes) {
      if (node.depth === 0) continue;
      const parentId = node.depth === 1 ? node.id.split(':')[0] : node.id.split(':').slice(0, 2).join(':');
      const parent = byId.get(parentId);
      assert.ok(parent, `${id} ${parentId}`);
      assert.ok(node.x >= parent.x && node.y >= parent.y && node.x + node.w <= parent.x + parent.w + 0.5 && node.y + node.h <= parent.y + parent.h + 0.5, `${id} ${node.id} outside ${parentId}`);
    }
    const groups = new Map();
    for (const node of scene.nodes.filter((item) => item.depth === 2)) {
      const key = node.id.split(':').slice(0, 2).join(':');
      groups.set(key, [...(groups.get(key) ?? []), node]);
    }
    for (const [key, group] of groups) {
      for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        const overlaps = a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
        assert.equal(overlaps, false, `${id} ${key} ${a.id} overlaps ${b.id}`);
      }
    }
  }
  function parentOf(node) {
    if (node.depth <= 0) return 'root';
    if (node.depth === 1) return node.id.split(':')[0];
    return node.id.split(':').slice(0, 2).join(':');
  }
  function crosses(x1, y1, x2, y2, node) {
    if (Math.abs(y1 - y2) < 0.01) {
      const y = y1;
      if (y <= node.y || y >= node.y + node.h) return false;
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      return left < node.x + node.w && right > node.x;
    }
    const x = x1;
    if (x <= node.x || x >= node.x + node.w) return false;
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    return top < node.y + node.h && bottom > node.y;
  }
  for (const id of ['brahe-bank', 'fraud-modeling', 'company-briefing']) {
    const scene = buildZoomScene(zoomMaps[id], steps);
    const byId = new Map(scene.nodes.map((node) => [node.id, node]));
    for (const edge of scene.edges.filter((item) => item.from.startsWith('p0'))) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      const routed = routeSceneEdge(from, to);
      assert.ok(routed, `${id} ${edge.from} → ${edge.to} is not a shared side`);
      assert.match(routed.d, /^M-?\d+(\.\d+)?,-?\d+(\.\d+)? L-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, edge.label);
      const obstacles = scene.nodes.filter((node) => node.depth === edge.depth && parentOf(node) === parentOf(from) && node.id !== from.id && node.id !== to.id);
      const pts = [...routed.d.matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((match) => [Number(match[1]), Number(match[2])]);
      assert.equal(pts.length, 2, edge.label);
      for (const node of obstacles) {
        assert.equal(crosses(pts[0][0], pts[0][1], pts[1][0], pts[1][1], node), false, `${id} ${edge.from} → ${edge.to} crosses ${node.id}`);
      }
    }
  }
  function frameOf(node) {
    return { w: node.w * 1.2, h: node.h * 1.24 };
  }
  function lens(camera, vp = { w: 1100, h: 640 }) {
    return Math.min(vp.w / camera.w, vp.h / camera.h);
  }
  for (const id of zoomCaseIds) {
    const scene = buildZoomScene(zoomMaps[id], steps);
    const home = lens({ w: scene.width, h: scene.height });
    const step = scene.nodes.find((node) => node.id === 'p0');
    const cores = scene.nodes.filter((node) => node.depth === 1 && node.id.startsWith('p0:'));
    const stepScale = lens(frameOf(step));
    assert.ok(step.titleSize * home >= 16, `${id} process title ${step.titleSize * home}`);
    for (const core of cores) {
      assert.ok(core.titleSize * home <= 12, `${id} ${core.title} visible too early (${(core.titleSize * home).toFixed(1)}px)`);
      assert.ok(core.titleSize * stepScale >= 16, `${id} ${core.title} too small when zoomed (${(core.titleSize * stepScale).toFixed(1)}px)`);
      const inside = scene.nodes.filter((node) => node.depth === 2 && node.id.startsWith(`${core.id}:`));
      const coreScale = lens(frameOf(core));
      for (const node of inside) {
        assert.ok(node.titleSize * stepScale <= 12, `${id} ${node.title} shows inside ${core.title} too early`);
        assert.ok(node.titleSize * coreScale >= 11, `${id} ${node.title} too small inside ${core.title} (${(node.titleSize * coreScale).toFixed(1)}px)`);
      }
    }
  }
  const fraud = buildZoomScene(zoomMaps['fraud-modeling'], steps);
  assert.equal(fraud.edges.some((edge) => edge.depth === 1 && edge.from.endsWith(':graph') && edge.to.endsWith(':defense')), false);
  const brahe = buildZoomScene(zoomMaps['brahe-bank'], steps);
  assert.ok(brahe.nodes.some((node) => node.id === 'p0:workload:api'));
  assert.ok(brahe.edges.some((edge) => edge.from === 'p0:workload' && edge.to === 'p0:model'));
  assert.ok(brahe.nodes.find((node) => node.id === 'p0:workload:stub:defense')?.targetId === 'p0:defense');
});

test('Deep dive presentation keeps every node and edge without overlapping boxes',()=>{
 const sources=[bankingRuntime(),fraudRuntime(),briefingRuntime(),researchRuntime(),advisoryRuntime(),...Object.keys(profiles).flatMap(id=>[proposedRuntime(id),knowledgeDiagram(id),securityDiagram(id),deploymentDiagram(id)])];
 for(const source of sources){
  const frame=presentDiagram(source);
  assert.deepEqual(frame.nodes.map(node=>node.id).sort(),source.nodes.map(node=>node.id).sort(),source.title);
  assert.deepEqual(frame.edges.map(edge=>`${edge.from}>${edge.label}>${edge.to}`).sort(),source.edges.map(edge=>`${edge.from}>${edge.label}>${edge.to}`).sort(),source.title);
  assert.ok(frame.nodes.every(node=>node.x>=0&&node.y>=0&&node.x+240<=frame.width&&node.y+128<=frame.height),source.title);
  for(let i=0;i<frame.nodes.length;i++)for(let j=i+1;j<frame.nodes.length;j++){
   const a=frame.nodes[i],b=frame.nodes[j];
   const overlaps=a.x<b.x+240&&a.x+240>b.x&&a.y<b.y+128&&a.y+128>b.y;
   assert.equal(overlaps,false,`${source.title} ${a.id} overlaps ${b.id}`);
  }
 }
});
