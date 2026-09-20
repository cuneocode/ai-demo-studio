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

export function capabilityDiagram(frame:FrameMapping,step=0,caseId?:string):Diagram {
 const process=frame.architecture.process;
 step=Math.max(0,Math.min(process.length-1,step));
 if(caseId==='fraud-modeling') return fraudCapability(frame,step);
 if(caseId==='company-briefing') return briefingCapability(frame,step);
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
 const score=frame.architecture.ai[0]??{detail:'GraphSAGE embeds the neighborhood, XGBoost returns a probability, and Captum Shapley attributes seven feature groups.'};
 const narrative=frame.architecture.ai[2]??{detail:'An optional LLM may draft two sentences from SHAP groups. Off unless FRAUD_ENABLE_NARRATIVE=true.'};
 const xs=[56,436,816,1196];
 const stepFocus=step!==1?[e('p'+step,'ai',step===0?'case features':step===3?'review score':'review evidence',{ports:'down',via:step===2?[[936,220],[556,220]]:step===3?[[1316,214],[556,214]]:undefined,labelAt:step===0?[246,236]:step===2?[746,212]:[990,206]})]:[];
 return {title:'Fraud scoring · capability',note:'The live score path is GraphSAGE + XGBoost + Captum Shapley. Cisco AI Defense inspects only an optional LLM narrative (FRAUD_ENABLE_NARRATIVE, off by default). The probability is never sent to the Inspection API.',width:1520,height:800,
 boundaries:[
  {title:'Business process',x:28,y:16,width:1464,height:220},
  {title:'Live score path · no AI Defense',x:408,y:252,width:296,height:220},
  {title:'Optional narrative · off unless FRAUD_ENABLE_NARRATIVE=true',x:408,y:488,width:1084,height:220},
 ],
 nodes:[
  ...process.map((p,i)=>n('p'+i,p.title,p.detail,xs[i]??56+i*380,56,'human')),
  n('observe','Splunk observability','Optional score telemetry',56,300,'cisco','Configuration only. Score this payment does not require a dashboard.',sources.splunk.url),
  n('ai','GraphSAGE + XGBoost + Shapley','AI insertion · score path',436,300,'ai',score.detail,sources.fraud.url),
  n('compute','Cisco UCS + Nexus','Proposed GPU host',816,300,'cisco','Proposed placement for the GraphSAGE + XGBoost sidecar. The local demo scores via HTTP /score in the NVIDIA training image; Score this payment does not require UCS.',sources.cisco.url),
  n('narrative','Optional LLM narrative','Off by default',436,536,'ai',narrative.detail),
  n('defense','Cisco AI Defense','Narrative inspection only',816,536,'cisco','Inspects narrative input and output when FRAUD_ENABLE_NARRATIVE=true. The GNN/XGB score path is not sent to the Inspection API.',sources.defense.url),
  n('omit','Narrative omitted','Score still released',1196,536,'failure','Inspection deny/unavailability or LLM failure drops only the explanation. The probability remains.'),
 ],
 edges:[
  ...process.slice(0,-1).map((_,i)=>e('p'+i,'p'+(i+1),'next step')),
  ...(process[1]?[e('p1','ai','assisted by',{ports:'down',labelAt:[556,248]})]:[]),
  ...stepFocus,
  ...(process[2]?[e('ai','p2','score path · no Defense',{ports:'up',via:[[700,268],[936,268]],labelAt:[818,260]})]:[]),
  e('ai','observe','optional spans',{kind:'telemetry',labelAt:[346,364]}),
  e('ai','compute','host GPU sidecar',{kind:'placement',labelAt:[726,364]}),
  e('ai','narrative','optional explain',{ports:'down',labelAt:[556,466]}),
  e('narrative','defense','inspect draft only',{kind:'control',labelAt:[726,600]}),
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
  n('compute','Cisco UCS + Nexus','Proposed model host',816,772,'cisco','Proposed private placement. The local demo uses a protected hosted model; this map does not assert that endpoint is up.',sources.cisco.url),
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
 n('scope-judge','Application LLM judge','Banking scope · control 599',700,230,'ai','Hosted gpt-5.6-luna judge assesses whether the request is in banking scope; this is an application control, not a Galileo evaluator.'),
 n('scope-control','Agent Control SDK gate','Scope verdict · ID 599',1010,230,'cisco','Local application gate sends the scope judge result to the hosted Agent Control service and applies the returned allow/block verdict. A verdict is recorded, not a claim of perfect detection.'),
 n('supervisor','Bank supervisor','Route → collect → explain',700,430,'ai','LangGraph supervisor routes to specialists. Eligibility instructions require both specialist agents; there is no deterministic approval engine.'),
 n('cards','Card information agent','ReAct model / tool loop',390,430,'ai','Delegated product question invokes retrieval; evidence returns to this specialist before handoff back to the supervisor.'),n('score','Credit score agent','ReAct model / tool loop',1010,430,'ai','Delegated score question invokes a deterministic mock-score tool; specialist output returns through handoff-back.'),
 n('docs','Product retrieval tool','Local Markdown OR Pinecone',390,620,'store','Without Pinecone, lexical search reads local product Markdown. Configured Pinecone queries an existing top-k 1–8 index; /chat does not populate it.'),n('mock','Mock credit score tool','Returns fictional score 550',1010,620,'service','Not a credit bureau connection. No customer underwriting, payment or application is executed.'),
 n('final-defense','Cisco AI Defense','Final model-bound inspection',390,800,'cisco','ProtectedChatOpenAI inspects complete model output and tool arguments before the answer proceeds. This remains separate from quality controls.',sources.defense.url),
 n('quality-judge','Application LLM judge','Evidence + no approval claims',700,800,'ai','Hosted gpt-5.6-luna judge checks source grounding and prohibited approval claims after execution; it does not guarantee factual correctness.'),
 n('quality-control','Agent Control SDK gate','Grounding / no-approval · IDs 600/601',1010,800,'cisco','Local application gate sends the quality-judge result to the hosted Agent Control service: Evidence grounding (600) and No approval claims (601). Verdict metadata is bridged into the root trace.'),
 n('release','Validate and release','Answer + sources + control results',700,1000,'human','Release only after the final AI Defense and quality-control checks. The API returns allow/block/unavailable metadata without raw inspected content.'),
 n('output','Answer + sources','Customer reviews explanation',35,1000,'human','This is an illustrative assistant response, not a formal credit decision.'),
 n('state','InMemorySaver','thread_id → message checkpoints',1145,60,'store','Conversation checkpoints reside in process memory and are lost on restart. Unsafe/rejected requests are reset by the API.',sources.graph.url),
n('model','OpenAI hosted model','ProtectedChat model calls',390,1120,'ai','Agent generation uses the configured hosted model through ProtectedChatOpenAI boundaries; no NVIDIA NIM or UCS GPU is in the running path.'),n('galileo','Splunk Agent Observability','Galileo SDK + control spans',700,1120,'service','Galileo 2.6+ callbacks collect execution telemetry; the Agent Control 8.5 bridge records control metadata in the root request trace. Upload failure does not reject a successful answer.',sources.splunk.url),n('splunk','Splunk OTLP export','Optional OTLP trace + metrics',1010,1120,'service','A separate OTLP exporter sends agent, workflow, model and tool spans only when configured. It is observability delivery, not Agent Control enforcement.',sources.splunk.url),n('agent-control-api','Hosted Agent Control service','Server-side JSON controls · 599/600/601',1170,1080,'cisco','Hosted control service evaluates the application judge payloads and returns allow/block metadata. It does not replace AI Defense or guarantee factual quality.'),
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
 return {title:'Fraud scoring · implemented request path',note:'Code-verified path: the workbench posts a TabFormer case_id. FastAPI loads src/dst/edge_attr, then FRAUD_BACKEND=auto calls the live GraphSAGE + XGBoost sidecar at :8000. The sidecar returns a probability and Captum Shapley groups. That score is not a fraud flag. Fixture and LLM narrative are opt-in side paths.',width:1520,height:980,
 boundaries:[
  {title:'Studio adapter · FastAPI :8012',x:28,y:16,width:1464,height:220},
  {title:'Live NVIDIA scorer · GraphSAGE + XGBoost + Captum :8000',x:408,y:252,width:1084,height:220},
  {title:'Optional narrative · off unless FRAUD_ENABLE_NARRATIVE=true',x:408,y:488,width:1084,height:220},
 ],
 nodes:[
  n('user','Analyst / studio','Select a queue payment',56,64,'human','The workbench posts a case_id from the TabFormer test window. It does not send raw PAN data or start training.'),
  n('api','FastAPI /score','POST /api/fraud/score',436,64,'service','Validates the case_id, loads the catalog row, scores it, and may request a narrative. Health re-checks the sidecar on each call.'),
  n('catalog','TabFormer cases','studio_cases.json',816,64,'store','Held-out Sep–Oct 2019 payments with src, dst, and edge_attr. Fixture JSON is used only when FRAUD_BACKEND=fixture.'),
  n('router','Backend selector','auto → live sidecar',1196,64,'service','auto uses the GraphSAGE+XGBoost HTTP sidecar when /health is up. Fixture is forced only. A down sidecar fails closed with HTTP 503.'),
  n('scoreFail','Score unavailable','HTTP 503 · no score',56,300,'failure','Unknown case, sidecar down, or infer failure. Auto does not silently swap in fixtures.'),
  n('tritonClient','Score client','POST :8000/score',436,300,'service','Sends src, dst, and the 6-wide edge_attr vector. This is HTTP JSON, not a Triton gRPC infer payload.'),
  n('tritonServer','GraphSAGE + XGBoost','GPU infer sidecar',816,300,'ai','serve.sh loads model_final.pt and xgboost_fraud.json in the NVIDIA training image. Neighbor sampling, GNN embedding, then XGBoost.',sources.fraud.url),
  n('shap','Captum Shapley','7 feature groups',1196,300,'ai','SVS over GNN account/merchant embeddings, raw node features, amount, hour, and channel. This hop does not call an LLM.',sources.fraud.url),
  n('fixture','Fixture table','FRAUD_BACKEND=fixture',56,536,'service','Deterministic SHAP for the five synthetic test cases. Not selected by auto once the sidecar is trained.'),
  n('narrative','Optional LLM','Off by default',436,536,'ai','FRAUD_ENABLE_NARRATIVE drafts two sentences from SHAP groups. It must not declare the payment fraudulent.'),
  n('defense','Cisco AI Defense','Narrative inspection only',816,536,'cisco','Inspects narrative input and output. The GNN/XGB score path is not sent to the Inspection API.',sources.defense.url),
  n('release','Release score','Probability + SHAP + band',1196,536,'service','clear / review / hold is a threshold band (0.5, review at 0.35). Not a disposition or SAR.'),
  n('splunk','Splunk OTLP export','Optional · not required',56,772,'service','Configuration only. No dashboard is implied by this demo.',sources.splunk.url),
  n('omit','Narrative omitted','Score still released',436,772,'failure','Inspection deny/unavailability or LLM failure drops only the explanation. The probability remains.'),
  n('analyst','Suggested band','hold · review · clear',816,772,'human','hold ≥ 0.50; review ≥ 0.35; otherwise clear. A person owns the outcome.'),
  n('output','Analyst disposition','Human decision',1196,772,'human','This demo does not block a payment or file a report.'),
 ],
 edges:[
  e('user','api','POST case_id',{labelAt:[346,128]}),
  e('api','catalog','load src / dst / attrs',{labelAt:[726,128]}),
  e('catalog','router','case features',{labelAt:[1106,128]}),
  e('router','tritonClient','sidecar /health ok',{ports:'down',labelAt:[560,248]}),
  e('tritonClient','tritonServer','HTTP POST /score',{labelAt:[726,364]}),
  e('tritonServer','shap','p(fraud) + SVS',{labelAt:[1106,364]}),
  e('shap','release','score path · no LLM',{ports:'down',labelAt:[1316,466]}),
  e('release','analyst','suggested band',{ports:'down',labelAt:[1106,702]}),
  e('analyst','output','human disposition',{labelAt:[1106,836]}),
  e('router','scoreFail','sidecar down',{ports:'down',kind:'control',labelAt:[176,248]}),
  e('tritonClient','scoreFail','infer failed',{ports:'left',kind:'control',labelAt:[346,364]}),
  e('router','fixture','FRAUD_BACKEND=fixture',{ports:'down',kind:'control',via:[[1316,248],[176,248],[176,536]],labelAt:[280,248]}),
  e('fixture','shap','fixture SHAP only',{via:[[176,500],[1316,500],[1316,428]],labelAt:[700,488]}),
  e('fixture','scoreFail','missing case',{ports:'up',kind:'control',labelAt:[176,466]}),
  e('shap','narrative','optional explain',{ports:'down',labelAt:[560,466]}),
  e('narrative','defense','inspect draft',{kind:'control',labelAt:[726,600]}),
  e('defense','release','allow text',{kind:'control',labelAt:[1106,600]}),
  e('defense','omit','deny / unavailable',{ports:'down',kind:'control',labelAt:[726,702]}),
  e('narrative','omit','model unavailable',{ports:'down',kind:'control',labelAt:[556,702]}),
  e('api','splunk','optional spans',{ports:'down',via:[[556,210],[176,210],[176,772]],kind:'telemetry',labelAt:[210,210]}),
  e('release','splunk','score metadata',{ports:'down',via:[[1316,680],[176,680],[176,772]],kind:'telemetry',labelAt:[300,680]}),
 ]};
}

export function fraudKnowledge():Diagram {
 return {title:'Fraud scoring · implemented scoring backends',note:'Training is offline. Score this payment never starts the NVIDIA training container. Online, auto prefers the live sidecar at FRAUD_SCORE_URL; fixture is forced only.',width:1520,height:860,
 boundaries:[
  {title:'Offline training · not invoked by Score this payment',x:28,y:16,width:1464,height:220},
  {title:'Online scoring · one backend per request',x:28,y:280,width:1464,height:540},
 ],
 nodes:[
  n('source','TabFormer graph','2019-01…08 train · Sep–Oct test',56,72,'store','preprocess_tabformer_v3.py. 5,141 accounts, 38,927 merchants, 1.15M train edges, 287k test edges.'),
  n('train','Training job','scripts/train.sh',436,72,'ai','financial-fraud-training:3.0.0 on this Spark. GraphSAGE, then XGBoost, then SVS baseline.',sources.fraud.url),
  n('artifacts','Trained weights','model_final.pt · xgboost_fraud.json',816,72,'store','Written to services/fraud/.cache/train. Gitignored. Required before serve.sh can score.'),
  n('cases','Demo queue','8 test-window payments',56,360,'store','Real TabFormer rows, including published labels. Not a live authorization feed.'),
  n('selector','Backend selector','auto / gnn / fixture',436,360,'service','auto prefers the live sidecar /health, then a real Triton model-ready endpoint. Fixture only when forced.'),
  n('tritonEns','Live sidecar','GraphSAGE + XGBoost + SVS',816,360,'ai','infer_server.py in the NVIDIA training image. HTTP /score, not the Triton ensemble.',sources.fraud.url),
  n('result','Score payload','Probability + 7 SHAP groups',1196,360,'service','No automatic payment block and no SAR filing.'),
  n('fixtureTable','Fixture table','Forced test backend',436,600,'store','Available when FRAUD_BACKEND=fixture. Not selected by auto after the NVIDIA stack is up.'),
  n('hold','Scorer down','HTTP 503',816,600,'failure','Auto fails closed if the sidecar is down. It does not silently swap in fixtures.'),
  n('consumer','Workbench JSON','FastAPI /score response',1196,600,'service','Returns probability, threshold band, Shapley groups, and optional narrative metadata.'),
 ],
 edges:[
  e('source','train','prepared graph',{labelAt:[346,136]}),
  e('train','artifacts','write weights',{labelAt:[726,136]}),
  e('artifacts','tritonEns','serve.sh loads weights',{ports:'down',labelAt:[936,248]}),
  e('cases','selector','load case',{labelAt:[346,424]}),
  e('selector','tritonEns','sidecar healthy',{labelAt:[726,424]}),
  e('tritonEns','result','p(fraud) + SVS',{labelAt:[1106,424]}),
  e('selector','fixtureTable','FRAUD_BACKEND=fixture',{ports:'down',labelAt:[556,536]}),
  e('fixtureTable','result','fixture SHAP only',{via:[[556,560],[1316,560],[1316,488]],labelAt:[900,548]}),
  e('result','consumer','JSON response',{ports:'down',labelAt:[1316,536]}),
  e('selector','hold','sidecar down',{ports:'down',kind:'control',labelAt:[726,536]}),
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
  n('model','ProtectedChatOpenAI','Temperature 0 · every hop',816,772,'ai','Supervisor and subagents share this client. The map does not assert OpenAI availability or credentials.'),
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

type Profile={entry:string;router:string;left:string;leftDetail:string;right:string;rightDetail:string;store:string;tool:string;result:string;gate:string;failure:string;ingest:string;gpu:string;note:string};
export const profiles:Record<string,Profile>={
 'brahe-bank':{entry:'Banking question',router:'Bank supervisor',left:'Product specialist',leftDetail:'Retrieve terms and criteria',right:'Score specialist',rightDetail:'Call mock score tool',store:'Product document index',tool:'Mock score API · 550',result:'Eligibility explanation',gate:'Customer review · no approval',failure:'Missing evidence → abstain',ingest:'Versioned product Markdown',gpu:'Product embeddings + model inference',note:'Proposed hosted-model replacement; preserve tool behavior and validate model compatibility before migration.'},
 'kyc-processing':{entry:'Onboarding document case',router:'Case verification workflow',left:'Document extraction',leftDetail:'OCR → fields + evidence locations',right:'Entity reconciliation',rightDetail:'Registry and screening checks',store:'Identity documents + policy index',tool:'Registry / sanctions APIs',result:'Cited discrepancy summary',gate:'Analyst approves onboarding',failure:'Mismatch / missing file → review',ingest:'Documents + versioned KYC policy',gpu:'Document OCR + summary inference',note:'Identity checks and registry authorization remain deterministic services. An LLM does not approve onboarding.'},
 'sar-support':{entry:'Investigation alert',router:'Investigation coordinator',left:'Evidence timeline builder',leftDetail:'Query transactions + link entities',right:'Narrative drafting agent',rightDetail:'Draft only from case evidence',store:'Case evidence + transaction graph',tool:'Case management / query APIs',result:'Narrative + linked chronology',gate:'Investigator reviews and files',failure:'Unsupported claim → revise',ingest:'Transaction CDC + case evidence',gpu:'Narrative generation; graph acceleration optional',note:'Transaction graph queries feed the draft. No automatic filing or implied regulatory compliance.'},
 'client-advisory':{entry:'Prepare client meeting',router:'Briefing coordinator',left:'Entitled research retriever',leftDetail:'Client-scoped policy + research',right:'Portfolio analytics tool',rightDetail:'Positions, exposure, constraints',store:'Approved research + policy index',tool:'CRM / portfolio / rules APIs',result:'Sourced briefing draft',gate:'Advisor validates suitability',failure:'Stale facts / policy conflict → review',ingest:'Approved research + policy versions',gpu:'Embedding, reranking and briefing inference',note:'Portfolio arithmetic and suitability rules run as tools. AI drafts the briefing; the advisor owns recommendations.'},
 'market-research':{entry:'Research topic + as-of date',router:'Research coordinator',left:'Temporal hybrid retriever',leftDetail:'Filter date, rights and issuer',right:'Evidence comparison agent',rightDetail:'Reconcile conflicting statements',store:'Filings / transcripts / citation index',tool:'Pricing feed / citation verifier',result:'Cited research note',gate:'Research analyst publishes',failure:'Conflicting citation → flag',ingest:'Filings + transcripts + licenses',gpu:'Document extraction + synthesis inference',note:'Time-sensitive pricing comes from an API, not static embeddings. Publication requires source verification.'},
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
 const p=profiles[id],fraud=id==='fraud-modeling',briefing=id==='company-briefing', structured=['fraud-modeling','transaction-llm','company-briefing'].includes(id);
 return {title:briefing?'Filing map and structured facts':structured?'Reference / feature preparation':'Knowledge preparation and retrieval',note:briefing?'Proposed preparation still has no vector index. Node files remain a filing map; metrics stay in companyfacts or verbatim tables.':structured?'Structured records remain structured. No blanket “embed everything” step.':'Proposed pipeline. Source access controls, freshness and evidence lineage remain application responsibilities.',width:1460,height:750,
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
