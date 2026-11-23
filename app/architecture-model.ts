import { e, n, sources, type Diagram, type FrameMapping, type Profile } from "./map/legacy-diagram.ts";
import { vulnerabilityProfile } from "../demos/code-vulnerability/architecture/legacy-diagrams.ts";
import { braheProfile, bankingRuntime, bankingKnowledge, bankingProposedRuntime } from "../demos/brahe-bank/architecture/legacy-diagrams.ts";
import { kycProfile } from "../demos/kyc-processing/architecture/legacy-diagrams.ts";
import { sarProfile } from "../demos/sar-support/architecture/legacy-diagrams.ts";
import { advisoryProfile, advisoryCapability, advisoryRuntime, advisoryKnowledge } from "../demos/client-advisory/architecture/legacy-diagrams.ts";
import { researchProfile, researchCapability, researchRuntime, researchKnowledge } from "../demos/market-research/architecture/legacy-diagrams.ts";
import { transactionsProfile } from "../demos/transaction-llm/architecture/legacy-diagrams.ts";
import { fraudProfile, fraudCapability, fraudRuntime, fraudKnowledge } from "../demos/fraud-modeling/architecture/legacy-diagrams.ts";
import { briefingProfile, briefingCapability, briefingRuntime, briefingKnowledge } from "../demos/company-briefing/architecture/legacy-diagrams.ts";

export type { Boundary, Diagram, DiagramEdge, DiagramNode, FrameMapping, NodeKind } from "./map/legacy-diagram.ts";
export { sources };
export { advisoryKnowledge, advisoryRuntime, bankingKnowledge, bankingRuntime, briefingKnowledge, briefingRuntime, fraudKnowledge, fraudRuntime, researchKnowledge, researchRuntime };

const LANE_GAP = 330;
const ROW_STRIDE = 230;
const NODE_W = 240;
const NODE_H = 128;

/** Cluster authored nodes into horizontal lanes. Presentation only; the graph stays use-case-specific. */
export function diagramLanes(graph: Diagram) {
 const ys = [...new Set(graph.nodes.map(node => node.y))].sort((a, b) => a - b);
 const groups: number[][] = [];
 for (const y of ys) {
  const last = groups.at(-1);
  if (last && y - last[last.length - 1] <= 48) last.push(y);
  else groups.push([y]);
 }
 return groups.map(group => graph.nodes.filter(node => group.includes(node.y)).sort((a, b) => a.x - b.x));
}

/** Full deep-dive frame. Every node and edge stays; labels ride the gutter instead of the boxes. */
export function presentDiagram(graph: Diagram): Diagram {
 const lanes = diagramLanes(graph);
 const placed = new Map<string, { x: number; y: number; row: number; col: number }>();
 lanes.forEach((lane, row) => {
  lane.forEach((node, col) => placed.set(node.id, { x: 48 + col * LANE_GAP, y: 36 + row * ROW_STRIDE, row, col }));
 });
 const nodes = graph.nodes.map(node => ({ ...node, ...placed.get(node.id) }));
 const edges = graph.edges.map(edge => {
  const a = placed.get(edge.from)!;
  const b = placed.get(edge.to)!;
  if (a.row === b.row && Math.abs(a.col - b.col) === 1) {
   return { ...edge, via: undefined, labelAt: undefined, ports: undefined };
  }
  const gutterY = a.row === b.row ? a.y - 36 : a.row < b.row ? a.y + NODE_H + 40 : a.y - 40;
  const startX = a.x + NODE_W / 2;
  const endX = b.x + NODE_W / 2;
  return {
   ...edge,
   ports: a.row === b.row ? undefined : a.row < b.row ? 'down' as const : 'up' as const,
   via: [[startX, gutterY], [endX, gutterY]] as [number, number][],
   labelAt: [(startX + endX) / 2, gutterY] as [number, number],
  };
 });
 const width = Math.max(960, ...lanes.map(lane => 96 + Math.max(0, lane.length - 1) * LANE_GAP + NODE_W));
 const height = Math.max(220, 36 + Math.max(1, lanes.length) * ROW_STRIDE + 24);
 return { ...graph, width, height, nodes, edges, boundaries: undefined };
}

export function capabilityDiagram(frame:FrameMapping,step=0,caseId?:string):Diagram {
 const process=frame.architecture.process;
 step=Math.max(0,Math.min(process.length-1,step));
 if(caseId==='fraud-modeling') return fraudCapability(frame,step);
 if(caseId==='company-briefing') return briefingCapability(frame,step);
 if(caseId==='market-research') return researchCapability(frame,step);
 if(caseId==='client-advisory') return advisoryCapability(frame,step);
 const active=Math.min(step,Math.max(0,frame.architecture.ai.length-1));
 const ai=frame.architecture.ai[active]??{label:'AI insertion',point:'',detail:'AI insertion'};
 return {title:'Business transformation',note:caseId==='brahe-bank'?'AI Defense inspects model-bound prompts and answers on the live Brahe path. Splunk export is optional; UCS + Nexus placement is proposed.':'Select a step or connection to isolate its supporting relationships. Cisco capabilities below are proposed, not measured results.',width:1460,height:790,
 nodes:[...process.map((p,i)=>n('p'+i,p.title,p.detail,30+i*365,50,'human')),
 n('ai',ai.label,'AI insertion · '+ai.point,605,320,'ai',ai.detail),
 n('defense','Cisco AI Defense','Inspect model-bound content',200,625,'cisco','Proposed application integration: inspect assembled prompts and generated answers; application enforces the verdict. Not a substitute for source-system authorization.',sources.defense.url),
 n('observe','Splunk observability','Trace AI and tool execution',605,625,'cisco','Proposed instrumentation exports correlated model, agent and retrieval spans. Quality evaluation requires separately configured evaluators.',sources.splunk.url),
 n('compute','Cisco UCS + Nexus','Host and connect AI services',1010,625,'cisco','Proposed CPU services and GPU inference have explicit placement in Deployment. GPU need depends on model size, workload and latency, not the use-case label.',sources.cisco.url)],
 edges:[...process.slice(0,-1).map((_,i)=>e('p'+i,'p'+(i+1),'next step')),
 e('p'+step,'ai',step===3?'review AI output':'assisted by',{ports:'down'}),
 e('ai','defense','inspect model input / output',{ports:'down',kind:'control',labelAt:[370,520]}),e('ai','observe','export execution spans',{ports:'down',kind:'telemetry',labelAt:[725,550]}),e('ai','compute','host model / connect services',{ports:'down',kind:'placement',labelAt:[1140,520]})]};
}

export const profiles: Record<string, Profile> = {
  "code-vulnerability": vulnerabilityProfile,
  "brahe-bank": braheProfile,
  "kyc-processing": kycProfile,
  "sar-support": sarProfile,
  "client-advisory": advisoryProfile,
  "market-research": researchProfile,
  "transaction-llm": transactionsProfile,
  "fraud-modeling": fraudProfile,
  "company-briefing": briefingProfile,
};
export function proposedRuntime(id:string):Diagram {
 if(id==='brahe-bank') return bankingProposedRuntime();
 const p=profiles[id]; const fraud=id==='fraud-modeling', sequential=['sar-support','market-research','transaction-llm','company-briefing'].includes(id);
 return {title:p.router+' · proposed execution',note:p.note,width:1460,height:850,
 nodes:[n('entry',p.entry,'Authenticated / validated input',30,60,'human'),n('router',p.router,fraud?'Synchronous bounded request':'Application-owned orchestration',440,60,'service','Proposed service with identity propagation, request budget and correlated trace ID. No durable queue is assumed.'),n('result',p.result,['client-advisory','sar-support','market-research','company-briefing'].includes(id)?'LLM draft → citation checks':'Schema / rule checks + provenance',1170,60,['client-advisory','sar-support','market-research','company-briefing'].includes(id)?'ai':'service',p.note+' Model calls use the boundary shown in Security & telemetry; CPU/GPU placement is shown in Deployment.'),
 n('left',p.left,p.leftDetail,380,330,p.left.toLowerCase().includes('retriev')?'service':'ai'),n('right',p.right,p.rightDetail,820,330,p.right.toLowerCase().includes('agent')?'ai':'service'),n('store',p.store,'Entitlement-filtered read',30,620,'store','Source-system authorization is checked before context assembly. Store records carry version, freshness and source IDs.'),n('tool',p.tool,'Scoped tool credentials',610,620,'service'),n('gate',p.gate,'Human authority remains explicit',1170,620,'human'),n('fail',p.failure,'Stop / route exception',1170,330,'failure')],
 edges:[e('entry','router','request + scope'),e('router','left',fraud?'features + deadline':'delegate task',{ports:'down'}),e('left','store','query ↔ evidence',{ports:'down'}),e('right','tool','call ↔ facts',{ports:'down'}),
 ...(sequential?[e('left','right','evidence → next task')]:[e('router','right',fraud?'score events · async':'delegate parallel task',{ports:'down',kind:fraud?'telemetry':'data',labelAt:[930,260]})]),
 e(fraud?'left':'right','result',fraud?'score → rules':'validated output',{ports:'up',via:fraud?[[500,270],[1110,270],[1110,115]]:[[940,245],[1110,245],[1110,115]],labelAt:[1070,220]}),
 ...(!sequential&&!fraud?[e('left','right','evidence for synthesis')]:[]),
 e('result','gate',fraud?'change proposal only':'review / approve',{ports:'down',via:[[1450,115],[1450,675]],labelAt:[1330,550]}),e('right','fail','failed validation',{kind:'control'}),
 ...(fraud?[e('right','gate','propose rollback',{ports:'down',kind:'control',labelAt:[1030,555]})]:[])]};
}

export function knowledgeDiagram(id:string):Diagram {
 const p=profiles[id],fraud=id==='fraud-modeling',briefing=id==='company-briefing',research=id==='market-research',advisory=id==='client-advisory', structured=['fraud-modeling','transaction-llm','company-briefing','market-research','client-advisory'].includes(id);
 return {title:briefing?'Filing map and structured facts':research?'Snapshot cache and FRED series':advisory?'Entitled context and live holdings':structured?'Reference / feature preparation':'Knowledge preparation and retrieval',note:briefing?'Proposed preparation still has no vector index. Node files remain a filing map; metrics stay in companyfacts or verbatim tables.':research?'No vector index and no Tavily. Cache is write-through Yahoo/FRED, not a committed snapshot pack. This map does not assert live Yahoo or FRED availability.':advisory?'No household CRM catalog and no vector index. Holdings are presenter-entered; briefing excerpts come from the accepted studio profile.':structured?'Structured records remain structured. No blanket “embed everything” step.':'Proposed pipeline. Source access controls, freshness and evidence lineage remain application responsibilities.',width:1460,height:750,
 nodes:[n('source',p.ingest,'Approved source / schema owner',30,70,'store'),n('prepare',briefing?'Build TOC + titled nodes':structured?'Validate + transform':'Parse + chunk documents','Preserve version + provenance',430,70,'service'),n('index',briefing?'Write node files':structured?'Keyed upsert':'Embedding model','CPU pipeline / GPU where justified',835,70,structured?'service':'ai',briefing?'One file per Item / heading. Not embeddings.':'Embedding is a model call for searchable document chunks, not a replacement for structured database queries.',briefing?undefined:sources.rag.url),n('store',p.store,briefing?'Filing map · not a vector index':structured?'Versioned structured store':'Vector + lexical index; ACL metadata',1170,350,'store'),n('retrieve',fraud?'Feature lookup':briefing?'list_filing_toc / read_filing_node':'Authorized retrieval','Scope + freshness filter',770,350,'service'),n('context',fraud?'Scoring feature vector':briefing?'Bounded node + XBRL facts':'Context assembly','Source IDs + token / schema budget',370,350,'service'),n('consumer',p.left,'Online consumer',30,350,'ai'),n('reject','Reject or hold source','Invalid / stale / unauthorized',430,620,'failure')],
 edges:[e('source','prepare','records + access metadata'),e('prepare','index',briefing?'titled nodes':structured?'validated rows':'chunks + source IDs'),e('index','store',briefing?'node files + citations':structured?'upsert keyed records':'vectors + metadata',{ports:'down'}),e('store','retrieve',briefing?'filing map':structured?'versioned features':'top-k permitted evidence',{ports:'left'}),e('retrieve','context',fraud?'typed features':briefing?'cited node + XBRL':'ranked evidence',{ports:'left'}),e('context','consumer','bounded input',{ports:'left'}),e('prepare','reject','invalid schema / content',{ports:'down',via:[[550,250],[700,250],[700,580],[550,580]],labelAt:[610,570],kind:'control'}),e('retrieve','reject','deny / stale evidence',{ports:'down',kind:'control',labelAt:[850,550]})]};
}

export function securityDiagram(id:string):Diagram {
 const p=profiles[id];
 return {title:'Model boundary protection and telemetry · proposed',note:'Chosen pattern: application calls the AI Defense Inspection API and enforces its verdict. This is not an installed gateway. Business authorization remains outside the model.',width:1460,height:1110,
 boundaries:[{title:'APPLICATION TRUST BOUNDARY · scoped tools, context and enforcement',x:10,y:20,width:1050,height:750},{title:'CISCO SERVICES · permitted data egress required',x:1090,y:20,width:350,height:1070}],
 nodes:[n('context','Assembled model input',p.left+' + tool facts',40,90,'service','Check source permissions before including sensitive records. Include system instructions, permitted evidence and tool schemas.'),n('input','Input policy check','App calls Inspection API',420,90,'cisco','Application inspects the model-bound payload with the configured policy; violation or inspection unavailability stops this proposed path.',sources.defense.url),n('defense','Cisco AI Defense','Policy-based inspection endpoint',1140,90,'cisco','Policy checks can generate events. Checking standalone rules does not necessarily generate an event; do not assume an event ID always exists.',sources.defense.url),
 n('model','Model endpoint','Only after allow verdict',420,360,'ai','NIM on UCS in proposed private deployment. For hosted inference, explicit external-provider egress replaces this placement.'),n('output','Output policy check','Inspect generated response',800,360,'cisco','Application buffers the answer until an allow verdict. Inspection does not prove factual correctness or regulatory compliance.'),n('release','Validate and release','Schema / evidence / human gate',800,650,'human','Validate tool arguments against allowlists and user scope before tool execution. Validate sources and response schema before release.'),n('stop','Block / service unavailable','No model call or answer release',40,650,'failure','Fail-closed is a proposed application choice. Return a safe message; record the reason without leaking raw sensitive payloads.'),
 n('spans','Instrumented application','Agent · tools · model spans',420,900,'service','Use one trace context across calls. Attach permitted policy result metadata; redact sensitive prompt content. Evaluator scores require separate evaluation jobs.'),n('collector','Splunk OTel Collector','OTLP receive → redact → export',800,900,'cisco','Proposed collection pipeline requires tested receiver, processor and exporter configuration.',sources.splunk.url),n('splunk','Splunk AI observability','Traces + configured metrics',1140,900,'cisco','Correlate application spans with policy metadata explicitly. Do not assume every security event is automatically joined to a trace.',sources.splunk.url)],
 edges:[e('context','input','scoped prompt'),e('input','defense','HTTPS inspect ↔ verdict'),e('input','model','allow',{ports:'down',kind:'control'}),e('model','output','generated content'),e('output','defense','HTTPS inspect ↔ verdict',{ports:'up',via:[[920,290],[1090,290],[1090,200],[1260,200]],labelAt:[1170,260]}),e('output','release','allow + business checks',{ports:'down',kind:'control'}),e('input','stop','deny / timeout',{ports:'left',via:[[335,145],[335,705]],labelAt:[230,520],kind:'control'}),e('output','stop','deny / timeout',{ports:'down',via:[[920,545],[160,545]],labelAt:[570,540],kind:'control'}),e('model','spans','duration / tokens / status',{ports:'down',labelAt:[530,805],kind:'telemetry'}),e('release','spans','result / review spans',{ports:'down',kind:'telemetry',labelAt:[860,820]}),e('spans','collector','OTLP · trace context',{kind:'telemetry'}),e('collector','splunk','configured exporter',{kind:'telemetry'})]};
}

export function deploymentDiagram(id:string):Diagram {
 const p=profiles[id];
 return {title:'Workload placement · proposed private inference',note:'Single-node inference is the baseline assumption, not a sized bill of materials. No distributed training fabric is assumed. Validate model fit, concurrency, latency, HA and platform compatibility before deployment.',width:1460,height:900,
 boundaries:[{title:'APPLICATION / CPU NODE POOL · proposed Kubernetes',x:20,y:260,width:700,height:220},{title:'GPU NODE POOL · Cisco UCS with supported NVIDIA GPUs',x:780,y:260,width:650,height:220},{title:'PERSISTENT DATA SERVICES · storage vendor / sizing TBD',x:20,y:620,width:700,height:220},{title:'PLATFORM OPERATIONS · independent management path',x:780,y:620,width:650,height:220}],
 nodes:[n('ingress','Application ingress','TLS + identity propagation',60,70,'service'),n('nexus','Cisco Nexus fabric','Service / storage IP connectivity',830,70,'cisco','Carry ingress, retrieval and model API traffic. Link speed, topology, segmentation and HA are design decisions pending throughput and availability requirements.',sources.cisco.url),
 n('cpu',p.router,'API / agent / tool services · CPU',60,325,'service','CPU services orchestrate requests, enforce authorization and issue model API calls. These processes do not require a GPU simply because they use AI.'),n('retriever','Retrieval / context service','Queries + policy filters · CPU',430,325,'service'),n('nim','Model-serving workload','NIM / compatible runtime',830,325,'ai',p.gpu+'. GPU inference is conditional on chosen model and performance validation.',sources.rag.url),n('ucs','Cisco UCS GPU host','Model weights + inference compute',1170,325,'cisco','Hosts the model-serving container via GPU device scheduling. Choose a supported UCS/GPU configuration; verify memory capacity and availability.',sources.cisco.url),
 n('data',p.store,'Encrypted persistent data',60,685,'store'),n('checkpoint','Persistent workflow state','DB + backup / retention policy',430,685,'store','Proposed durable replacement for process memory. Not the current Brahe InMemorySaver.'),n('platform','Cluster + GPU operators','Schedule model containers',830,685,'service','Kubernetes distribution, GPU Operator and model-serving lifecycle tooling require a supported compatibility matrix.'),n('manage','Cisco Intersight','Server lifecycle / inventory',1170,685,'cisco','Management plane, not part of inference data flow. Network operations and observability are configured separately.')],
 edges:[e('ingress','nexus','TLS / application traffic'),e('nexus','cpu','routed service traffic',{ports:'down',via:[[950,235],[180,235]],labelAt:[570,230]}),e('cpu','retriever','query ↔ evidence'),e('retriever','nim','embedding / rerank API'),e('cpu','nim','generation API via Nexus',{ports:'up',via:[[180,250],[950,250]],labelAt:[650,250]}),e('nim','ucs','scheduled on',{kind:'placement'}),e('retriever','data','scoped reads',{ports:'down',labelAt:[245,560]}),e('cpu','checkpoint','checkpoint read / write',{ports:'down',labelAt:[590,545]}),e('platform','nim','deploy / scale',{ports:'up',kind:'placement'}),e('manage','ucs','inventory / lifecycle',{ports:'up',kind:'control'})]};
}
