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
export const n = (id:string,title:string,subtitle:string,x:number,y:number,kind:NodeKind='service',detail=subtitle,source?:string):DiagramNode => ({id,title,subtitle,x,y,kind,detail,source});
export const e = (from:string,to:string,label:string,options:Partial<DiagramEdge>={}):DiagramEdge => ({from,to,label,...options});

export type Profile={entry:string;router:string;left:string;leftDetail:string;right:string;rightDetail:string;store:string;tool:string;result:string;gate:string;failure:string;ingest:string;gpu:string;note:string};

export const WX=[56,436,816,1196], WY=[64,300,536,772,1008,1244];
export const wn=(id:string,title:string,subtitle:string,col:number,row:number,kind:NodeKind='service',detail=subtitle,source?:string)=>n(id,title,subtitle,WX[col],WY[row],kind,detail,source);
export const SPARKY_DETAIL='Sparky is an NVIDIA DGX Spark (GB10) dev box serving vLLM at 127.0.0.1:8003. It is not Cisco hardware. Cisco UCS / AI POD is the proposed production placement, not a sized BOM.';
