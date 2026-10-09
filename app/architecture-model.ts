/**
 * Architecture contract: edges are first-class facts, not decoration. A shared
 * renderer must NEVER force different use cases into the same execution graph.
 * Frontend/backend implementations may evolve; retain the studio visual tokens,
 * readable canvas, explicit status, source provenance and workload boundaries.
 * Proposed designs are design decisions, not claims of installed integrations.
 */
export type NodeKind = 'service' | 'ai' | 'store' | 'human' | 'cisco' | 'failure';
export type DiagramNode = { id: string; title: string; subtitle: string; detail: string; x: number; y: number; kind?: NodeKind; source?: string };
export type DiagramEdge = { from: string; to: string; label: string; kind?: 'data' | 'control' | 'telemetry' | 'placement'; ports?: 'down' | 'up' | 'left'; via?: [number, number][]; labelAt?: [number, number] };
export type Boundary = { title: string; x: number; y: number; width: number; height: number };
export type Diagram = { title: string; note: string; width: number; height: number; nodes: DiagramNode[]; edges: DiagramEdge[]; boundaries?: Boundary[] };
export type FrameMapping = { transformation: { friction: string; aiShift: string; humanControl: string }; architecture: { process: {title:string;detail:string}[]; ai:{point:string;label:string;detail:string}[] } };
export const sources = {
  defense: { title: 'Cisco AI Defense Inspection API', url: 'https://developer.cisco.com/docs/ai-defense-inspection/getting-started/' },
  splunk: { title: 'Splunk AI Agent Monitoring', url: 'https://help.splunk.com/en/splunk-observability-cloud/observability-for-ai/splunk-ai-agent-monitoring' },
  rag: { title: 'NVIDIA Enterprise RAG', url: 'https://docs.nvidia.com/enterprise-reference-architectures/enterprise-rag-deployment-guide/latest/introduction.html' },
  cisco: { title: 'Cisco AI POD deployment', url: 'https://www.cisco.com/c/en/us/td/docs/unified_computing/ucs/UCS_CVDs/cisco_ai_pod_for_training_design.html' },
  graph: { title: 'LangGraph persistence', url: 'https://docs.langchain.com/oss/python/langgraph/persistence' },
  fraud: { title: 'NVIDIA Financial Fraud Training', url: 'https://docs.nvidia.com/nim/financial-fraud-training/3.0.0/overview/overview.html' },
  edgar: { title: 'SEC EDGAR developer APIs', url: 'https://www.sec.gov/os/webmaster-faq#developers' },
  deepagents: { title: 'LangChain Deep Agents', url: 'https://docs.langchain.com/oss/python/deepagents/overview' },
};
const n = (id:string,title:string,subtitle:string,x:number,y:number,kind:NodeKind='service',detail=subtitle,source?:string):DiagramNode => ({id,title,subtitle,x,y,kind,detail,source});
const e = (from:string,to:string,label:string,options:Partial<DiagramEdge>={}):DiagramEdge => ({from,to,label,...options});

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

function fraudCapability(frame:FrameMapping,step:number):Diagram {
 const process=frame.architecture.process;
 const score=frame.architecture.ai[0]??{detail:'GraphSAGE embeds the point-in-time neighborhood, XGBoost returns a probability, and exact XGBoost TreeSHAP attributes it in log-odds.'};
 const narrative=frame.architecture.ai[1]??{detail:'A Deep Agent on the Studio model chain calls the scoring and evidence tools and drafts a cited summary. Scripted (no model) when no model is reachable.'};
 const xs=[56,436,816,1196];
 const stepFocus=step!==1?[e('p'+step,'ai',step===0?'case features':step===3?'review score':'review evidence',{ports:'down',via:step===2?[[936,220],[556,220]]:step===3?[[1316,214],[556,214]]:undefined,labelAt:step===0?[246,236]:step===2?[746,212]:[990,206]})]:[];
 return {title:'Card fraud triage · capability',note:'The live score path is GraphSAGE + XGBoost + exact TreeSHAP and never calls an LLM or AI Defense. The triage agent works on top of the score: AI Defense inspects the untrusted dispute note, the agent prompt and summary, and case notes; Agent Control gates card actions.',width:1520,height:800,
 boundaries:[
  {title:'Business process',x:28,y:16,width:1464,height:220},
  {title:'Live score path · no AI Defense',x:408,y:252,width:296,height:220},
  {title:'Triage agent · AI Defense on untrusted text · Agent Control on actions',x:408,y:488,width:1084,height:220},
 ],
 nodes:[
  ...process.map((p,i)=>n('p'+i,p.title,p.detail,xs[i]??56+i*380,56,'human')),
  n('observe','Splunk Agent Observability','Triage agent trace',56,300,'cisco','The triage agent trace with score, neighborhood, explain, and playbook tool spans. Scoring itself needs no dashboard.',sources.splunk.url),
  n('ai','GraphSAGE + XGBoost + TreeSHAP','AI insertion · score path',436,300,'ai',score.detail,sources.fraud.url),
  n('compute','Cisco UCS + Nexus','Proposed GPU host',816,300,'cisco','Proposed placement for the GraphSAGE + XGBoost sidecar. The local demo scores via HTTP /score in the NVIDIA training image on Sparky (DGX Spark), not on UCS.',sources.cisco.url),
  n('narrative','Fraud triage agent','Deep Agent · Studio model chain',436,536,'ai',narrative.detail),
  n('defense','Cisco AI Defense','Untrusted text and agent summary',816,536,'cisco','Inspects the cardholder dispute note, the agent prompt before a hosted model, the agent summary, and analyst case notes. A blocked dispute note is withheld from the agent. The score path is not sent to the Inspection API.',sources.defense.url),
  n('omit','Withheld or scripted','Score still released',1196,536,'failure','A blocked note never reaches the model; no reachable model means a scripted summary, labelled as such. The probability and evidence remain.'),
 ],
 edges:[
  ...process.slice(0,-1).map((_,i)=>e('p'+i,'p'+(i+1),'next step')),
  ...(process[1]?[e('p1','ai','assisted by',{ports:'down',labelAt:[556,248]})]:[]),
  ...stepFocus,
  ...(process[2]?[e('ai','p2','score path · no Defense',{ports:'up',via:[[700,268],[936,268]],labelAt:[818,260]})]:[]),
  e('ai','observe','tool spans',{kind:'telemetry',labelAt:[346,364]}),
  e('ai','compute','host GPU sidecar',{kind:'placement',labelAt:[726,364]}),
  e('ai','narrative','score · reasons as tools',{ports:'down',labelAt:[556,466]}),
  e('narrative','defense','inspect prompt / summary',{kind:'control',labelAt:[726,600]}),
  e('defense','omit','deny / unavailable',{kind:'control',labelAt:[1106,600]}),
  e('narrative','omit','model unavailable',{ports:'down',kind:'control',via:[[556,680],[1316,680],[1316,600]],labelAt:[900,680]}),
 ]};
}

function briefingCapability(frame:FrameMapping,step:number):Diagram {
 const process=frame.architecture.process;
 const extract=frame.architecture.ai[0]??{detail:'The Deep Agent supervisor plans and delegates. It does not read filing nodes. Theme subagents call read_filing_node.'};
 const assemble=frame.architecture.ai[2]??{detail:'Supervisor assembles from theme notes and XBRL tool output. FastAPI then runs the cite-or-abstain verifier.'};
 const xs=[56,436,816,1196];
 const focus=step===0?'ingest':step===1?'nav':step===2?'supervisor':'gate';
 return {title:'Company briefing · capability',note:'Live path is navigation-first: EDGAR or upload, TOC + companyfacts, Deep Agent supervisor, theme subagents, grounding, accept-gate. Cisco AI Defense inspects model hops only. XBRL, EDGAR, upload, navigator, and grounding stay off Inspection. No vector index and no open web. This map does not assert live SEC or OpenAI availability.',width:1520,height:940,
 boundaries:[
  {title:'Business process',x:28,y:16,width:1464,height:220},
  {title:'Deterministic ingest / navigator / XBRL / grounding · no Inspection',x:28,y:252,width:1464,height:220},
  {title:'Deep Agent model hops · AI Defense on every hop',x:28,y:488,width:1464,height:220},
  {title:'Optional telemetry · proposed placement',x:28,y:724,width:1464,height:192},
 ],
 nodes:[
  ...process.map((p,i)=>n('p'+i,p.title,p.detail,xs[i]??56+i*380,56,'human')),
  n('ingest','EDGAR or upload','Ingest · no Inspection',56,300,'service','Path A resolves a US-listed issuer and fetches the latest 10-K / 20-F / 40-F. Path B stages the uploaded PDF / HTML / TXT. File wins over EDGAR. No IR scrape and no open web.',sources.edgar.url),
  n('nav','TOC navigator','Filing map · not embeddings',436,300,'service','Item 1 / 1A / 1C / 7 / 8 titled sub-nodes. grep is discovery only. Supervisor never reads node bodies.'),
  n('xbrl','companyfacts XBRL','FY metrics · no LLM math',816,300,'service','Allowlisted concepts for that 10-K fiscal year. Upload without CIK is verbatim-table or absent.',sources.edgar.url),
  n('grounding','Grounding verifier','Cite-or-abstain · not an LLM',1196,300,'service','Excerpt must be a substring of the node file. Ungrounded-only themes become abstains. Off Inspection.'),
  n('deny','Fail closed','No briefing released',56,536,'failure','Unknown/ambiguous issuer, no annual report, empty PDF, inspection deny, ungrounded-only themes, or model/tool error.'),
  n('supervisor','Deep Agent supervisor','Plan · delegate · assemble',436,536,'ai',extract.detail,sources.deepagents.url),
  n('subagents','Theme subagents','read_filing_node · five themes',816,536,'ai',assemble.detail),
  n('defense','Cisco AI Defense','Every model hop',1196,536,'cisco','Inspects plan, delegate, extract, and assemble. Filing bytes never enter the Inspection API. Deny or unavailability fail closed.',sources.defense.url),
  n('observe','Splunk observability','Optional agent / tool spans',436,772,'cisco','Configuration only. A briefing does not require a dashboard.',sources.splunk.url),
  n('compute','Cisco UCS + Nexus','Proposed model host',816,772,'cisco','Proposed private placement. The local demo routes through the Studio model chain (Sparky vLLM on an NVIDIA DGX Spark dev box, else the OpenAI API); this map does not assert either endpoint is up.',sources.cisco.url),
  n('gate','Presenter accept-gate','Use this company',1196,772,'human','Studio context is stored only after this click. Refresh does not skip the gate.'),
 ],
 edges:[
  ...process.slice(0,-1).map((_,i)=>e('p'+i,'p'+(i+1),'next step')),
  e('p'+Math.min(step,Math.max(process.length-1,0)),focus,step===0?'identify / ingest':step===1?'navigate filing':step===2?'extract themes':'review briefing',{ports:'down',labelAt:step===0?[176,248]:step===1?[556,248]:step===2?[746,248]:[1316,248]}),
  e('ingest','nav','build TOC',{labelAt:[346,364]}),
  e('ingest','xbrl','CIK · companyfacts',{via:[[176,428],[936,428]],labelAt:[556,420]}),
  e('nav','subagents','read_filing_node',{ports:'down',labelAt:[556,466]}),
  e('xbrl','subagents','FY facts',{ports:'down',labelAt:[936,466]}),
  e('nav','grounding','node files',{via:[[556,400],[1316,400]],labelAt:[930,392]}),
  e('xbrl','grounding','metric check',{labelAt:[1106,364]}),
  e('supervisor','subagents','task / write_todos',{labelAt:[726,600]}),
  e('supervisor','defense','inspect plan / assemble',{kind:'control',via:[[556,512],[1316,512]],labelAt:[930,504]}),
  e('subagents','defense','inspect extract',{kind:'control',labelAt:[1106,600]}),
  e('defense','deny','deny / unavailable',{kind:'control',via:[[1316,664],[176,664],[176,600]],labelAt:[746,656]}),
  e('supervisor','deny','model / tool error',{kind:'control',labelAt:[346,600]}),
  e('subagents','grounding','theme notes',{ports:'up',via:[[936,480],[1316,480]],labelAt:[1126,472]}),
  e('grounding','gate','cited briefing',{ports:'down',via:[[1316,466],[1436,466],[1436,836]],labelAt:[1400,650]}),
  e('grounding','deny','ungrounded-only themes',{kind:'control',via:[[1316,248],[176,248],[176,536]],labelAt:[210,248]}),
  e('ingest','deny','issuer / 10-K / empty PDF',{kind:'control',labelAt:[176,466]}),
  e('supervisor','observe','optional spans',{kind:'telemetry',ports:'down',labelAt:[556,702]}),
  e('supervisor','compute','proposed host',{kind:'placement',via:[[556,740],[936,740]],labelAt:[746,732]}),
  ...(process[3]?[e('gate','p3','after accept',{ports:'up',via:[[1316,748],[1436,748],[1436,184]],labelAt:[1400,200]})]:[]),
 ]};
}

export function bankingRuntime():Diagram {
 const graph: Diagram = {title:'Brahe Bank · implemented request path',note:'Code-verified layered path: AI Defense inspects the request first; the hosted scope control gates graph entry; after LangGraph execution, AI Defense inspects the final model boundary before hosted quality controls check evidence and no-approval claims. Control verdicts are recorded in the root request trace; they are checks, not quality guarantees.',width:1460,height:1350,
 boundaries:[{title:'LOCAL PYTHON SERVICE · FastAPI + in-process LangGraph',x:350,y:20,width:1080,height:1020},{title:'EXTERNAL SERVICES · model, controls and telemetry',x:350,y:1080,width:1080,height:220}],
 nodes:[n('user','Customer / studio','Question + optional session ID',35,60,'human'),n('api','FastAPI /chat','Validate · session lock · 100s timeout',390,60,'service','POST /api/banking/chat validates the request, creates the root trace and invokes the layered path. Rejected requests return a safe error and reset the session checkpoint.'),
 n('defense','Cisco AI Defense','Request inspection',390,230,'cisco','First boundary: inspect the incoming question before it enters the checkpoint or graph. Enforce mode is fail-closed.',sources.defense.url),
 n('scope-judge','Application LLM judge','Banking scope · pre gate',700,230,'ai','Hosted judge returns in_scope for brahe-bank-banking-scope-v1. This is an application control, not a Galileo evaluator.'),
 n('scope-control','Agent Control SDK gate','Step brahe-banking-scope',1010,230,'cisco','Local gate sends that boolean to hosted Agent Control and applies allow/block. A verdict is recorded, not a claim of perfect detection.'),
 n('supervisor','Bank supervisor','Route → collect → explain',700,430,'ai','LangGraph supervisor routes to specialists. Eligibility instructions require both specialist agents; there is no deterministic approval engine.'),
 n('cards','Card information agent','ReAct model / tool loop',390,430,'ai','Delegated product question invokes retrieval; evidence returns to this specialist before handoff back to the supervisor.'),n('score','Credit score agent','ReAct model / tool loop',1010,430,'ai','Delegated score question invokes a deterministic mock-score tool; specialist output returns through handoff-back.'),
 n('docs','Product retrieval tool','Local Markdown OR Pinecone',390,620,'store','Without Pinecone, lexical search reads local product Markdown. Configured Pinecone queries an existing top-k 1–8 index; /chat does not populate it.'),n('mock','Mock credit score tool','Returns fictional score 550',1010,620,'service','Not a credit bureau connection. No customer underwriting, payment or application is executed.'),
 n('final-defense','Cisco AI Defense','Final model-bound inspection',390,800,'cisco','ProtectedChatOpenAI inspects complete model output and tool arguments before the answer proceeds. This remains separate from quality controls.',sources.defense.url),
 n('quality-judge','Application LLM judge','Evidence + no approval claims',700,800,'ai','Hosted gpt-5.6-luna judge checks source grounding and prohibited approval claims after execution; it does not guarantee factual correctness.'),
 n('quality-control','Agent Control SDK gate','Grounding and no-approval',1010,800,'cisco','Local gate enforces brahe-bank-evidence-grounding-v1 and brahe-bank-no-approval-claims-v1 on step brahe-answer-quality. Verdict metadata is bridged into the root trace.'),
 n('release','Validate and release','Answer + sources + control results',700,1000,'human','Release only after the final AI Defense and quality-control checks. The API returns allow/block/unavailable metadata without raw inspected content.'),
 n('output','Answer + sources','Customer reviews explanation',35,1000,'human','This is an illustrative assistant response, not a formal credit decision.'),
 n('state','InMemorySaver','thread_id → message checkpoints',1145,60,'store','Conversation checkpoints reside in process memory and are lost on restart. Unsafe/rejected requests are reset by the API.',sources.graph.url),
n('model','Studio model chain','Sparky vLLM → OpenAI API',390,1120,'ai','Agent generation uses the first healthy backend in the Studio model chain (Sparky vLLM on an NVIDIA DGX Spark dev box, else the hosted OpenAI API) through ProtectedChatOpenAI boundaries; no NVIDIA NIM or Cisco UCS GPU is in the running path.'),n('galileo','Splunk Agent Observability','Galileo SDK + control spans',700,1120,'service','Galileo 2.6+ callbacks collect execution telemetry; the Agent Control 8.5 bridge records control metadata in the root request trace. Upload failure does not reject a successful answer.',sources.splunk.url),n('splunk','Splunk OTLP export','Optional OTLP trace + metrics',1010,1120,'service','A separate OTLP exporter sends agent, workflow, model and tool spans only when configured. It is observability delivery, not Agent Control enforcement.',sources.splunk.url),n('agent-control-api','Hosted Agent Control service','Server-side JSON controls',1170,1080,'cisco','Hosted control service evaluates the application judge booleans and returns allow/block metadata. It does not replace AI Defense or guarantee factual quality.'),
 n('errors','Safe API error','No successful answer returned',35,430,'failure','AI Defense or Agent Control denial/unavailability, graph failure, timeout, concurrency, expired session and capacity errors return redacted metadata; rejected requests reset the session.')],
 edges:[e('user','api','POST message'),e('defense','scope-judge','allow → scope judge',{kind:'control'}),e('scope-judge','scope-control','judge result → SDK gate',{kind:'control'}),e('scope-control','agent-control-api','remote scope control request',{via:[[1130,295],[1290,295],[1290,520]],kind:'control'}),e('agent-control-api','scope-control','scope allow / block',{via:[[1410,520],[1410,190],[1130,190],[1130,230]],kind:'control'}),e('scope-control','supervisor','allow graph entry',{ports:'down',kind:'control'}),e('supervisor','state','read / write state'),e('supervisor','cards','product handoff ↔ facts',{ports:'left',kind:'data'}),e('supervisor','score','score handoff ↔ result',{kind:'data'}),e('cards','docs','search ↔ source excerpts',{ports:'down'}),e('score','mock','tool call ↔ 550',{ports:'down'}),
 e('supervisor','final-defense','model/tool output',{ports:'down',kind:'control'}),e('final-defense','quality-judge','allow → quality judge',{kind:'control'}),e('quality-judge','quality-control','judge result → SDK gate',{kind:'control'}),e('quality-control','agent-control-api','remote quality controls',{via:[[1130,865],[1320,865],[1320,650]],kind:'control'}),e('agent-control-api','quality-control','quality allow / block',{via:[[1430,650],[1430,730],[1130,730],[1130,800]],kind:'control'}),e('quality-control','release','allow → release',{ports:'down',kind:'control'}),e('release','output','answer + evidence',{ports:'left'}),
 e('defense','errors','deny / unavailable',{ports:'left',via:[[350,315],[300,315],[300,430],[275,430]],kind:'control'}),e('scope-control','errors','scope block / unavailable',{ports:'up',via:[[1130,230],[1300,230],[1300,390],[275,390],[275,430]],kind:'control'}),e('final-defense','errors','deny / unavailable',{ports:'left',via:[[350,865],[300,865],[300,450],[275,450]],kind:'control'}),e('quality-control','errors','quality block / unavailable',{ports:'up',via:[[1130,800],[1350,800],[1350,410],[275,410],[275,430]],kind:'control'}),
 e('api','defense','precheck full context · inspect request first',{ports:'down',via:[[510,145],[610,145],[610,230]],kind:'control'}),e('defense','model','allow → model call',{ports:'down',via:[[510,315],[510,1080]],labelAt:[545,700],kind:'control'}),e('model','defense','output / tool args ↔ verdict',{ports:'up',via:[[510,1120],[510,315]],labelAt:[570,1060],kind:'control'}),
 e('defense','model','allow → protected model call',{ports:'down',via:[[510,315],[510,1080]],labelAt:[545,700],kind:'control'}),e('model','defense','output / tool args ↔ verdict',{ports:'up',via:[[510,1120],[510,315]],labelAt:[570,1060],kind:'control'}),e('supervisor','model','specialist / supervisor model calls',{ports:'down',via:[[820,560],[820,1060],[630,1060],[630,1120]],kind:'placement'}),e('api','galileo','callbacks + control bridge',{ports:'down',via:[[560,145],[740,145],[740,1110]],labelAt:[720,180],kind:'telemetry'}),e('api','splunk','optional OTLP spans',{ports:'down',via:[[580,145],[1050,145],[1050,1110]],labelAt:[900,180],kind:'telemetry'}),e('release','galileo','control verdicts in root trace',{ports:'down',kind:'telemetry'}),e('release','splunk','result / review spans',{ports:'down',kind:'telemetry'})]};
 graph.edges = graph.edges.map(edge => edge.from === 'scope-control' && edge.to === 'agent-control-api' ? {...edge, via:[[1130,295],[1290,295],[1290,1144]]} : edge.from === 'agent-control-api' && edge.to === 'scope-control' ? {...edge, via:[[1410,1144],[1430,1144],[1430,190],[1130,190],[1130,230]]} : edge.from === 'quality-control' && edge.to === 'agent-control-api' ? {...edge, via:[[1130,865],[1320,865],[1320,1144]]} : edge.from === 'agent-control-api' && edge.to === 'quality-control' ? {...edge, via:[[1430,1144],[1450,1144],[1450,730],[1130,730],[1130,800]]} : edge);
 return graph;
}
export function bankingKnowledge():Diagram {
 return {title:'Brahe Bank · implemented retrieval alternatives',note:'Only one branch is configured at startup. Local search does not use embeddings. The Pinecone index must already contain product documents; the chat service does not ingest or build it.',width:1460,height:850,
 boundaries:[{title:'LOCAL PROCESS',x:15,y:20,width:1430,height:220},{title:'LOCAL DOCUMENT SEARCH · no Pinecone key',x:15,y:310,width:690,height:510},{title:'EXTERNAL VECTOR SEARCH · Pinecone key configured',x:760,y:310,width:685,height:510}],
 nodes:[n('agent','Card information agent','Tool call with query and k',35,90,'ai'),n('tool','PineconeRetrievalTool','Configured branch at startup',605,90,'service','The class name is retained upstream, but the implementation has two explicit alternatives. k defaults to 5 and is limited to 1–8.'),n('answer','Tool result → specialist','Named document excerpts',1170,90,'service','Retrieved text returns as a tool message. The specialist responds to the supervisor; source snippets are collected separately by the API callback.'),
 n('lexical','Lexical ranking','Token match over document text',60,390,'service'),n('files','Product Markdown files','source-docs/credit-cards/*.md',400,390,'store'),n('format','Format top-k results','Document name + text',400,680,'service'),
 n('embed','OpenAIEmbeddings','Embed query via hosted API',800,390,'ai'),n('index','Pinecone vector index','credit-card-information',1170,390,'store','Pre-existing index is queried by similarity. This diagram does not claim it is populated or available at runtime.'),n('matches','Similarity-search results','Top-k document chunks',980,680,'store')],
 edges:[e('agent','tool','query + k'),e('tool','lexical','no key: lexical search',{ports:'down',labelAt:[360,270]}),e('tool','embed','key set: query embedding',{ports:'down',labelAt:[980,270]}),e('lexical','files','read documents'),e('files','format','rank → top-k text',{ports:'down'}),e('embed','index','query vector'),e('index','matches','matched chunks',{ports:'down'}),e('format','answer','named source text',{ports:'up',via:[[520,610],[725,610],[725,260],[1290,260]],labelAt:[725,545]}), e('matches','answer','named source text',{ports:'up',via:[[1100,620],[1430,620],[1430,255],[1290,255]],labelAt:[1340,575]})]};
}

export function fraudRuntime():Diagram {
 return {title:'Card fraud triage · implemented request path',note:'Code-verified path: POST /api/fraud/runs starts a triage run. Each payment is scored live (GraphSAGE + XGBoost sidecar at :8000), else from recorded Sparky scores, else sample scores, always labelled. The sidecar returns a probability and exact XGBoost TreeSHAP contributions. The triage agent investigates with tools; the analyst decides under fraud.take_action.',width:1520,height:980,
 boundaries:[
  {title:'Studio adapter · FastAPI :8012',x:28,y:16,width:1464,height:220},
  {title:'Live NVIDIA scorer · GraphSAGE + XGBoost + TreeSHAP :8000',x:408,y:252,width:1084,height:220},
  {title:'Triage agent · Studio model chain · AI Defense on untrusted text',x:408,y:488,width:1084,height:220},
 ],
 nodes:[
  n('user','Analyst / studio','Pick a scenario · Triage queue',56,64,'human','The workbench starts a run for a scenario. It does not send raw PAN data or start training. Synthetic data only.'),
  n('api','FastAPI /runs','POST /api/fraud/runs',436,64,'service','Scores the queue, opens the alert, runs the triage agent, then waits for the analyst decision (POST /runs/{id}/decision). Every step is a timeline event.'),
  n('catalog','Alert queue','studio_cases.json · fixtures',816,64,'store','TabFormer test-window payments picked per scenario when recorded or live scores exist; otherwise five synthetic fixture cases. Ground truth stays server-side until the decision.'),
  n('router','Scorer chain','live → recorded → sample',1196,64,'service','auto tries the GraphSAGE + XGBoost sidecar, then recorded Sparky scores (.cache/scores.json), then sample scores. The badge says which one answered.'),
  n('scoreFail','Score unavailable','No backend answered',56,300,'failure','Only when the chain is forced to one backend that is down. In auto mode sample scores always answer, labelled.'),
  n('tritonClient','Score client','POST :8000/score',436,300,'service','Sends src, dst, and the edge_attr vector. HTTP JSON to infer_server.py, not a Triton gRPC payload.'),
  n('tritonServer','GraphSAGE + XGBoost','GPU infer sidecar',816,300,'ai','infer_server.py loads model_final.pt and xgboost_fraud.json in the NVIDIA image. Point-in-time neighbor sampling, GNN embedding, then XGBoost.',sources.fraud.url),
  n('shap','XGBoost TreeSHAP','Exact · log-odds',1196,300,'ai','pred_contribs on the XGBoost model, summed into network, amount, channel, and history groups and mapped to plain-English reasons. This hop does not call an LLM.',sources.fraud.url),
  n('fixture','Recorded / sample scores','Never-dead fallback',56,536,'service','Recorded Sparky scores, else sample log-odds for the five synthetic cases. Labelled "Recorded run · <date>" or "Sample scores".'),
  n('narrative','Fraud triage agent','Deep Agent · tools',436,536,'ai','Plans with write_todos, calls score_payment, rules_score, get_neighborhood, explain, similar_cases, fraud_playbook, draft_disposition, and propose_action, then writes a summary where every point cites a tool result.'),
  n('defense','Cisco AI Defense','Dispute note · prompt · summary · notes',816,536,'cisco','Inspects the untrusted cardholder dispute note (withheld when blocked), the agent prompt before a hosted model, the agent summary, and analyst case notes. The score path is not sent to the Inspection API.',sources.defense.url),
  n('release','Case file','Rules vs graph · reasons · summary',1196,536,'service','Rules verdict and graph risk band side by side, the point-in-time network, TreeSHAP reasons, and the cited summary. Not a disposition or SAR.'),
  n('splunk','Splunk Agent Observability','Agent trace · tool spans',56,772,'service','One trace per triage run with a span per tool call and the agent model calls. OTLP export is optional.',sources.splunk.url),
  n('omit','Scripted summary','No model reachable',436,772,'failure','Same tools, a template summary from their outputs, labelled Scripted. A blocked dispute note is withheld either way.'),
  n('analyst','Agent Control','fraud.take_action · fraud.note_pii',816,772,'cisco','Hosted Agent Control enforces deterministic verdicts: irreversible card actions need the analyst; notes may not carry a full card number or SSN. Local check, labelled, when the tenant is unreachable.'),
  n('output','Analyst disposition','Human decision · audit trail',1196,772,'human','Contact customer, block and reissue, false positive, or escalate (with a SAR handoff). Card actions are simulated in this demo.'),
 ],
 edges:[
  e('user','api','POST scenario',{labelAt:[346,128]}),
  e('api','catalog','queue + alert',{labelAt:[726,128]}),
  e('catalog','router','case features',{labelAt:[1106,128]}),
  e('router','tritonClient','sidecar /health ok',{ports:'down',labelAt:[560,248]}),
  e('tritonClient','tritonServer','HTTP POST /score',{labelAt:[726,364]}),
  e('tritonServer','shap','p(fraud) + contributions',{labelAt:[1106,364]}),
  e('shap','release','score path · no LLM',{ports:'down',labelAt:[1316,466]}),
  e('release','analyst','agent proposes action',{ports:'down',labelAt:[1106,702]}),
  e('analyst','output','deny until approved',{labelAt:[1106,836]}),
  e('router','scoreFail','forced backend down',{ports:'down',kind:'control',labelAt:[176,248]}),
  e('tritonClient','scoreFail','infer failed',{ports:'left',kind:'control',labelAt:[346,364]}),
  e('router','fixture','sidecar down',{ports:'down',kind:'control',via:[[1316,248],[176,248],[176,536]],labelAt:[280,248]}),
  e('fixture','shap','recorded / sample contributions',{via:[[176,500],[1316,500],[1316,428]],labelAt:[700,488]}),
  e('fixture','scoreFail','missing case',{ports:'up',kind:'control',labelAt:[176,466]}),
  e('shap','narrative','evidence tools',{ports:'down',labelAt:[560,466]}),
  e('narrative','defense','inspect prompt / summary',{kind:'control',labelAt:[726,600]}),
  e('defense','release','allow text',{kind:'control',labelAt:[1106,600]}),
  e('defense','omit','deny / unavailable',{ports:'down',kind:'control',labelAt:[726,702]}),
  e('narrative','omit','model unavailable',{ports:'down',kind:'control',labelAt:[556,702]}),
  e('api','splunk','agent trace',{ports:'down',via:[[556,210],[176,210],[176,772]],kind:'telemetry',labelAt:[210,210]}),
  e('release','splunk','tool spans',{ports:'down',via:[[1316,680],[176,680],[176,772]],kind:'telemetry',labelAt:[300,680]}),
 ]};
}

export function fraudKnowledge():Diagram {
 return {title:'Card fraud triage · implemented scoring backends',note:'Training is offline on Sparky. A triage run never starts the NVIDIA training container. Online, auto prefers the live sidecar at FRAUD_SCORE_URL, then recorded Sparky scores, then sample scores.',width:1520,height:860,
 boundaries:[
  {title:'Offline training · not invoked by a triage run',x:28,y:16,width:1464,height:220},
  {title:'Online scoring · one backend per request',x:28,y:280,width:1464,height:540},
 ],
 nodes:[
  n('source','TabFormer graph','2019-01…08 train · Sep–Oct test',56,72,'store','preprocess_tabformer_v3.py. 5,141 accounts, 38,927 merchants, 1.15M train edges, 287k test edges.'),
  n('train','Training job','scripts/train.sh',436,72,'ai','financial-fraud-training:3.0.0 on this Spark. GraphSAGE, then XGBoost, then SVS baseline.',sources.fraud.url),
  n('artifacts','Trained weights','model_final.pt · xgboost_fraud.json',816,72,'store','Written to services/fraud/.cache/train. Gitignored. Required before serve.sh can score.'),
  n('cases','Alert queue','Scenario payments',56,360,'store','TabFormer test-window rows per scenario plus synthetic fixture cases. Published labels stay server-side until the analyst decides. Not a live authorization feed.'),
  n('selector','Scorer chain','live → recorded → sample',436,360,'service','auto prefers the live sidecar /health, then recorded Sparky scores, then sample scores. Every score carries its source label.'),
  n('tritonEns','Live sidecar','GraphSAGE + XGBoost + TreeSHAP',816,360,'ai','infer_server.py in the NVIDIA training image. HTTP /score with exact XGBoost TreeSHAP (pred_contribs), not the Triton ensemble.',sources.fraud.url),
  n('result','Score payload','Probability + TreeSHAP reasons',1196,360,'service','Log-odds contributions grouped into plain-English reasons. No automatic payment block and no SAR filing.'),
  n('fixtureTable','Recorded / sample scores','Never-dead fallback',436,600,'store','Recorded Sparky scores when present, otherwise sample log-odds for the synthetic cases. Labelled in the UI.'),
  n('hold','Scorer down','Forced backend only',816,600,'failure','Only a forced single backend can fail closed; auto always falls back to a labelled source.'),
  n('consumer','Triage tools','score_payment · explain',1196,600,'service','The triage agent and the case file read the same payload: probability, band, TreeSHAP reasons, and timing.'),
 ],
 edges:[
  e('source','train','prepared graph',{labelAt:[346,136]}),
  e('train','artifacts','write weights',{labelAt:[726,136]}),
  e('artifacts','tritonEns','serve.sh loads weights',{ports:'down',labelAt:[936,248]}),
  e('cases','selector','load case',{labelAt:[346,424]}),
  e('selector','tritonEns','sidecar healthy',{labelAt:[726,424]}),
  e('tritonEns','result','p(fraud) + TreeSHAP',{labelAt:[1106,424]}),
  e('selector','fixtureTable','sidecar down',{ports:'down',labelAt:[556,536]}),
  e('fixtureTable','result','recorded / sample contributions',{via:[[556,560],[1316,560],[1316,488]],labelAt:[900,548]}),
  e('result','consumer','tool result',{ports:'down',labelAt:[1316,536]}),
  e('selector','hold','forced backend down',{ports:'down',kind:'control',labelAt:[726,536]}),
  e('artifacts','hold','weights missing',{kind:'control',via:[[936,210],[176,210],[176,664],[816,664]],labelAt:[300,664]}),
 ]};
}

export function briefingRuntime():Diagram {
 return {title:'Company briefing · implemented request path',note:'Code-verified Deep Agent path: ingest is EDGAR or upload, then a TOC filing map and companyfacts. The supervisor plans and delegates; it does not read filing nodes. Theme subagents call read_filing_node. Cisco AI Defense inspects every model hop. EDGAR, upload, navigator, XBRL, and the grounding verifier never enter Inspection. This map does not assert live SEC or OpenAI availability. No vector index and no open web.',width:1520,height:1440,
 boundaries:[
  {title:'Studio adapter · FastAPI :8013',x:28,y:16,width:1464,height:220},
  {title:'Ingest · EDGAR or upload · no Inspection',x:28,y:252,width:1464,height:220},
  {title:'Filing map + XBRL · not embeddings · no Inspection',x:28,y:488,width:1464,height:220},
  {title:'Deep Agent · Defense on every model hop',x:28,y:724,width:1464,height:220},
  {title:'Ground · presenter accept-gate · fail closed',x:28,y:960,width:1464,height:220},
  {title:'Optional observability · not required for a briefing',x:28,y:1196,width:1464,height:220},
 ],
 nodes:[
  n('user','Presenter / studio','Ticker, name, or upload',56,64,'human','At least one of query, CIK, or file. If both a query and a file are present, the file is the document. Public filings / uploaded text, not investment advice.'),
  n('api','FastAPI /analyze','POST /api/briefing/analyze',436,64,'service','Multipart analyze on 127.0.0.1:8013. Stages uploads before ainvoke. Search is GET /search. The map does not claim the sidecar is up.'),
  n('picker','Issuer picker','Ambiguous name · no silent pick',816,64,'human','Multiple ticker matches return candidates. Analyze does not guess an issuer.'),
  n('path','Ingest path','File wins over EDGAR',1196,64,'service','EDGAR + upload only. No Tavily, IR scrape, or open web. Auto path needs SEC_USER_AGENT; this map does not assert EDGAR reachability.'),
  n('resolve','resolve_company','Ticker catalog match',56,300,'service','GET company_tickers.json, cached ~24h. Exact ticker then title substring. Unknown issuer is a tool error, not a hallucinated filing.',sources.edgar.url),
  n('edgar','fetch_annual_report','Latest 10-K / 20-F / 40-F',436,300,'service','SEC submissions + Archives. Writes /filings/source.html and meta.json. Cached under .cache/filings/. Not a live health badge.',sources.edgar.url),
  n('upload','Upload + PDF extract','≤40 MB · text layer only',816,300,'service','FastAPI stages the file. pdfplumber extracts text. Image-only PDFs return 422. The agent must not replace the upload with an EDGAR download.'),
  n('ingestFail','Ingest stop','No model briefing',1196,300,'failure','Unknown or ambiguous issuer, no annual report, empty or scanned PDF, or invalid type/size. Fail closed before the Deep Agent runs.'),
  n('sandbox','/filings/ sandbox','Per-analyze run dir',56,536,'store','FilesystemBackend virtual_mode at /filings/. Source, meta, toc, nodes, and theme notes. No host execute. Gitignored .cache/runs/.'),
  n('toc','TOC navigator','Items 1 / 1A / 1C / 7 / 8',436,536,'service','Titled sub-nodes with citation URLs. grep is discovery only. Do not concatenate Item 1A into the supervisor.'),
  n('facts','companyfacts XBRL','FY allowlist · no LLM math',816,536,'service','Revenue, NetIncomeLoss, Assets, Liabilities, StockholdersEquity. Upload without CIK is verbatim-table or absent.',sources.edgar.url),
  n('nodes','Node files','/filings/nodes/{id}.md',1196,536,'store','Filing map, not embeddings. Each node has title, item, budget, and citation URL. Supervisor never calls read_filing_node.'),
  n('supervisor','Deep Agent supervisor','Plan · delegate · assemble',56,772,'ai','write_todos and task. Tools: identity, ingest, TOC, XBRL. Never read_filing_node. No general-purpose subagent and no web search.',sources.deepagents.url),
  n('subagents','Theme subagents','Five specialists',436,772,'ai','Objectives, risks, regulatory, AI initiatives, metrics. read_filing_node ≤8 per theme. Metrics uses get_company_facts only. Notes at /filings/notes/{theme}.json.'),
  n('model','ProtectedChatOpenAI','Temperature 0 · every hop',816,772,'ai','Supervisor and subagents share this client, built on the first healthy backend in the Studio model chain (Sparky vLLM, else the OpenAI API). The map does not assert OpenAI availability or credentials.'),
  n('defense','Cisco AI Defense','Inspect every model hop',1196,772,'cisco','Plan, delegate, extract, assemble. Filing bytes never enter Inspection. Deny or unavailability fail closed — no briefing.',sources.defense.url),
  n('grounding','Grounding verifier','Cite-or-abstain · not an LLM',56,1008,'service','Drop narrative facts whose excerpt is not in the node file. Drop xbrl metrics that miss companyfacts. Themes that lose every fact become abstains.'),
  n('gate','Presenter accept-gate','Use this company',436,1008,'human','Studio context is stored only after this click. Refresh and clear do not skip the gate.'),
  n('profile','localStorage profile','After accept only',816,1008,'store','Presenter-owned studio context. The API does not persist company context server-side.'),
  n('errors','Fail closed','No briefing released',1196,1008,'failure','Inspection deny/unavailable, ungrounded-only themes, or model/tool error. Safe error; no invented issuer or metrics.'),
  n('splunk','Splunk OTLP export','Optional · not required',56,1244,'service','Agent, tool, and subagent spans only when configured. Same optional pattern as Fraud. Not a dashboard claim.',sources.splunk.url),
  n('output','Studio company context','Tenant switcher after accept',436,1244,'human','Becomes workspace context only after the accept-gate. Other demos are not rewritten from this profile.'),
 ],
 edges:[
  e('user','api','POST query / file',{labelAt:[346,128]}),
  e('api','picker','ambiguous name',{kind:'control',labelAt:[726,128]}),
  e('picker','path','pinned CIK',{labelAt:[1106,128]}),
  e('api','path','unique query or file',{via:[[556,48],[1316,48]],labelAt:[930,40]}),
  e('api','ingestFail','invalid / ambiguous',{kind:'control',via:[[556,232],[1436,232],[1436,364]],labelAt:[1200,224]}),
  e('path','resolve','no file · identity',{ports:'down',via:[[1316,248],[176,248]],labelAt:[746,240]}),
  e('path','upload','file staged',{ports:'down',labelAt:[1106,248]}),
  e('resolve','edgar','known issuer',{labelAt:[346,364]}),
  e('resolve','ingestFail','unknown issuer',{kind:'control',via:[[176,428],[1316,428]],labelAt:[746,420]}),
  e('edgar','ingestFail','no 10-K',{kind:'control',via:[[556,464],[1316,464]],labelAt:[930,456]}),
  e('upload','ingestFail','empty / scanned PDF',{kind:'control',labelAt:[1106,364]}),
  e('edgar','sandbox','source.html + meta',{ports:'down',via:[[556,500],[176,500]],labelAt:[300,492]}),
  e('upload','sandbox','source + meta',{ports:'down',via:[[936,512],[176,512]],labelAt:[500,504]}),
  e('sandbox','toc','build_filing_toc',{labelAt:[346,600]}),
  e('sandbox','facts','CIK · companyfacts',{via:[[176,632],[936,632]],labelAt:[556,624]}),
  e('toc','nodes','write node files',{via:[[556,664],[1316,664]],labelAt:[930,656]}),
  e('sandbox','supervisor','filing ready',{ports:'down',labelAt:[176,702]}),
  e('supervisor','subagents','task / write_todos',{labelAt:[346,836]}),
  e('nodes','subagents','read_filing_node',{ports:'down',via:[[1316,700],[556,700]],labelAt:[930,692]}),
  e('facts','subagents','FY metrics',{ports:'down',via:[[936,720],[556,720]],labelAt:[746,712]}),
  e('supervisor','model','plan / assemble hops',{via:[[176,740],[936,740]],labelAt:[556,732]}),
  e('subagents','model','extract hops',{labelAt:[726,836]}),
  e('supervisor','defense','inspect plan / assemble',{kind:'control',via:[[176,756],[1316,756]],labelAt:[800,748]}),
  e('subagents','defense','inspect extract',{kind:'control',via:[[556,900],[1316,900]],labelAt:[930,892]}),
  e('model','defense','inspect hop',{kind:'control',labelAt:[1106,836]}),
  e('defense','errors','deny / unavailable',{ports:'down',kind:'control',labelAt:[1316,940]}),
  e('supervisor','errors','model / tool error',{kind:'control',via:[[176,940],[1316,940]],labelAt:[746,932]}),
  e('subagents','grounding','theme notes',{ports:'down',via:[[556,980],[176,980]],labelAt:[360,972]}),
  e('nodes','grounding','excerpt substring',{ports:'down',via:[[1316,992],[176,992]],labelAt:[746,984]}),
  e('facts','grounding','XBRL match',{ports:'down',via:[[936,1004],[176,1004]],labelAt:[556,996]}),
  e('grounding','gate','cited briefing',{labelAt:[346,1072]}),
  e('grounding','errors','ungrounded-only themes',{kind:'control',via:[[176,1140],[1316,1140]],labelAt:[746,1132]}),
  e('gate','profile','Use this company',{labelAt:[726,1072]}),
  e('profile','output','after accept',{ports:'down',labelAt:[936,1188]}),
  e('api','splunk','optional spans',{ports:'down',kind:'telemetry',via:[[556,210],[176,210],[176,1244]],labelAt:[200,210]}),
  e('supervisor','splunk','agent / subagent spans',{kind:'telemetry',via:[[176,1188],[176,1244]],labelAt:[200,1210]}),
 ]};
}

export function briefingKnowledge():Diagram {
 return {title:'Company briefing · implemented filing retrieval',note:'Ticker catalog, EDGAR cache, and companyfacts are the automatic path. An upload keeps the original file; node files are a filing map, not embeddings. No vector index and no open web. This map does not assert live SEC availability.',width:1520,height:860,
 boundaries:[
  {title:'SEC catalogs and caches · not a live availability claim',x:28,y:16,width:1464,height:220},
  {title:'Upload original vs extracted text · no Inspection',x:28,y:280,width:1464,height:220},
  {title:'Filing map + companyfacts · not embeddings',x:28,y:544,width:1464,height:292},
 ],
 nodes:[
  n('tickers','Ticker catalog','company_tickers.json · ~24h',56,72,'store','GET https://www.sec.gov/files/company_tickers.json. Cached locally. Exact ticker, then title substring.',sources.edgar.url),
  n('submissions','Submissions JSON','CIK filings.recent.form',436,72,'store','Newest 10-K, else 20-F, else 40-F. Skip /A amendments unless that is all that exists.',sources.edgar.url),
  n('archives','EDGAR Archives','Primary HTML or TXT',816,72,'store','https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{primaryDocument}. Official SEC URL; reachability is not claimed.',sources.edgar.url),
  n('cache','EDGAR cache','.cache/filings/{cik}/{accession}',1196,72,'store','Raw document reused on later runs. Refresh ignores a completed-briefing cache. Gitignored.'),
  n('upload','Uploaded original','PDF / HTML / TXT ≤ 40 MB',56,360,'store','The original bytes stay the document. Query, if present, is identity only and must not replace this file with an EDGAR download.'),
  n('extract','pdfplumber extract','Text layer only',436,360,'service','Writes /filings/source.txt. No OCR in v1.'),
  n('empty','Empty / scanned PDF','HTTP 422 · no briefing',816,360,'failure','Image-only PDFs have no extractable text. Fail closed before the Deep Agent runs.'),
  n('reject','Issuer / form stop','Unknown · no 10-K',1196,360,'failure','Unknown ticker/name or no annual report on the submissions list. Not a model-invented filing.'),
  n('toc','TOC navigator','Titled Item sub-nodes',56,624,'service','Parse Item 1, 1A, 1C, 7, 8 and headings. Glossy IR PDFs without Item labels still get titled or windowed nodes. grep is discovery, not the primary map.'),
  n('nodes','Node files','/filings/nodes/{id}.md',436,624,'store','Filing map, not embeddings. Title, item, character budget, citation URL (sec.gov fragment or upload:{filename}#node).'),
  n('facts','companyfacts XBRL','FY allowlist + aliases',816,624,'store','https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json filtered to that 10-K fiscal year. LLM does not compute figures.',sources.edgar.url),
  n('consumer','Subagents + verifier','read_filing_node + cite-or-abstain',1196,624,'service','Theme subagents read node files. The verifier string-matches excerpts and XBRL values. No vector query.'),
 ],
 edges:[
  e('tickers','submissions','resolve CIK',{labelAt:[346,136]}),
  e('submissions','archives','latest annual report',{labelAt:[726,136]}),
  e('archives','cache','store raw filing',{labelAt:[1106,136]}),
  e('cache','toc','build map',{ports:'down',via:[[1316,248],[176,248],[176,624]],labelAt:[300,248]}),
  e('tickers','reject','unknown issuer',{kind:'control',via:[[176,248],[1316,248],[1316,360]],labelAt:[900,248]}),
  e('submissions','reject','no 10-K',{kind:'control',via:[[556,280],[1316,280]],labelAt:[930,272]}),
  e('upload','extract','PDF text layer',{labelAt:[346,424]}),
  e('upload','toc','HTML / TXT',{ports:'down',labelAt:[176,536]}),
  e('extract','toc','source.txt',{ports:'down',labelAt:[346,536]}),
  e('extract','empty','no text layer',{kind:'control',labelAt:[726,424]}),
  e('toc','nodes','one file per node',{labelAt:[346,688]}),
  e('cache','facts','CIK + FY',{ports:'down',via:[[1316,520],[936,520]],labelAt:[1126,512]}),
  e('nodes','consumer','read_filing_node',{labelAt:[726,688]}),
  e('facts','consumer','FY metrics',{labelAt:[1106,688]}),
  e('upload','facts','CIK identity only',{via:[[176,500],[936,500]],labelAt:[556,492]}),
 ]};
}

function researchCapability(frame:FrameMapping,step:number):Diagram {
 const process=frame.architecture.process;
 const fetch=frame.architecture.ai[0]??{detail:'Allowlisted yfinance and FRED write through a TTL cache. Empty provider responses fail closed.'};
 const tools=frame.architecture.ai[1]??{detail:'Earnings, peers, returns, and macro are CPU math. Conflicts are structured rows, not a keyword scan.'};
 const synth=frame.architecture.ai[2]??{detail:'LangChain ChatOpenAI calls the Studio model chain: Sparky vLLM, else the OpenAI API. Defense inspects this hop only.'};
 const xs=[56,436,816,1196];
 const focus=step===0?'yahoo':step===1?'cache':step===2?'conflicts':'gate';
 return {title:'Wealth research · capability',note:'Live path is allowlisted Yahoo + FRED cache, CPU tools and structured conflicts, then one model hop on the Studio model chain (Sparky vLLM on an NVIDIA DGX Spark dev box, else the OpenAI API). Cisco AI Defense inspects model hops only. Fetch, cache, FRED, tools, conflicts, and grounding stay off Inspection. This map does not assert live Yahoo, FRED, or model availability. No vector index and no Tavily. Demo recommendation — not financial advice.',width:1520,height:940,
 boundaries:[
  {title:'Business process',x:28,y:16,width:1464,height:220},
  {title:'Deterministic fetch / cache / tools / conflicts · no Inspection',x:28,y:252,width:1464,height:220},
  {title:'Model-chain hop · AI Defense on synthesis',x:28,y:488,width:1464,height:220},
  {title:'Accept-gate · dev model host · optional telemetry',x:28,y:724,width:1464,height:192},
 ],
 nodes:[
  ...process.map((p,i)=>n('p'+i,p.title,p.detail,xs[i]??56+i*380,56,'human')),
  n('yahoo','Yahoo + FRED fetch','Allowlisted · no browse',56,300,'service',fetch.detail),
  n('cache','Write-through cache','Same UTC day / TTL',436,300,'store','Gitignored .cache/snapshots and .cache/fred. Refresh forces a live pull. Not a committed snapshot pack.'),
  n('tools','Earnings / peers / returns','CPU math · no Inspection',816,300,'service',tools.detail),
  n('conflicts','Structured conflicts','Before the LLM',1196,300,'service','Beat-rate vs SPY lag, P/E premium vs decelerating revenue, CPI/Fed vs rate-sensitive sector. No keyword scan over prose.'),
  n('grounding','Grounding verifier','Cite-or-abstain · not an LLM',56,536,'service','Excerpt and value match against the cached snapshot and FRED payload. Ungrounded-only notes are omitted. Off Inspection.'),
  n('nim','Model-chain synthesis','LangChain · Sparky → OpenAI',436,536,'ai',synth.detail),
  n('defense','Cisco AI Defense','Model hops only',816,536,'cisco','Inspects note input and output. Fetch, cache, FRED, tools, conflicts, and grounding never enter Inspection.',sources.defense.url),
  n('omit','Note omitted','Indicators still release',1196,536,'failure','No reachable model, inspection deny, or ungrounded-only claims drop the note and recommendation. Earnings, peers, returns, macro, and conflicts remain.'),
  n('fail','Empty provider','HTTP 502 · no invented rows',56,772,'failure','A failed or empty Yahoo snapshot fails closed. Missing FRED_API_KEY leaves macro absent and research still runs.'),
  n('observe','Splunk Agent Observability','Galileo SDK · optional',436,772,'cisco','GalileoAsyncCallback on the model hop when GALILEO_API_KEY is set. Configuration only. Analyze does not require a dashboard. Not a local topic judge.',sources.splunk.url),
  n('compute','Sparky (DGX Spark) host','Dev box · Cisco AI POD proposed',816,772,'service','Sparky is an NVIDIA DGX Spark (GB10) dev box serving vLLM at 127.0.0.1:8003. It is not Cisco hardware. When it is down the chain answers from the OpenAI API and the note records which model answered. Cisco UCS / AI POD is the proposed production placement, not a sized BOM.',sources.cisco.url),
  n('gate','Accept research note','Presenter-owned store',1196,772,'human','Studio research context is stored only after this click. Clearing the company profile does not wipe the note.'),
 ],
 edges:[
  ...process.slice(0,-1).map((_,i)=>e('p'+i,'p'+(i+1),'next step')),
  e('p'+Math.min(step,Math.max(process.length-1,0)),focus,step===0?'select ticker':step===1?'fetch or reuse':step===2?'review conflicts':'review note',{ports:'down',labelAt:step===0?[176,248]:step===1?[556,248]:step===2?[1106,248]:[1316,248]}),
  e('yahoo','cache','write-through',{labelAt:[346,364]}),
  e('cache','tools','cached payload',{labelAt:[726,364]}),
  e('tools','conflicts','tool JSON',{labelAt:[1106,364]}),
  e('yahoo','fail','empty / failed fetch',{ports:'down',kind:'control',labelAt:[176,466]}),
  e('tools','nim','tool JSON',{ports:'down',labelAt:[746,466]}),
  e('conflicts','nim','conflict rows',{ports:'down',via:[[1316,480],[556,480]],labelAt:[930,472]}),
  e('tools','grounding','numbers + labels',{via:[[936,428],[176,428]],labelAt:[556,420]}),
  e('conflicts','grounding','row text',{via:[[1316,448],[176,448]],labelAt:[746,440]}),
  e('nim','defense','inspect hop',{kind:'control',labelAt:[726,600]}),
  e('defense','omit','deny / unavailable',{kind:'control',labelAt:[1106,600]}),
  e('nim','omit','no model up',{kind:'control',via:[[556,664],[1316,664]],labelAt:[930,656]}),
  e('nim','grounding','draft note',{ports:'left',labelAt:[346,600]}),
  e('grounding','omit','ungrounded-only',{kind:'control',via:[[176,664],[1316,664]],labelAt:[500,656]}),
  e('grounding','gate','cited note',{ports:'down',via:[[176,836],[1316,836]],labelAt:[746,828]}),
  e('nim','observe','optional spans',{kind:'telemetry',ports:'down',labelAt:[556,702]}),
  e('nim','compute','dev host',{kind:'placement',via:[[556,740],[936,740]],labelAt:[746,732]}),
  ...(process[3]?[e('gate','p3','after accept',{ports:'up',via:[[1316,748],[1436,748],[1436,184]],labelAt:[1400,200]})]:[]),
 ]};
}

export function researchRuntime():Diagram {
 return {title:'Wealth research · implemented request path',note:'Code-verified path: the workbench posts a ticker. FastAPI on :8014 uses a write-through Yahoo + FRED cache, CPU tools, and structured conflicts. LangChain calls the Studio model chain: Sparky vLLM at 127.0.0.1:8003 (an NVIDIA DGX Spark dev box), else the OpenAI API, and the response names the model that answered. Cisco AI Defense inspects model hops only. Fetch, cache, FRED, tools, conflicts, and grounding never enter Inspection. This map does not assert live Yahoo, FRED, or model availability. No vector index and no Tavily. Demo recommendation — not financial advice.',width:1520,height:1440,
 boundaries:[
  {title:'Studio adapter · FastAPI :8014',x:28,y:16,width:1464,height:220},
  {title:'Allowlisted fetch + write-through cache · no Inspection',x:28,y:252,width:1464,height:220},
  {title:'CPU tools + structured conflicts · no Inspection',x:28,y:488,width:1464,height:220},
  {title:'Model-chain synthesis · Defense on hop',x:28,y:724,width:1464,height:220},
  {title:'Ground + accept-gate · numbers stay if note omitted',x:28,y:960,width:1464,height:220},
  {title:'Optional observability · dev model host · Cisco AI POD proposed',x:28,y:1196,width:1464,height:220},
 ],
 nodes:[
  n('user','Presenter / studio','US ticker + refresh flag',56,64,'human','Any US ticker. The accepted briefing ticker is a default only.'),
  n('api','FastAPI /research/analyze','POST /api/wealth/research/analyze',436,64,'service','127.0.0.1:8014. Cache-if-fresh unless refresh=true. The map does not claim the sidecar is up.'),
  n('ticker','Ticker check','1–5 letter US symbol',816,64,'service','Invalid symbols return 422. Analyze always performs a real allowlisted fetch or a fresh cache hit.'),
  n('source','Source kind','live or cache · never fixture',1196,64,'service','source.kind is live or cache. Analyze does not read a bundled market snapshot catalog.'),
  n('yahoo','yfinance named functions','history · earnings · info · peers',56,300,'service','No arbitrary HTTP. Peer groups come from the live industry + market-cap band, then cache with the issuer snapshot.'),
  n('cache','Snapshot cache','.cache/snapshots/{ticker}.json',436,300,'store','Write-through. Fresh for the same UTC day or WEALTH_CACHE_TTL_SECONDS. Gitignored.'),
  n('fred','FRED allowlist','FEDFUNDS · CPI · 10Y · UNRATE',816,300,'service','Requires FRED_API_KEY. Missing key leaves macro absent and research still runs.'),
  n('fetchFail','Empty provider','HTTP 502 · no invented rows',1196,300,'failure','Empty Yahoo history/info fails closed. A configured FRED series that returns nothing also fails closed.'),
  n('tools','Earnings / peers / returns','Deterministic math',56,536,'service','Beat-rate, peer median/percentile, and horizon returns vs SPY. Off Inspection.'),
  n('macro','Macro tool','FRED series or absent',436,536,'service','Named tool over cached FRED observations. Direction is latest vs prior. Off Inspection.'),
  n('conflicts','Structured conflicts','Before the LLM',816,536,'service','Cross-dimension rows only. No keyword scan over agent prose.'),
  n('indicators','Indicator rows','Always release when tools succeed',1196,536,'service','Earnings, peers, returns, macro, and conflicts stay even if the note is omitted.'),
  n('nim','ProtectedChatOpenAI','Temperature 0 · ainvoke',56,772,'ai','langchain_openai pointed at the first healthy backend in the Studio chain: Sparky vLLM (http://127.0.0.1:8003/v1), else the OpenAI API. A connect failure retries once on the next backend.'),
  n('defense','Cisco AI Defense','Inspect every model hop',436,772,'cisco','src_app fsi-ai-studio-wealth. Fetch, cache, FRED, tools, conflicts, and grounding never enter Inspection.',sources.defense.url),
  n('model','Studio model chain','Sparky vLLM → OpenAI API',816,772,'ai','Sparky serves Nemotron Super through vLLM at 127.0.0.1:8003. If its health probe fails, the OpenAI API answers and the note records served_by. npm run dev:studio does not start vLLM.'),
  n('omit','Note omitted','Recommendation omitted',1196,772,'failure','No reachable model, inspection deny/unavailable, timeout, or ungrounded-only claims. Numbers stay.'),
  n('grounding','Grounding verifier','Snapshot + FRED values',56,1008,'service','Drop claims whose excerpt or value is not in the cache. Off Inspection.'),
  n('gate','Accept research note','Presenter accept-gate',436,1008,'human','Stored at fsi-demo-studio.research-note only after this click.'),
  n('store','localStorage note','After accept only',816,1008,'store','Separate from the company profile. Clearing the briefing does not wipe the note.'),
  n('galileo','Splunk Agent Observability','Galileo SDK · optional',1196,1008,'service','GalileoAsyncCallback on research model hops when GALILEO_API_KEY is set. Configuration is not dashboard proof. This is not a local topic judge.',sources.splunk.url),
  n('splunk','Splunk OTLP export','Official LangChain OTEL',56,1244,'service','Additional traces and metrics only when SPLUNK_REALM + SPLUNK_ACCESS_TOKEN or OTLP endpoints are set. Not a dashboard claim.',sources.splunk.url),
  n('output','Demo recommendation','Not financial advice',436,1244,'human','Server attaches the disclaimer. The model does not author legal text.'),
  n('compute','Sparky (DGX Spark) host','Dev box · Cisco AI POD proposed',816,1244,'service','vLLM on an NVIDIA DGX Spark (GB10) dev box at 127.0.0.1:8003, not Cisco hardware. Cisco UCS / AI POD is the proposed production placement. Not a sized Cisco BOM.',sources.cisco.url),
  n('disclaimer','Not advice banner','Visible on the workbench',1196,1244,'human','Demo recommendation — not financial advice.'),
 ],
 edges:[
  e('user','api','POST ticker',{labelAt:[346,128]}),
  e('api','ticker','validate symbol',{labelAt:[726,128]}),
  e('ticker','source','live or cache',{labelAt:[1106,128]}),
  e('source','yahoo','refresh or miss',{ports:'down',via:[[1316,248],[176,248]],labelAt:[746,240]}),
  e('source','cache','fresh hit',{ports:'down',labelAt:[726,248]}),
  e('yahoo','cache','write snapshot',{labelAt:[346,364]}),
  e('yahoo','fred','same analyze',{via:[[176,428],[936,428]],labelAt:[556,420]}),
  e('fred','cache','write FRED',{labelAt:[726,364]}),
  e('yahoo','fetchFail','empty history / info',{kind:'control',via:[[176,464],[1316,464]],labelAt:[746,456]}),
  e('fred','fetchFail','empty series when keyed',{kind:'control',labelAt:[1106,364]}),
  e('cache','tools','issuer payload',{ports:'down',via:[[556,500],[176,500]],labelAt:[300,492]}),
  e('cache','macro','FRED payload',{ports:'down',labelAt:[556,466]}),
  e('tools','conflicts','tool JSON',{via:[[176,600],[936,600]],labelAt:[556,592]}),
  e('macro','conflicts','CPI / Fed direction',{labelAt:[726,600]}),
  e('tools','indicators','rows always',{via:[[176,664],[1316,664]],labelAt:[746,656]}),
  e('conflicts','indicators','conflict rows',{labelAt:[1106,600]}),
  e('macro','indicators','macro rows',{via:[[556,680],[1316,680]],labelAt:[930,672]}),
  e('conflicts','nim','rows + tools',{ports:'down',via:[[936,720],[176,720]],labelAt:[556,712]}),
  e('indicators','omit','note may drop',{ports:'down',kind:'control',labelAt:[1316,702]}),
  e('nim','model','ainvoke',{via:[[176,740],[936,740]],labelAt:[556,732]}),
  e('nim','defense','inspect input / output',{kind:'control',labelAt:[346,836]}),
  e('model','defense','inspect hop',{kind:'control',labelAt:[726,836]}),
  e('defense','omit','deny / unavailable',{kind:'control',labelAt:[1106,836]}),
  e('model','omit','no model / timeout',{kind:'control',labelAt:[1106,772]}),
  e('nim','grounding','draft note',{ports:'down',labelAt:[176,940]}),
  e('indicators','grounding','values + labels',{via:[[1316,980],[176,980]],labelAt:[746,972]}),
  e('cache','grounding','snapshot corpus',{via:[[556,992],[176,992]],labelAt:[360,984]}),
  e('grounding','gate','cited note',{labelAt:[346,1072]}),
  e('grounding','omit','ungrounded-only',{kind:'control',via:[[176,940],[1316,940]],labelAt:[746,932]}),
  e('yahoo','fetchFail','502 snapshot',{kind:'control',via:[[176,1140],[1316,1140]],labelAt:[746,1132]}),
  e('api','galileo','optional traces',{kind:'telemetry',via:[[556,210],[1316,210],[1316,1008]],labelAt:[1400,620]}),
  e('nim','galileo','model hop callbacks',{kind:'telemetry',via:[[176,1148],[1316,1148]],labelAt:[746,1140]}),
  e('gate','store','Accept research note',{labelAt:[726,1072]}),
  e('store','output','after accept',{ports:'down',labelAt:[936,1188]}),
  e('output','disclaimer','visible banner',{labelAt:[726,1308]}),
  e('api','splunk','optional spans',{ports:'down',kind:'telemetry',via:[[556,210],[176,210],[176,1244]],labelAt:[200,210]}),
  e('nim','splunk','synthesis spans',{kind:'telemetry',via:[[176,1188],[176,1244]],labelAt:[200,1210]}),
  e('model','compute','dev host :8003',{kind:'placement',ports:'down',labelAt:[936,1188]}),
 ]};
}

export function researchKnowledge():Diagram {
 return {title:'Wealth research · implemented market cache',note:'Yahoo named functions and allowlisted FRED series are the only providers. The write-through cache is the document of record after the first successful pull. No vector index, no Tavily, and no committed snapshot pack. This map does not assert live Yahoo or FRED availability.',width:1520,height:860,
 boundaries:[
  {title:'Allowlisted providers · not a live availability claim',x:28,y:16,width:1464,height:220},
  {title:'Write-through cache · gitignored · no snapshot pack',x:28,y:280,width:1464,height:220},
  {title:'CPU consumers · not embeddings',x:28,y:544,width:1464,height:292},
 ],
 nodes:[
  n('yahoo','yfinance','history / earnings / info / recs',56,72,'service','Named functions only. No arbitrary HTTP from tools.'),
  n('industry','Industry peers','Same sector + market-cap band',436,72,'service','Discovered live from yfinance Industry, then cached with the issuer. No peers.yaml catalog.'),
  n('spy','SPY benchmark','Horizon returns vs SPY',816,72,'service','Same history helper as the issuer. Relative returns are computed in tools.'),
  n('fredSrc','FRED API','Four allowlisted series',1196,72,'service','FEDFUNDS, CPIAUCSL, DGS10, UNRATE. Other series IDs are rejected.'),
  n('snap','Issuer snapshot','.cache/snapshots/{ticker}.json',56,360,'store','fetchedAt + info + history + earnings + peers. Gitignored.'),
  n('fredCache','FRED cache','.cache/fred/macro.json',436,360,'store','Write-through when FRED_API_KEY is set. Missing key is absent, not a fixture.'),
  n('ttl','Freshness','Same UTC day or TTL seconds',816,360,'service','Stale-within-TTL hits skip the network. refresh:true forces a pull.'),
  n('reject','Empty payload','HTTP 502',1196,360,'failure','Do not invent rows. Tests mock yfinance and FRED; they do not ship a demo fixture pack.'),
  n('tools','Research tools','Earnings · peers · returns · macro',56,624,'service','Deterministic math over cached payloads.'),
  n('conflicts','Conflict rows','Structured · pre-LLM',436,624,'service','Cross-dimension only. Keyword scans over free text are out.'),
  n('ground','Grounding corpus','Snapshot + FRED JSON',816,624,'service','Cite-or-abstain against cached values. No vector query.'),
  n('consumer','Note + UI panels','Indicators always · note optional',1196,624,'service','Workbench shows numbers even when no model is reachable.'),
 ],
 edges:[
  e('yahoo','industry','sector / cap band',{labelAt:[346,136]}),
  e('yahoo','spy','benchmark history',{via:[[176,48],[936,48]],labelAt:[556,40]}),
  e('yahoo','snap','write issuer',{ports:'down',labelAt:[176,248]}),
  e('industry','snap','cache peers',{ports:'down',labelAt:[346,248]}),
  e('spy','snap','cache SPY',{ports:'down',labelAt:[726,248]}),
  e('fredSrc','fredCache','write series',{ports:'down',labelAt:[1106,248]}),
  e('yahoo','reject','empty history',{kind:'control',via:[[176,280],[1316,280]],labelAt:[746,272]}),
  e('fredSrc','reject','empty series when keyed',{kind:'control',labelAt:[1316,136]}),
  e('snap','ttl','fetchedAt',{labelAt:[346,424]}),
  e('fredCache','ttl','fetchedAt',{labelAt:[726,424]}),
  e('ttl','tools','fresh payload',{ports:'down',labelAt:[176,536]}),
  e('fredCache','tools','macro payload',{ports:'down',via:[[556,520],[176,520]],labelAt:[360,512]}),
  e('tools','conflicts','tool JSON',{labelAt:[346,688]}),
  e('tools','ground','values',{via:[[176,752],[936,752]],labelAt:[556,744]}),
  e('conflicts','consumer','rows always',{labelAt:[726,688]}),
  e('ground','consumer','cited note or omit',{labelAt:[1106,688]}),
 ]};
}

function advisoryCapability(frame:FrameMapping,step:number):Diagram {
 const process=frame.architecture.process;
 const entitled=frame.architecture.ai[0]??{detail:'Accepted briefing excerpts and research snapshot fields. Off Inspection.'};
 const rules=frame.architecture.ai[1]??{detail:'Concentration, single-name cap, and missing IPS fields. Not an LLM.'};
 const synth=frame.architecture.ai[2]??{detail:'The Studio model chain drafts a meeting brief. Defense inspects this hop only.'};
 const xs=[56,436,816,1196];
 const focus=step===0?'holdings':step===1?'entitled':step===2?'suitability':'gate';
 return {title:'Client advisory · capability',note:'Live path is presenter-entered holdings, entitled briefing + research, CPU suitability rules, then one model hop on the Studio model chain (Sparky vLLM on an NVIDIA DGX Spark dev box; the hosted OpenAI API only with AI Defense enforcing). Cisco AI Defense inspects model hops only. Entitled assembly, holdings fetch, suitability, and grounding stay off Inspection. This map does not assert live Yahoo, FRED, or model availability. Demo brief — not advice. No household catalog.',width:1520,height:940,
 boundaries:[
  {title:'Business process',x:28,y:16,width:1464,height:220},
  {title:'Entitled context / holdings / suitability · no Inspection',x:28,y:252,width:1464,height:220},
  {title:'Model-chain hop · AI Defense on synthesis',x:28,y:488,width:1464,height:220},
  {title:'Advisor accept-gate · dev model host',x:28,y:724,width:1464,height:192},
 ],
 nodes:[
  ...process.map((p,i)=>n('p'+i,p.title,p.detail,xs[i]??56+i*380,56,'human')),
  n('holdings','Live holdings','Ticker + weight rows',56,300,'human','Presenter-entered. No Carter-household CRM and no product fixture pack.'),
  n('entitled','Entitled context','Accepted briefing + note',436,300,'service',entitled.detail),
  n('suitability','Suitability rules','CPU · not an LLM',816,300,'service',rules.detail),
  n('metrics','Holding metrics','Yahoo cache · live',1196,300,'service','Same snapshot cache as research. Empty holdings fetch fails closed.'),
  n('grounding','Grounding verifier','Briefing excerpts + snapshot',56,536,'service','Cite-or-abstain against posted briefing excerpts and cached holding fields. Off Inspection.'),
  n('nim','Model-chain brief','LangChain · Sparky → OpenAI',436,536,'ai',synth.detail),
  n('defense','Cisco AI Defense','Model hops only',816,536,'cisco','Inspects brief input and output. Entitled assembly, suitability, holdings, and grounding never enter Inspection.',sources.defense.url),
  n('omit','Brief omitted','Holdings still release',1196,536,'failure','No reachable model, a refused hosted call, inspection deny, or ungrounded-only claims drop the meeting brief. Holding metrics and suitability rows remain.'),
  n('fail','Empty holdings fetch','HTTP 502',56,772,'failure','If every holding ticker returns empty market data, the request fails closed.'),
  n('observe','Splunk Agent Observability','Galileo SDK · optional',436,772,'cisco','GalileoAsyncCallback on the model hop when GALILEO_API_KEY is set. Configuration only. Not a dashboard claim. Not a local topic judge.',sources.splunk.url),
  n('compute','Sparky (DGX Spark) host','Dev box · Cisco AI POD proposed',816,772,'service','Same dev host as research: vLLM on an NVIDIA DGX Spark (GB10) at 127.0.0.1:8003, not Cisco hardware. Client data reaches the hosted OpenAI fallback only with AI Defense forced to enforce. Cisco UCS / AI POD is the proposed placement, not a sized BOM.',sources.cisco.url),
  n('gate','Accept meeting brief','Advisor-owned store',1196,772,'human','Stored at fsi-demo-studio.advisory-brief only after this click.'),
 ],
 edges:[
  ...process.slice(0,-1).map((_,i)=>e('p'+i,'p'+(i+1),'next step')),
  e('p'+Math.min(step,Math.max(process.length-1,0)),focus,step===0?'enter holdings':step===1?'assemble context':step===2?'run rules':'review brief',{ports:'down',labelAt:step===0?[176,248]:step===1?[556,248]:step===2?[936,248]:[1316,248]}),
  e('holdings','metrics','live fetch / cache',{via:[[176,428],[1316,428]],labelAt:[746,420]}),
  e('entitled','suitability','accepted context',{labelAt:[726,364]}),
  e('metrics','suitability','weights + names',{labelAt:[1106,364]}),
  e('holdings','fail','all tickers empty',{ports:'down',kind:'control',labelAt:[176,466]}),
  e('suitability','nim','findings',{ports:'down',labelAt:[746,466]}),
  e('entitled','nim','excerpts + note',{ports:'down',via:[[556,480],[556,536]],labelAt:[500,508]}),
  e('metrics','nim','holding metrics',{ports:'down',via:[[1316,480],[556,480]],labelAt:[930,472]}),
  e('entitled','grounding','briefing excerpts',{via:[[556,448],[176,448]],labelAt:[360,440]}),
  e('metrics','grounding','snapshot fields',{via:[[1316,400],[176,400]],labelAt:[746,392]}),
  e('nim','defense','inspect hop',{kind:'control',labelAt:[726,600]}),
  e('defense','omit','deny / unavailable',{kind:'control',labelAt:[1106,600]}),
  e('nim','omit','no model up',{kind:'control',via:[[556,664],[1316,664]],labelAt:[930,656]}),
  e('nim','grounding','draft brief',{ports:'left',labelAt:[346,600]}),
  e('grounding','omit','ungrounded-only',{kind:'control',via:[[176,664],[1316,664]],labelAt:[500,656]}),
  e('grounding','gate','cited brief',{ports:'down',via:[[176,836],[1316,836]],labelAt:[746,828]}),
  e('nim','observe','optional spans',{kind:'telemetry',ports:'down',labelAt:[556,702]}),
  e('nim','compute','dev host',{kind:'placement',via:[[556,740],[936,740]],labelAt:[746,732]}),
  ...(process[3]?[e('gate','p3','after accept',{ports:'up',via:[[1316,748],[1436,748],[1436,184]],labelAt:[1400,200]})]:[]),
 ]};
}

export function advisoryRuntime():Diagram {
 return {title:'Client advisory · implemented request path',note:'Code-verified path: the workbench posts presenter holdings plus optional accepted briefing and research payloads. FastAPI on :8014 loads live holding metrics from the Yahoo cache, runs suitability rules, and may ask the Studio model chain for a meeting brief: Sparky vLLM at 127.0.0.1:8003 (an NVIDIA DGX Spark dev box), else the hosted OpenAI API only with AI Defense forced to enforce. Cisco AI Defense inspects model hops only. Entitled assembly, holdings, suitability, and grounding never enter Inspection. This map does not assert live Yahoo, FRED, or model availability. Demo brief — not advice. No household catalog.',width:1520,height:1440,
 boundaries:[
  {title:'Studio adapter · FastAPI :8014',x:28,y:16,width:1464,height:220},
  {title:'Entitled context + live holdings · no Inspection',x:28,y:252,width:1464,height:220},
  {title:'Suitability rules · CPU · no Inspection',x:28,y:488,width:1464,height:220},
  {title:'Model-chain meeting brief · Defense on hop',x:28,y:724,width:1464,height:220},
  {title:'Ground + advisor accept-gate · holdings stay if brief omitted',x:28,y:960,width:1464,height:220},
  {title:'Optional observability · dev model host · Cisco AI POD proposed',x:28,y:1196,width:1464,height:220},
 ],
 nodes:[
  n('user','Advisor / studio','Holdings + optional notes',56,64,'human','Ticker and weight rows. No household catalog and no CRM catalog.'),
  n('api','FastAPI /advisory/brief','POST /api/wealth/advisory/brief',436,64,'service','Browser may post accepted briefing and research payloads. The sidecar does not open briefing EDGAR.'),
  n('holdingsIn','Holdings editor','Weights as fractions',816,64,'human','Presenter-owned. Weights above 1.5 are treated as percents.'),
  n('posted','Posted context','Optional briefing + note',1196,64,'store','Entitled only if already accepted in the studio. Clearing the company profile does not wipe this brief.'),
  n('briefingCtx','Accepted briefing','Theme excerpts',56,300,'service','Objectives, risks, and other posted facts. Off Inspection.'),
  n('researchCtx','Accepted research note','Snapshot fields',436,300,'service','Ticker, conflicts, and cited note if the presenter accepted research.'),
  n('liveMetrics','Holding metrics','Yahoo cache / live',816,300,'service','Same get_snapshot path as research. One empty ticker is marked absent; all empty is HTTP 502.'),
  n('metricsFail','Holdings fetch failed','HTTP 502',1196,300,'failure','No invented positions or returns.'),
  n('suitability','Suitability rules','Concentration · IPS',56,536,'service','Single-name cap and missing IPS fields. Rules, not an LLM. Off Inspection.'),
  n('ips','IPS notes','Presenter text',436,536,'human','Missing objective, risk, or horizon becomes a finding.'),
  n('assemble','Context assembly','Holdings + entitled + findings',816,536,'service','CPU assembly. Not a vector index and not sent to Inspection.'),
  n('rows','Holdings + findings','Always release when fetch succeeds',1196,536,'service','The meeting brief may drop; these rows stay.'),
  n('nim','ProtectedChatOpenAI','Temperature 0 · ainvoke',56,772,'ai','Same chain client as research. A hosted backend forces AI Defense to enforce; without AI Defense the hosted call is refused. Advisor-owned; no auto-trade.'),
  n('defense','Cisco AI Defense','Inspect every model hop',436,772,'cisco','src_app fsi-ai-studio-wealth. Suitability and entitled assembly never enter Inspection.',sources.defense.url),
  n('model','Studio model chain','Sparky vLLM → OpenAI API',816,772,'ai','Sparky serves Nemotron Super through vLLM at 127.0.0.1:8003. If its health probe fails, the OpenAI API answers under enforced AI Defense and the brief records served_by.'),
  n('omit','Brief omitted','Holdings remain',1196,772,'failure','No reachable model, a refused hosted call, inspection deny/unavailable, timeout, or ungrounded-only claims.'),
  n('grounding','Grounding verifier','Excerpts + snapshot values',56,1008,'service','Cite-or-abstain against posted briefing excerpts and cached holding fields. Off Inspection.'),
  n('gate','Accept meeting brief','Advisor accept-gate',436,1008,'human','Stored at fsi-demo-studio.advisory-brief only after this click.'),
  n('store','localStorage brief','After accept only',816,1008,'store','Separate key from the company profile and the research note.'),
  n('galileo','Splunk Agent Observability','Galileo SDK · optional',1196,1008,'service','GalileoAsyncCallback on advisory model hops when GALILEO_API_KEY is set. Configuration is not dashboard proof. This is not a local topic judge.',sources.splunk.url),
  n('splunk','Splunk OTLP export','Official LangChain OTEL',56,1244,'service','Additional traces and metrics only when SPLUNK_REALM + SPLUNK_ACCESS_TOKEN or OTLP endpoints are set. Not a dashboard claim.',sources.splunk.url),
  n('output','Demo brief','Not advice',436,1244,'human','Server attaches the disclaimer. The advisor owns every recommendation.'),
  n('compute','Sparky (DGX Spark) host','Dev box · Cisco AI POD proposed',816,1244,'service','vLLM on an NVIDIA DGX Spark (GB10) dev box at 127.0.0.1:8003, not Cisco hardware. Cisco UCS / AI POD is the proposed production placement. Not a sized Cisco BOM.',sources.cisco.url),
  n('disclaimer','Not advice banner','Visible on the workbench',1196,1244,'human','Demo brief — not advice.'),
 ],
 edges:[
  e('user','api','POST holdings',{labelAt:[346,128]}),
  e('api','holdingsIn','validate rows',{labelAt:[726,128]}),
  e('api','posted','optional payloads',{via:[[556,48],[1316,48]],labelAt:[930,40]}),
  e('posted','briefingCtx','accepted briefing',{ports:'down',via:[[1316,248],[176,248]],labelAt:[746,240]}),
  e('posted','researchCtx','accepted note',{ports:'down',labelAt:[726,248]}),
  e('holdingsIn','liveMetrics','each ticker',{ports:'down',labelAt:[1106,248]}),
  e('liveMetrics','metricsFail','all empty',{kind:'control',labelAt:[1106,364]}),
  e('briefingCtx','assemble','excerpts',{via:[[176,500],[936,500]],labelAt:[556,492]}),
  e('researchCtx','assemble','note fields',{ports:'down',labelAt:[556,466]}),
  e('liveMetrics','assemble','metrics',{labelAt:[1106,466]}),
  e('liveMetrics','suitability','weights',{via:[[936,464],[176,464]],labelAt:[556,456]}),
  e('ips','suitability','IPS text',{ports:'left',labelAt:[346,600]}),
  e('suitability','rows','findings',{via:[[176,664],[1316,664]],labelAt:[746,656]}),
  e('assemble','rows','holdings stay',{labelAt:[1106,600]}),
  e('assemble','nim','context JSON',{ports:'down',via:[[936,720],[176,720]],labelAt:[556,712]}),
  e('suitability','nim','findings',{ports:'down',labelAt:[176,702]}),
  e('rows','omit','brief may drop',{ports:'down',kind:'control',labelAt:[1316,702]}),
  e('nim','model','ainvoke',{via:[[176,740],[936,740]],labelAt:[556,732]}),
  e('nim','defense','inspect input / output',{kind:'control',labelAt:[346,836]}),
  e('model','defense','inspect hop',{kind:'control',labelAt:[726,836]}),
  e('defense','omit','deny / unavailable',{kind:'control',labelAt:[1106,836]}),
  e('model','omit','no model / timeout',{kind:'control',labelAt:[1106,772]}),
  e('nim','grounding','draft brief',{ports:'down',labelAt:[176,940]}),
  e('briefingCtx','grounding','excerpts',{via:[[176,992],[176,1008]],labelAt:[120,996]}),
  e('liveMetrics','grounding','snapshot fields',{via:[[936,1004],[176,1004]],labelAt:[556,996]}),
  e('rows','grounding','released rows',{via:[[1316,980],[176,980]],labelAt:[746,972]}),
  e('grounding','gate','cited brief',{labelAt:[346,1072]}),
  e('grounding','omit','ungrounded-only',{kind:'control',via:[[176,940],[1316,940]],labelAt:[746,932]}),
  e('liveMetrics','metricsFail','502 holdings',{kind:'control',via:[[936,1140],[1316,1140]],labelAt:[1126,1132]}),
  e('api','galileo','optional traces',{kind:'telemetry',via:[[556,210],[1316,210],[1316,1008]],labelAt:[1400,620]}),
  e('nim','galileo','model hop callbacks',{kind:'telemetry',via:[[176,1148],[1316,1148]],labelAt:[746,1140]}),
  e('gate','store','Accept meeting brief',{labelAt:[726,1072]}),
  e('store','output','after accept',{ports:'down',labelAt:[936,1188]}),
  e('output','disclaimer','visible banner',{labelAt:[726,1308]}),
  e('api','splunk','optional spans',{ports:'down',kind:'telemetry',via:[[556,210],[176,210],[176,1244]],labelAt:[200,210]}),
  e('nim','splunk','synthesis spans',{kind:'telemetry',via:[[176,1188],[176,1244]],labelAt:[200,1210]}),
  e('model','compute','dev host :8003',{kind:'placement',ports:'down',labelAt:[936,1188]}),
 ]};
}

export function advisoryKnowledge():Diagram {
 return {title:'Client advisory · implemented entitled context',note:'Holdings are presenter-entered. Briefing excerpts and the research snapshot are entitled only after their own accept-gates. No household CRM catalog, no vector index, and no Tavily. This map does not assert live Yahoo or model availability.',width:1520,height:860,
 boundaries:[
  {title:'Presenter inputs · not a household catalog',x:28,y:16,width:1464,height:220},
  {title:'Entitled studio context · separate accept-gates',x:28,y:280,width:1464,height:220},
  {title:'Rules + consumers · not embeddings',x:28,y:544,width:1464,height:292},
 ],
 nodes:[
  n('editor','Holdings editor','Ticker + weight',56,72,'human','Live rows only. No household catalog and no product fixtures.'),
  n('notes','IPS notes','Objective / risk / horizon',436,72,'human','Missing fields become suitability findings.'),
  n('yahoo','Yahoo cache','Same wealth snapshots',816,72,'store','Holding metrics reuse services/wealth/.cache/snapshots.'),
  n('reject','Empty ticker','Mark absent or 502',1196,72,'failure','Do not invent a return or P/E.'),
  n('briefing','Accepted briefing','localStorage company-profile',56,360,'store','Posted to /advisory/brief. The sidecar does not call EDGAR.'),
  n('research','Accepted research note','localStorage research-note',436,360,'store','Separate key. Clearing the company profile does not wipe it.'),
  n('excerpts','Briefing excerpts','Theme facts + citations',816,360,'store','Used as grounding corpus for the meeting brief.'),
  n('prompt','Prompt to accept','No silent entitlement',1196,360,'human','The UI asks the presenter to accept briefing and research when they are missing.'),
  n('rules','Suitability rules','Concentration · IPS',56,624,'service','CPU. Off Inspection.'),
  n('metrics','Holding metrics','1Y vs SPY · P/E',436,624,'service','From the cached snapshot, not an LLM.'),
  n('ground','Grounding corpus','Excerpts + snapshot JSON',816,624,'service','Cite-or-abstain. No vector query.'),
  n('consumer','Brief + UI rows','Holdings always · brief optional',1196,624,'service','Workbench shows holdings if no model is reachable.'),
 ],
 edges:[
  e('editor','yahoo','fetch / cache',{labelAt:[346,136]}),
  e('yahoo','reject','empty snapshot',{kind:'control',labelAt:[1106,136]}),
  e('notes','rules','IPS text',{ports:'down',labelAt:[346,248]}),
  e('editor','rules','weights',{ports:'down',via:[[176,248],[176,624]],labelAt:[120,248]}),
  e('briefing','excerpts','posted facts',{labelAt:[346,424]}),
  e('research','excerpts','accepted note',{labelAt:[726,424]}),
  e('briefing','prompt','not accepted',{kind:'control',via:[[176,280],[1316,280]],labelAt:[746,272]}),
  e('research','prompt','not accepted',{kind:'control',via:[[556,500],[1316,500]],labelAt:[930,492]}),
  e('yahoo','metrics','snapshot',{ports:'down',via:[[936,248],[556,248],[556,624]],labelAt:[556,248]}),
  e('rules','consumer','findings',{labelAt:[346,688]}),
  e('metrics','consumer','holding rows',{labelAt:[726,688]}),
  e('excerpts','ground','corpus',{ports:'down',labelAt:[936,536]}),
  e('ground','consumer','cited brief or omit',{labelAt:[1106,688]}),
 ]};
}

type Profile={entry:string;router:string;left:string;leftDetail:string;right:string;rightDetail:string;store:string;tool:string;result:string;gate:string;failure:string;ingest:string;gpu:string;note:string};
export const profiles:Record<string,Profile>={
 'brahe-bank':{entry:'Banking question',router:'Bank supervisor',left:'Product specialist',leftDetail:'Retrieve terms and criteria',right:'Score specialist',rightDetail:'Call mock score tool',store:'Product document index',tool:'Mock score API · 550',result:'Eligibility explanation',gate:'Customer review · no approval',failure:'Missing evidence → abstain',ingest:'Versioned product Markdown',gpu:'Product embeddings + model inference',note:'Proposed hosted-model replacement; preserve tool behavior and validate model compatibility before migration.'},
 'kyc-processing':{entry:'Onboarding document case',router:'Case verification workflow',left:'Document extraction',leftDetail:'OCR → fields + evidence locations',right:'Entity reconciliation',rightDetail:'Registry and screening checks',store:'Identity documents + policy index',tool:'Registry / sanctions APIs',result:'Cited discrepancy summary',gate:'Analyst approves onboarding',failure:'Mismatch / missing file → review',ingest:'Documents + versioned KYC policy',gpu:'Document OCR + summary inference',note:'Identity checks and registry authorization remain deterministic services. An LLM does not approve onboarding.'},
 'sar-support':{entry:'Alert or fraud referral',router:'SAR investigation service',left:'Investigation Deep Agent',leftDetail:'Case tools · untrusted text inspected first',right:'Typology rules + citation verifier',rightDetail:'Deterministic · not an LLM',store:'Synthetic case file · minimized KYC',tool:'Case data tools + allowlisted adverse media',result:'Cited FinCEN-style narrative',gate:'Investigator decides · separate QA approves',failure:'Unverified sentence → dropped',ingest:'Synthetic case fixtures + fraud handoff',gpu:'Studio model chain: Sparky vLLM on an NVIDIA DGX Spark dev box, else the OpenAI API under enforced AI Defense; Cisco UCS / AI POD proposed',note:'Deterministic typology rules and a cite-or-drop verifier around one agent. Agent Control denies filing without a separate QA approval and denies customer contact. E-filing is simulated; no automatic filing or implied regulatory compliance.'},
 'client-advisory':{entry:'Presenter holdings + entitled context',router:'Wealth advisory sidecar',left:'Entitled briefing + research',leftDetail:'Accepted studio context only · no CRM catalog',right:'Suitability rules',rightDetail:'Concentration / IPS · not an LLM',store:'Accepted note + briefing excerpts',tool:'Live holding metrics via Yahoo cache',result:'Meeting brief draft',gate:'Accept meeting brief',failure:'Empty holdings fetch → 502; ungrounded brief omitted',ingest:'Presenter holdings + accepted studio context',gpu:'Studio model chain: Sparky vLLM at 127.0.0.1:8003 on an NVIDIA DGX Spark dev box, else the OpenAI API under enforced AI Defense; Cisco UCS / AI POD proposed',note:'Entitled context assembly and suitability rules stay off Inspection. The Studio model chain drafts a meeting brief; the advisor accept-gate owns it. Demo brief — not advice. No household catalog and no auto-trade.'},
 'market-research':{entry:'Ticker + optional refresh',router:'Wealth research sidecar',left:'Yahoo + FRED cache',leftDetail:'Allowlisted fetch · write-through TTL',right:'Conflict + synthesis tools',rightDetail:'CPU conflicts · cited note from the model chain',store:'Snapshot + FRED cache · not a vector index',tool:'Earnings / peers / returns / macro',result:'Cited research note + demo recommendation',gate:'Accept research note',failure:'Empty provider → 502; ungrounded note omitted',ingest:'Live Yahoo + FRED allowlist',gpu:'Studio model chain: Sparky vLLM at 127.0.0.1:8003 on an NVIDIA DGX Spark dev box, else the OpenAI API; Cisco UCS / AI POD proposed',note:'Write-through snapshot cache, structured conflicts, and one model-chain hop. Demo recommendation — not financial advice. This map does not assert live Yahoo, FRED, or model availability. No Tavily and no committed snapshot pack.'},
 'transaction-llm':{entry:'Payment event',router:'Schema validation + routing',left:'Payment extraction model',leftDetail:'Unstructured text → proposed fields',right:'Entity resolution service',rightDetail:'Match counterparties + code sets',store:'Reference codes + counterparty master',tool:'History / entity lookup APIs',result:'Schema-validated enrichment',gate:'Low confidence → operations',failure:'Invalid schema → quarantine',ingest:'Versioned codes + entity reference data',gpu:'Batched extraction; benchmark CPU alternative',note:'Deterministic validation gates publication. Only exceptions need agentic reasoning; no LLM in the payment authorization path.'},
 'fraud-modeling':{entry:'Payment features',router:'Fraud scoring endpoint',left:'Versioned fraud model',leftDetail:'Bounded scoring inference',right:'Drift investigation agent',rightDetail:'Asynchronous cohort analysis',store:'Online feature store + model registry',tool:'Labels / cohort analytics APIs',result:'Risk score + rule decision',gate:'Owner approves model changes',failure:'Timeout → configured rules fallback',ingest:'Events → features; delayed labels',gpu:'Scorer only if benchmark justifies it; explainer separate',note:'The synchronous score path bypasses the LLM. Drift analysis is asynchronous; no automatic model promotion.'},
 'company-briefing':{entry:'Ticker, name, or uploaded report',router:'Deep Agent supervisor',left:'Theme subagents',leftDetail:'Read TOC nodes; never dump the 10-K',right:'Grounding verifier',rightDetail:'Cite-or-abstain against node files',store:'Filing node files · not embeddings',tool:'EDGAR + companyfacts APIs',result:'Cited company briefing',gate:'Presenter accept-gate',failure:'Unknown issuer / ungrounded themes → stop',ingest:'EDGAR 10-K or uploaded annual report',gpu:'Protected model hops only; no filing embeddings',note:'Navigation-first Deep Agent. No vector index and no open web. AI Defense inspects model hops only; XBRL, EDGAR, upload, navigator, and grounding stay off Inspection. Presenter accepts before studio context is stored.'},
};
export function proposedRuntime(id:string):Diagram {
 if(id==='brahe-bank') {
   const graph=bankingRuntime();
   const replacements:Record<string,Partial<DiagramNode>>={
     api:{subtitle:'Proposed identity + inspected calls',detail:'Retain the FastAPI adapter and specialist handoffs; add authenticated subject scoping, persistence and instrumented model boundaries. See Security & telemetry for exact inspection verdict handling.'},
     state:{title:'Persistent checkpoints',subtitle:'Scoped session / durable state',detail:'Replace InMemorySaver with a supported persistent checkpointer. Retention and encryption are deployment decisions.'},
     model:{title:'Private model endpoint',subtitle:'Compatible model on UCS GPU',detail:'Proposed replacement for ChatOpenAI hosted inference. Validate tool calling, handoff behavior and answer quality before switching. Security & telemetry shows inspection before and after each model call.'},
     docs:{title:'Product retrieval service',subtitle:'Private index + source metadata',detail:'Proposed private embedding / retrieval alternative. Product documents retain source IDs and permissions; do not silently migrate Pinecone or change indexing semantics.'},
   };
   return {...graph,title:'Brahe Bank · proposed execution',note:'Preserve supervisor and specialist behavior; replace hosted inference and in-memory state deliberately. All Cisco connections are proposed. See Security & telemetry and Deployment for the supporting paths.',boundaries:[{title:'PROPOSED APPLICATION SERVICES · CPU',x:350,y:20,width:1080,height:1020},{title:'PROPOSED MODEL, CONTROLS AND OBSERVABILITY SERVICES',x:350,y:1080,width:1080,height:220}],nodes:graph.nodes.map(node=>({...node,...replacements[node.id]})),edges:graph.edges};
 }
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
