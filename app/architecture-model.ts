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

const WX=[56,436,816,1196], WY=[64,300,536,772,1008,1244];
const wn=(id:string,title:string,subtitle:string,col:number,row:number,kind:NodeKind='service',detail=subtitle,source?:string)=>n(id,title,subtitle,WX[col],WY[row],kind,detail,source);
const SPARKY_DETAIL='Sparky is an NVIDIA DGX Spark (GB10) dev box serving vLLM at 127.0.0.1:8003. It is not Cisco hardware. Cisco UCS / AI POD is the proposed production placement, not a sized BOM.';

function researchCapability(frame:FrameMapping,step:number):Diagram {
 const process=frame.architecture.process;
 const pre=frame.architecture.ai[0]??{detail:'Agent Control blocks a restricted issuer before any data or model call; AI Defense inspects news as tool results.'};
 const agent=frame.architecture.ai[1]??{detail:'A Deep Agent supervisor with subagents on the Studio model chain.'};
 const verify=frame.architecture.ai[2]??{detail:'Unit-aware checks against the cited field or quote; the strategist decides.'};
 const focus=step===0?'precheck':step===1?'nim':step===2?'grounding':'gate';
 return {title:'House-view update · capability',note:'An earnings event on a covered name: Agent Control pre-checks the restricted list, AI Defense inspects news as tool results, a research Deep Agent on the Studio model chain (Sparky vLLM on an NVIDIA DGX Spark dev box, else the OpenAI API) drafts a cited update, code verifies every claim, and the strategist publishes under research.publish. The AI sets no rating. This map does not assert live Yahoo, FRED, or model availability. Not investment advice.',width:1520,height:940,
 boundaries:[
  {title:'Business process',x:28,y:16,width:1464,height:220},
  {title:'Policy pre-check · evidence · tool-result inspection',x:28,y:252,width:1464,height:220},
  {title:'Research Deep Agent · AI Defense on model hops',x:28,y:488,width:1464,height:220},
  {title:'Verify · publish · dev model host · telemetry',x:28,y:724,width:1464,height:192},
 ],
 nodes:[
  ...process.map((p,i)=>n('p'+i,p.title,p.detail,WX[i]??56+i*380,56,'human')),
  n('precheck','Restricted-list pre-check','Agent Control · research.precheck',56,300,'cisco',pre.detail),
  n('evidence','Evidence','House view · event · 10-K · snapshots',436,300,'store','Fictional HCYN fixtures, committed snapshots, and the same-day Yahoo + FRED cache for real tickers.'),
  n('news','Allowlisted news','Inspected as tool results',816,300,'service','Each item goes to AI Defense before the agent sees it; a flagged item is withheld and shown.'),
  n('blocked','Blocked issuer','No data, no model call',1196,300,'failure','A restricted issuer stops at the pre-check; the timeline shows the policy verdict.'),
  n('nim','Research Deep Agent','Supervisor + subagents',56,536,'ai',agent.detail),
  n('defense','Cisco AI Defense','Model hops + tool results',436,536,'cisco','Inspects model input and output and screens untrusted news. Calc tools and the verifier never enter Inspection.',sources.defense.url),
  n('grounding','Claim verifier','Code · not an LLM',816,536,'service',verify.detail),
  n('omit','Fallback tiers','Single call → fixture summary',1196,536,'failure','If the agent fails, one drafting call; with no model, a code-written fixture summary. The browser can replay a recorded run.'),
  n('gate','Strategist publishes','research.publish policies',56,772,'human','Only verified claims reach advisors. Agent Control evaluates the publish policies; the local policy check is labelled when it is not reachable.'),
  n('observe','Splunk Agent Observability','Galileo SDK · optional',436,772,'cisco','Tool and model spans when configured. Configuration only, not a dashboard claim.',sources.splunk.url),
  n('compute','Sparky (DGX Spark) host','Dev box · Cisco AI POD proposed',816,772,'service',SPARKY_DETAIL+' When it is down the chain answers from the OpenAI API and the update names the model.',sources.cisco.url),
  n('handoff','Prepare client meeting','Handoff to meeting prep',1196,772,'human','The published update is context for the advisor’s meeting prep.'),
 ],
 edges:[
  ...process.slice(0,-1).map((_,i)=>e('p'+i,'p'+(i+1),'next step')),
  e('p'+Math.min(Math.max(step,0),Math.max(process.length-1,0)),focus,step===0?'pre-check':step===1?'draft':step===2?'verify':'publish',{ports:'down'}),
  e('precheck','evidence','allowed'),
  e('precheck','blocked','restricted',{kind:'control',via:[[176,450],[1316,450]]}),
  e('news','defense','inspect tool result',{kind:'control',ports:'down'}),
  e('evidence','nim','tools',{ports:'down'}),
  e('nim','defense','inspect hop',{kind:'control'}),
  e('nim','grounding','draft claims',{via:[[176,690],[936,690]]}),
  e('nim','omit','agent failed',{kind:'control',via:[[176,500],[1316,500]]}),
  e('grounding','gate','verified claims',{ports:'down',via:[[936,740],[176,740]]}),
  e('gate','handoff','published',{via:[[176,900],[1316,900]]}),
  e('nim','observe','optional spans',{kind:'telemetry',ports:'down'}),
  e('nim','compute','dev host',{kind:'placement',via:[[176,716],[936,716]]}),
 ]};
}

export function researchRuntime():Diagram {
 return {title:'House-view update · implemented request path',note:'Code-verified path: the studio posts a scenario (HCYN earnings, restricted KSTL, poisoned news, JPM bank) or a cached real ticker. FastAPI on :8014 runs the research.precheck policies, assembles evidence, screens news with AI Defense as tool results, then a deepagents supervisor with fundamentals, valuation, macro, and compliance-critic subagents drafts on the Studio model chain: Sparky vLLM at 127.0.0.1:8003 (an NVIDIA DGX Spark dev box), else the OpenAI API. Code verifies every claim; the AI sets no rating or target. Every tool, model call, guardrail, and decision streams to one run timeline. This map does not assert live Yahoo, FRED, or model availability. Not investment advice.',width:1520,height:1440,
 boundaries:[
  {title:'Studio adapter · FastAPI :8014 · Agent Control pre-check',x:28,y:16,width:1464,height:220},
  {title:'Evidence assembly · tool-result inspection',x:28,y:252,width:1464,height:220},
  {title:'Research Deep Agent · Defense on model hops',x:28,y:488,width:1464,height:220},
  {title:'Claim verifier · compliance scan · never-dead tiers',x:28,y:724,width:1464,height:220},
  {title:'Strategist publish · Agent Control · advisor handoff',x:28,y:960,width:1464,height:220},
  {title:'Run timeline · optional observability · dev model host',x:28,y:1196,width:1464,height:220},
 ],
 nodes:[
  wn('user','Strategist / studio','Scenario card or cached ticker',0,0,'human','Sam, CIO-office strategist. HCYN and KSTL are fictional issuers with synthetic data.'),
  wn('api','FastAPI /research/analyze','POST /api/wealth/research/analyze',1,0,'service','127.0.0.1:8014 behind the studio proxy. The map does not claim the sidecar is up.'),
  wn('precheck','Restricted-list pre-check','Agent Control · research.precheck',2,0,'cisco','Runs before any market data or model call. Hosted Agent Control when configured; otherwise a labelled local policy check.'),
  wn('blocked','Blocked issuer','No data · no model call',3,0,'failure','A restricted issuer returns its policy verdicts and nothing else.'),
  wn('fixtures','Issuer fixtures','House view · event · 10-K · book',0,1,'store','fixtures/halcyon: house view, earnings event, synthetic annual report, restricted list, and affected households. Labelled synthetic.'),
  wn('cache','Market snapshots','Committed snapshot · same-day cache',1,1,'store','Real tickers use the Yahoo + FRED write-through cache, then a committed snapshot. Banks read P/B and ROE.'),
  wn('news','Allowlisted news feed','wire-a · trade-b · blog-c',2,1,'service','Each item is inspected before the agent sees it; the poisoned-news scenario carries an injected instruction.'),
  wn('withheld','Withheld item','Shown, never sent to the agent',3,1,'failure','A flagged news item is withheld with the rule that caught it.'),
  wn('nim','Deep Agent supervisor','deepagents · submit tool',0,2,'ai','Plans the update, calls tools once each, and finishes with submit_update. Step and time budgets bound every run.'),
  wn('subagents','Subagents','Fundamentals · valuation · macro · critic',1,2,'ai','Delegated through the task tool; each delegation streams to the timeline. The compliance critic only has check_draft.'),
  wn('tools','Calc + evidence tools','Valuation · filing search · households',2,2,'service','Deterministic code over the assembled evidence. Off Inspection.'),
  wn('model','Studio model chain','Sparky vLLM → OpenAI API',3,2,'ai','Sparky serves Nemotron Super through vLLM at 127.0.0.1:8003. If its health probe fails, the OpenAI API answers and the update records served_by.'),
  wn('grounding','Claim verifier','Field values + quotes · unit-aware',0,3,'service','Each claim cites an evidence field or quote. Numbers must match within their unit; quoted sentences may not add facts. Struck claims are shown with the reason.'),
  wn('scan','Compliance scan','No rating, target, or guarantee',1,3,'service','Code scan for ratings, price targets, and guarantees. Flags become policy verdicts, not silent rewrites.'),
  wn('defense','Cisco AI Defense','Model hops + tool results',2,3,'cisco','src_app fsi-ai-studio-wealth. Inspects model input and output and untrusted news. Calc tools and the verifier never enter Inspection.',sources.defense.url),
  wn('omit','Never-dead tiers','Single call → fixture summary',3,3,'failure','Agent failure falls back to one drafting call; no model falls back to a code-written summary. The browser replays a recorded golden run when the service is down.'),
  wn('gate','Strategist publishes','Human approval',0,4,'human','Sam approves or rejects. Only verified claims are published; the AI never sets the house-view rating.'),
  wn('control','Agent Control','research.publish policies',1,4,'cisco','Issuer not restricted, no rating or target, no guarantee, claims verified, strategist approved. Hosted when configured; otherwise labelled local.'),
  wn('store','Published update','Advisor desk · studio context',2,4,'store','Stored for the advisor only after it is published.'),
  wn('handoff','Prepare client meeting','Opens meeting prep',3,4,'human','The published update becomes context in the advisor’s meeting prep.'),
  wn('galileo','Splunk Agent Observability','Galileo SDK · optional',0,5,'service','Galileo tool and model spans when GALILEO_API_KEY is set. Configuration is not dashboard proof.',sources.splunk.url),
  wn('splunk','Splunk OTLP export','Official LangChain OTEL',1,5,'service','Traces and metrics only when SPLUNK_REALM + SPLUNK_ACCESS_TOKEN or OTLP endpoints are set.',sources.splunk.url),
  wn('compute','Sparky (DGX Spark) host','Dev box · Cisco AI POD proposed',2,5,'service',SPARKY_DETAIL,sources.cisco.url),
  wn('timeline','Run timeline','One event stream · recorded runs',3,5,'store','services/common/runs.py: agent, tool, model, security, and human lanes. Golden runs replay the same events.'),
 ],
 edges:[
  e('user','api','POST scenario'),
  e('api','precheck','pre-check first'),
  e('precheck','blocked','restricted',{kind:'control'}),
  e('precheck','fixtures','allowed',{ports:'down',via:[[936,250],[176,250]]}),
  e('fixtures','cache','snapshot'),
  e('cache','news','feed'),
  e('news','withheld','flagged',{kind:'control'}),
  e('news','defense','inspect tool result',{kind:'control',ports:'down',via:[[936,480],[1080,480],[1080,772]]}),
  e('fixtures','nim','evidence',{ports:'down'}),
  e('nim','subagents','task'),
  e('subagents','tools','tool calls'),
  e('nim','model','supervisor turns',{via:[[176,690],[1316,690]]}),
  e('model','defense','inspect hop',{kind:'control',ports:'down'}),
  e('nim','defense','inspect input / output',{kind:'control',via:[[176,716],[936,716]]}),
  e('defense','omit','deny / unavailable',{kind:'control'}),
  e('model','omit','no model / timeout',{kind:'control',ports:'down',via:[[1400,700],[1400,772]]}),
  e('nim','grounding','submit_update claims',{ports:'down'}),
  e('grounding','scan','verified claims'),
  e('scan','gate','update + verdicts',{ports:'down',via:[[556,940],[176,940]]}),
  e('gate','control','approve'),
  e('control','store','allowed'),
  e('store','handoff','advisor'),
  e('api','galileo','optional traces',{kind:'telemetry',via:[[556,226],[1460,226],[1460,1190],[176,1190]]}),
  e('nim','galileo','tool + model spans',{kind:'telemetry',via:[[110,700],[110,1244]]}),
  e('api','splunk','optional spans',{kind:'telemetry',via:[[700,226],[700,1190],[556,1190]]}),
  e('model','compute','dev host :8003',{kind:'placement',via:[[1316,1170],[936,1170]]}),
  e('api','timeline','run events',{kind:'telemetry',via:[[760,236],[1480,236],[1480,1300]]}),
 ]};
}

export function researchKnowledge():Diagram {
 return {title:'House-view update · implemented evidence',note:'Every claim cites one evidence item: the house view, the earnings event, sections of the synthetic 10-K, screened news, valuation and returns from snapshots, or the household book. No vector index and no Tavily; the filing is searched by section. Real tickers use the same-day Yahoo + FRED cache, with no committed snapshot pack beyond the fixtures. This map does not assert live Yahoo or FRED availability.',width:1520,height:860,
 boundaries:[
  {title:'Synthetic fixtures · labelled on screen',x:28,y:16,width:1464,height:220},
  {title:'Market data · cache · screened news',x:28,y:280,width:1464,height:220},
  {title:'Evidence registry → verifier → published update',x:28,y:544,width:1464,height:292},
 ],
 nodes:[
  n('view','House view','CIO Office · rating + thesis',56,72,'store','The rating belongs to the CIO office. Thesis points and key risks decide whether an event needs review.'),
  n('event','Earnings event','EPS, revenue, guidance',436,72,'store','Synthetic Q3 FY2026 print for HCYN.'),
  n('filing','Synthetic 10-K','Sections, searched by heading',816,72,'store','fixtures/halcyon/annual-report-fy2025.html. Each section is its own evidence item.'),
  n('restricted','Restricted list','Agent Control pre-check',1196,72,'store','KSTL is restricted during a pending deal.'),
  n('snap','Snapshots','Committed · same-day cache',56,360,'store','Earnings history, returns vs SPY, and peer valuation. Banks use P/B and ROE.'),
  n('fredCache','FRED cache','Allowlisted series',436,360,'store','Macro context when FRED_API_KEY is set; absent otherwise.'),
  n('news','Screened news','Kept or withheld',816,360,'service','Allowlisted publishers only; AI Defense inspects each item as a tool result.'),
  n('book','Household book','Holders · concentration',1196,360,'store','Synthetic: how many households hold the name and how many are concentrated.'),
  n('registry','Evidence registry','Ids, fields with units, text',56,624,'service','Every field has a value, a unit, and a display string the verifier checks against.'),
  n('ground','Claim verifier','Field or quote · per claim',436,624,'service','✓ or ✗ per claim with the reason; struck claims stay visible.'),
  n('policy','Policy verdicts','research.precheck / publish',816,624,'service','Agent Control evaluates; the local policy check is labelled when used.'),
  n('consumer','Published update','Verified claims only',1196,624,'service','What meeting prep receives (simulated distribution).'),
 ],
 edges:[
  e('view','registry','house_view',{ports:'down',via:[[176,250],[90,250],[90,624]]}),
  e('event','registry','event',{ports:'down',via:[[556,260],[200,260],[200,600]]}),
  e('filing','registry','filing sections',{ports:'down',via:[[936,270],[260,270],[260,610]]}),
  e('restricted','policy','pre-check',{kind:'control',ports:'down',via:[[1316,240],[1460,240],[1460,520],[936,520]]}),
  e('snap','registry','valuation · returns',{ports:'down'}),
  e('fredCache','registry','macro',{ports:'down',via:[[556,520],[176,520]]}),
  e('news','registry','kept items',{ports:'down',via:[[936,530],[300,530]]}),
  e('book','registry','households',{ports:'down',via:[[1316,510],[320,510]]}),
  e('registry','ground','evidence'),
  e('ground','policy','verified claims'),
  e('policy','consumer','allowed'),
 ]};
}

function advisoryCapability(frame:FrameMapping,step:number):Diagram {
 const process=frame.architecture.process;
 const screen=frame.architecture.ai[0]??{detail:'AI Defense inspects CRM notes as tool results: PII is masked, an injected instruction is withheld.'};
 const rules=frame.architecture.ai[1]??{detail:'Code compares the risk profile with the portfolio and sizes each action in dollars.'};
 const agent=frame.architecture.ai[2]??{detail:'A meeting-prep Deep Agent drafts the brief; every statement is verified.'};
 const focus=step===0?'notes':step===1?'suitability':step===2?'nba':'gate';
 return {title:'Advisor meeting prep · capability',note:'A synthetic household: AI Defense screens CRM notes, code rules compare profile and portfolio under Reg BI care framing and size the next-best actions, a meeting-prep Deep Agent on the Studio model chain (Sparky vLLM on an NVIDIA DGX Spark dev box; the hosted OpenAI API only with AI Defense forced to enforce) drafts a checked brief, and a supervisor approves under advisory.recommendation. This map does not assert live Yahoo, FRED, or model availability. Not advice; nothing is executed.',width:1520,height:940,
 boundaries:[
  {title:'Business process',x:28,y:16,width:1464,height:220},
  {title:'Screened client context · rules · sized actions',x:28,y:252,width:1464,height:220},
  {title:'Meeting-prep Deep Agent · AI Defense on model hops',x:28,y:488,width:1464,height:220},
  {title:'Advisor and supervisor · dev model host · telemetry',x:28,y:724,width:1464,height:192},
 ],
 nodes:[
  ...process.map((p,i)=>n('p'+i,p.title,p.detail,WX[i]??56+i*380,56,'human')),
  n('notes','CRM notes screen','AI Defense on tool results',56,300,'cisco',screen.detail),
  n('suitability','Suitability rules','Code · Reg BI care',436,300,'service',rules.detail),
  n('nba','Next-best actions','Sized in dollars',816,300,'service','Unsuitable actions are excluded from the ranking and shown as such.'),
  n('household','Household record','Synthetic · test PII only',1196,300,'store','Profile, horizon, goals, holdings, and CRM notes. 000- SSNs and the 4111 test card only.'),
  n('nim','Meeting-prep Deep Agent','Planner + compliance reviewer',56,536,'ai',agent.detail),
  n('defense','Cisco AI Defense','Model hops · enforce on hosted',436,536,'cisco','Client data reaches a hosted model only with AI Defense forced to enforce; otherwise the brief is written by code and the data stays.',sources.defense.url),
  n('grounding','Brief verifier','Every statement checked',816,536,'service','Callouts must cite a finding; agenda lines and questions may not invent numbers.'),
  n('omit','Code-written brief','When no model may answer',1196,536,'failure','Fallback: one drafting call, then a brief written by code from the findings and actions.'),
  n('gate','Advisor → supervisor','advisory.recommendation',56,772,'human','The advisor submits; the supervisor approves. Agent Control denies guarantees, unsuitable actions, and trade or wire instructions.'),
  n('observe','Splunk Agent Observability','Galileo SDK · optional',436,772,'cisco','Tool and model spans when configured. Configuration only.',sources.splunk.url),
  n('compute','Sparky (DGX Spark) host','Dev box · Cisco AI POD proposed',816,772,'service',SPARKY_DETAIL+' Client data reaches the hosted OpenAI fallback only with AI Defense forced to enforce.',sources.cisco.url),
  n('record','CRM record','Nothing is executed',1196,772,'store','The approved brief is recorded; no trade, transfer, or message is sent.'),
 ],
 edges:[
  ...process.slice(0,-1).map((_,i)=>e('p'+i,'p'+(i+1),'next step')),
  e('p'+Math.min(Math.max(step,0),Math.max(process.length-1,0)),focus,step===0?'screen':step===1?'rules':step===2?'rank':'approve',{ports:'down'}),
  e('household','notes','CRM notes',{via:[[1316,450],[176,450]]}),
  e('household','suitability','profile + holdings',{via:[[1316,460],[556,460]]}),
  e('suitability','nba','findings'),
  e('notes','nim','screened notes',{ports:'down'}),
  e('nba','nim','ranked actions',{ports:'down',via:[[936,500],[176,500]]}),
  e('nim','defense','inspect hop',{kind:'control'}),
  e('defense','omit','deny / refused',{kind:'control',via:[[556,690],[1316,690]]}),
  e('nim','grounding','draft brief',{via:[[176,700],[936,700]]}),
  e('grounding','gate','checked brief',{ports:'down',via:[[936,740],[176,740]]}),
  e('gate','record','approved',{via:[[176,900],[1316,900]]}),
  e('nim','observe','optional spans',{kind:'telemetry',ports:'down'}),
  e('nim','compute','dev host',{kind:'placement',via:[[176,716],[936,716]]}),
 ]};
}

export function advisoryRuntime():Diagram {
 return {title:'Advisor meeting prep · implemented request path',note:'Code-verified path: the studio posts a household id with the published house-view update and the company briefing reference. FastAPI on :8014 loads the synthetic household, screens CRM notes with AI Defense as tool results (a local rule masks the 000- SSNs AI Defense does not flag), runs suitability rules, sizes next-best actions, then a meeting-prep Deep Agent drafts on the Studio model chain: Sparky vLLM at 127.0.0.1:8003 (an NVIDIA DGX Spark dev box), else the hosted OpenAI API only with AI Defense forced to enforce. Code verifies every statement; the advisor submits and a supervisor approves under advisory.recommendation. This map does not assert live Yahoo, FRED, or model availability. Not advice; nothing is executed.',width:1520,height:1440,
 boundaries:[
  {title:'Studio adapter · FastAPI :8014',x:28,y:16,width:1464,height:220},
  {title:'Screened client context · tool-result inspection',x:28,y:252,width:1464,height:220},
  {title:'Rules · sized actions · meeting-prep Deep Agent',x:28,y:488,width:1464,height:220},
  {title:'Brief verifier · egress policy · never-dead tiers',x:28,y:724,width:1464,height:220},
  {title:'Advisor and supervisor · Agent Control · CRM record',x:28,y:960,width:1464,height:220},
  {title:'Run timeline · optional observability · dev model host',x:28,y:1196,width:1464,height:220},
 ],
 nodes:[
  wn('user','Advisor / studio','Household + published update',0,0,'human','Jordan, advisor. Chuck Robbins’s public Cisco role is real; all demo financial profiles are hypothetical.'),
  wn('api','FastAPI /advisory/brief','POST /api/wealth/advisory/brief',1,0,'service','127.0.0.1:8014 behind the studio proxy. Entered holdings get rules only; a brief needs a household.'),
  wn('household','Household record','fixtures/households · synthetic',2,0,'store','Profile, horizon, goals, holdings, CRM notes. Test PII only.'),
  wn('posted','Posted context','House-view update · briefing',3,0,'store','The published update from research, or the recorded HCYN update when the client holds HCYN.'),
  wn('notes','CRM notes screen','Per-note inspection',0,1,'service','Every note is inspected before any model call.'),
  wn('defense','Cisco AI Defense','Tool results + model hops',1,1,'cisco','src_app fsi-ai-studio-wealth. Detects PII and prompt injection in notes and inspects every model hop; forced to enforce when client data goes to a hosted model.',sources.defense.url),
  wn('masked','Masked / withheld notes','PII masked · injection withheld',2,1,'failure','Masked by AI Defense spans or the labelled local rule; an injected instruction is withheld and flagged for the advisor.'),
  wn('metrics','Holding metrics','Snapshot cache',3,1,'service','Returns and sector from the same snapshots as research.'),
  wn('suitability','Suitability rules','Profile vs portfolio · Reg BI care',0,2,'service','Concentration against the profile cap, horizon and liquidity, affiliate restrictions. Code, not an LLM.'),
  wn('nba','Next-best actions','Catalogue · sized in dollars',1,2,'service','10b5-1 plan, rebalance, 529, ladder, estate review; unsuitable ones are excluded and shown.'),
  wn('nim','Meeting-prep Deep Agent','Planner + compliance reviewer',2,2,'ai','deepagents supervisor with check_brief and submit_brief tools. Step and time budgets bound every run.'),
  wn('model','Studio model chain','Sparky vLLM → OpenAI API',3,2,'ai','Sparky serves Nemotron Super through vLLM at 127.0.0.1:8003. If its health probe fails, the OpenAI API answers only under enforced AI Defense and the brief records served_by.'),
  wn('grounding','Brief verifier','Statements · callouts · rationale',0,3,'service','Each statement cites the household, a finding, an action, the update, or a note. Callouts must cite a real finding.'),
  wn('rows','Findings + actions','Always release',1,3,'service','Suitability findings and sized actions stay even when no brief is drafted.'),
  wn('egress','Client-data egress policy','Hosted only with AI Defense enforce',2,3,'cisco','services/llm/studio_models.py: client-advisory requires AI Defense enforce for a hosted model, else the call is refused.'),
  wn('omit','Never-dead tiers','Single call → code-written brief',3,3,'failure','Agent failure falls back to one drafting call; a refused or absent model falls back to a brief written by code. Findings and holdings remain. The browser replays a recorded run when the service is down.'),
  wn('gate','Advisor submits','Human review',0,4,'human','Jordan reviews the brief and toggles actions, then submits for supervision.'),
  wn('supervisor','Supervisor approves','Human approval',1,4,'human','Morgan, supervising principal. Approval runs the advisory.recommendation policies.'),
  wn('control','Agent Control','advisory.recommendation',2,4,'cisco','No guarantee, nothing unsuitable, no trade or wire instruction, supervisor approved. Hosted when configured; otherwise labelled local.'),
  wn('store','CRM record','Nothing is executed',3,4,'store','The approved brief is recorded; no trade, transfer, or message leaves the studio.'),
  wn('galileo','Splunk Agent Observability','Galileo SDK · optional',0,5,'service','Galileo tool and model spans when GALILEO_API_KEY is set. Configuration is not dashboard proof.',sources.splunk.url),
  wn('splunk','Splunk OTLP export','Official LangChain OTEL',1,5,'service','Traces and metrics only when SPLUNK_REALM + SPLUNK_ACCESS_TOKEN or OTLP endpoints are set.',sources.splunk.url),
  wn('compute','Sparky (DGX Spark) host','Dev box · Cisco AI POD proposed',2,5,'service',SPARKY_DETAIL,sources.cisco.url),
  wn('timeline','Run timeline','One event stream · recorded runs',3,5,'store','services/common/runs.py: agent, tool, model, security, and human lanes. Golden runs replay the same events.'),
 ],
 edges:[
  e('user','api','POST household'),
  e('api','household','load'),
  e('household','posted','with context'),
  e('household','notes','CRM notes',{ports:'down',via:[[936,250],[176,250]]}),
  e('notes','defense','inspect tool result',{kind:'control'}),
  e('defense','masked','mask / withhold',{kind:'control'}),
  e('household','metrics','holdings',{ports:'down',via:[[1060,240],[1316,240]]}),
  e('notes','suitability','screened notes',{ports:'down'}),
  e('metrics','suitability','holding rows',{ports:'down',via:[[1316,480],[176,480]]}),
  e('suitability','nba','findings'),
  e('nba','nim','actions'),
  e('posted','nim','update claims',{ports:'down',via:[[1440,240],[1440,500],[936,500]]}),
  e('nim','model','agent turns'),
  e('model','egress','hosted?',{kind:'control',ports:'down'}),
  e('egress','defense','force enforce',{kind:'control',via:[[936,720],[556,720],[556,470]]}),
  e('nim','defense','inspect input / output',{kind:'control',via:[[936,490],[556,490]]}),
  e('defense','omit','deny / unavailable',{kind:'control',via:[[556,460],[1460,460],[1460,772]]}),
  e('model','omit','refused / no model',{kind:'control',ports:'down',via:[[1400,700],[1400,772]]}),
  e('suitability','rows','findings stay',{ports:'down'}),
  e('nim','grounding','submit_brief lines',{via:[[936,710],[176,710]]}),
  e('grounding','gate','checked brief',{ports:'down'}),
  e('gate','supervisor','submit'),
  e('supervisor','control','approve'),
  e('control','store','allowed'),
  e('api','galileo','optional traces',{kind:'telemetry',via:[[556,226],[1470,226],[1470,1190],[176,1190]]}),
  e('nim','galileo','tool + model spans',{kind:'telemetry',via:[[890,700],[890,1180],[176,1180]]}),
  e('api','splunk','optional spans',{kind:'telemetry',via:[[700,226],[700,1190],[556,1190]]}),
  e('model','compute','dev host :8003',{kind:'placement',via:[[1316,1170],[936,1170]]}),
  e('api','timeline','run events',{kind:'telemetry',via:[[760,236],[1480,236],[1480,1300]]}),
 ]};
}

export function advisoryKnowledge():Diagram {
 return {title:'Advisor meeting prep · implemented client context',note:'Three synthetic households in fixtures/households. No household CRM catalog beyond them, no vector index, and no Tavily. The published house-view update and the company briefing reference arrive from the studio. A fraud case arrives only as a customer-visible service event (card reissued); SAR context never does. This map does not assert live Yahoo or model availability.',width:1520,height:860,
 boundaries:[
  {title:'Synthetic households · test PII only',x:28,y:16,width:1464,height:220},
  {title:'Studio context · screened notes',x:28,y:280,width:1464,height:220},
  {title:'Rules · actions · verifier',x:28,y:544,width:1464,height:292},
 ],
 nodes:[
  n('profile','Profile + IPS','Risk, horizon, goals',56,72,'store','Moderate, conservative, and aggressive profiles across the three households.'),
  n('holdings','Holdings','Weights · values · accounts',436,72,'store','The hypothetical Chuck portfolio holds 46% in fictional HCYN, not employer stock; the Okafors hold growth funds against a conservative profile.'),
  n('crm','CRM notes','Screened before use',816,72,'store','Priya’s notes carry test PII and an injected wire instruction.'),
  n('yahoo','Snapshots','Same as research',1196,72,'store','Holding returns and sector from the snapshot cache.'),
  n('research','House-view update','Published by the strategist',56,360,'store','Verified claims only; the recorded HCYN update when none was published this session.'),
  n('briefing','Company briefing','From the briefing demo',436,360,'store','A reference to the extracted briefing; the sidecar does not call EDGAR.'),
  n('screened','Screened notes','Kept · masked · withheld',816,360,'service','AI Defense spans mask PII; a labelled local rule masks what it does not flag.'),
  n('policy','Issuer policy','Insider-trading window',1196,360,'store','From the synthetic 10-K, for an affiliated client.'),
  n('rules','Suitability rules','Reg BI care',56,624,'service','Code. Off Inspection.'),
  n('nba','Next-best actions','Sized in dollars',436,624,'service','Catalogue entries with fit and cautions.'),
  n('ground','Brief verifier','Evidence ids + fields',816,624,'service','Checks every statement against the cited record.'),
  n('consumer','Meeting brief','Advisor → supervisor',1196,624,'service','Recorded to the CRM after approval; nothing is executed.'),
 ],
 edges:[
  e('profile','rules','profile',{ports:'down',via:[[176,250],[90,250],[90,624]]}),
  e('holdings','rules','weights',{ports:'down',via:[[556,260],[200,260],[200,600]]}),
  e('crm','screened','notes',{ports:'down'}),
  e('yahoo','holdings','metrics',{via:[[1316,48],[556,48]]}),
  e('research','ground','update claims',{ports:'down',via:[[176,520],[936,520]]}),
  e('briefing','ground','briefing ref',{ports:'down',via:[[556,530],[936,530]]}),
  e('screened','ground','note text',{ports:'down'}),
  e('policy','ground','policy text',{ports:'down',via:[[1316,520],[960,520]]}),
  e('rules','nba','findings'),
  e('nba','ground','actions'),
  e('ground','consumer','checked brief'),
 ]};
}

type Profile={entry:string;router:string;left:string;leftDetail:string;right:string;rightDetail:string;store:string;tool:string;result:string;gate:string;failure:string;ingest:string;gpu:string;note:string};
export const profiles:Record<string,Profile>={
 'brahe-bank':{entry:'Banking question',router:'Bank supervisor',left:'Product specialist',leftDetail:'Retrieve terms and criteria',right:'Score specialist',rightDetail:'Call mock score tool',store:'Product document index',tool:'Mock score API · 550',result:'Eligibility explanation',gate:'Customer review · no approval',failure:'Missing evidence → abstain',ingest:'Versioned product Markdown',gpu:'Product embeddings + model inference',note:'Proposed hosted-model replacement; preserve tool behavior and validate model compatibility before migration.'},
 'kyc-processing':{entry:'Onboarding document case',router:'Case verification workflow',left:'Document extraction',leftDetail:'OCR → fields + evidence locations',right:'Entity reconciliation',rightDetail:'Registry and screening checks',store:'Identity documents + policy index',tool:'Registry / sanctions APIs',result:'Cited discrepancy summary',gate:'Analyst approves onboarding',failure:'Mismatch / missing file → review',ingest:'Documents + versioned KYC policy',gpu:'Document OCR + summary inference',note:'Identity checks and registry authorization remain deterministic services. An LLM does not approve onboarding.'},
 'sar-support':{entry:'Alert or fraud referral',router:'SAR investigation service',left:'Investigation Deep Agent',leftDetail:'Case tools · untrusted text inspected first',right:'Typology rules + citation verifier',rightDetail:'Deterministic · not an LLM',store:'Synthetic case file · minimized KYC',tool:'Case data tools + allowlisted adverse media',result:'Cited FinCEN-style narrative',gate:'Investigator decides · separate QA approves',failure:'Unverified sentence → dropped',ingest:'Synthetic case fixtures + fraud handoff',gpu:'Studio model chain: Sparky vLLM on an NVIDIA DGX Spark dev box, else the OpenAI API under enforced AI Defense; Cisco UCS / AI POD proposed',note:'Deterministic typology rules and a cite-or-drop verifier around one agent. Agent Control denies filing without a separate QA approval and denies customer contact. E-filing is simulated; no automatic filing or implied regulatory compliance.'},
 'client-advisory':{entry:'Synthetic household + published update',router:'Meeting-prep Deep Agent',left:'Screened client context',leftDetail:'AI Defense on CRM notes · PII masked',right:'Suitability rules + sized actions',rightDetail:'Reg BI care · code, not an LLM',store:'Household fixtures + house-view update',tool:'Rules, actions, and brief verifier',result:'Checked meeting brief',gate:'Advisor submits, supervisor approves the meeting brief',failure:'No model or refused egress → code-written brief; findings remain',ingest:'Synthetic household and published update',gpu:'Studio model chain: Sparky vLLM at 127.0.0.1:8003 on an NVIDIA DGX Spark dev box, else the OpenAI API under enforced AI Defense; Cisco UCS / AI POD proposed',note:'CRM notes are screened by AI Defense; suitability rules and actions are code. A meeting-prep Deep Agent drafts a checked brief that a supervisor approves under advisory.recommendation. Not advice; nothing is executed.'},
 'market-research':{entry:'Earnings event or cached ticker',router:'Research Deep Agent',left:'House view, event, 10-K, news',leftDetail:'Restricted-list pre-check · screened news',right:'Calc tools + claim verifier',rightDetail:'Unit-aware checks · no rating or target',store:'Issuer fixtures + snapshot cache · not a vector index',tool:'Valuation, filing search, households',result:'Verified house-view update',gate:'Strategist publishes the research note (house-view update)',failure:'Restricted → blocked before any call; no model → fixture summary',ingest:'Synthetic issuer fixtures and cached market data',gpu:'Studio model chain: Sparky vLLM at 127.0.0.1:8003 on an NVIDIA DGX Spark dev box, else the OpenAI API; Cisco UCS / AI POD proposed',note:'Agent Control pre-check, AI Defense on news and model hops, a research Deep Agent, and code-verified claims the strategist publishes. Not investment advice. This map does not assert live Yahoo, FRED, or model availability. No Tavily.'},
 'transaction-llm':{entry:'Payment event',router:'Schema validation + routing',left:'Payment extraction model',leftDetail:'Unstructured text → proposed fields',right:'Entity resolution service',rightDetail:'Match counterparties + code sets',store:'Reference codes + counterparty master',tool:'History / entity lookup APIs',result:'Schema-validated enrichment',gate:'Low confidence → operations',failure:'Invalid schema → quarantine',ingest:'Versioned codes + entity reference data',gpu:'Batched extraction; benchmark CPU alternative',note:'Deterministic validation gates publication. Only exceptions need agentic reasoning; no LLM in the payment authorization path.'},
 'fraud-modeling':{entry:'Payment features',router:'Fraud scoring endpoint',left:'GraphSAGE + XGBoost scorer',leftDetail:'Exact TreeSHAP · no LLM',right:'Fraud triage agent',rightDetail:'Tools + cited summary · proposes, never acts',store:'Point-in-time transaction graph + model files',tool:'Rules, neighborhood, and playbook tools',result:'Risk score + TreeSHAP reasons',gate:'Analyst decides under fraud.take_action',failure:'Sidecar down → recorded, then sample scores, labelled',ingest:'TabFormer transactions → offline training on Sparky',gpu:'Scorer on Sparky (DGX Spark dev box) today; Cisco UCS / AI POD proposed',note:'The score path bypasses the LLM and AI Defense. The triage agent works beside it, and card actions need analyst approval. Cisco UCS / AI POD placement is proposed.'},
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
