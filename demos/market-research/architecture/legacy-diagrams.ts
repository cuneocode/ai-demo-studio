import { e, sources, type Diagram, type FrameMapping, wn, type Profile } from "../../../app/map/legacy-diagram.ts";

export const researchProfile: Profile = {entry:'Earnings event or cached ticker',router:'Research Deep Agent',left:'House view, event, 10-K, news',leftDetail:'Restricted-list pre-check · screened news',right:'Calc tools + claim verifier',rightDetail:'Unit-aware checks · no rating or target',store:'Issuer fixtures + snapshot cache · not a vector index',tool:'Valuation, filing search, households',result:'Verified house-view update',gate:'Strategist publishes the research note (house-view update)',failure:'Restricted → blocked before any call; no model → fixture summary',ingest:'Synthetic issuer fixtures and cached market data',gpu:'Studio model chain: Sparky vLLM at 127.0.0.1:8003 on an NVIDIA DGX Spark dev box, else the OpenAI API; Cisco UCS / AI POD proposed',note:'Agent Control pre-check, AI Defense on news and model hops, a research Deep Agent, and code-verified claims the strategist publishes. Not investment advice. This map does not assert live Yahoo, FRED, or model availability. No Tavily.'};

export function researchCapability(frame:FrameMapping,step:number):Diagram {
 return {...researchRuntime(), title:`Market research · ${frame.architecture.process[step]?.title || 'capability'}`};
}

export function researchRuntime():Diagram {
 return {title:'Market research · implemented request path',note:'A fixed NVDA cache or current ticker packet feeds a structured research assessment. AI Defense screens articles first. Code verifies supporting facts; an opinion is regenerated from surviving facts when needed. Model calls, tool events and verdicts use the existing wealth telemetry. No trade or distribution occurs.',width:1520,height:940,
 boundaries:[
  {title:'Load and identify the input packet',x:28,y:16,width:1464,height:220},
  {title:'Screen untrusted articles',x:28,y:252,width:1464,height:220},
  {title:'Assess, verify and review',x:28,y:488,width:1464,height:220},
  {title:'Measured execution',x:28,y:724,width:1464,height:192},
 ],nodes:[
  wn('user','Researcher','NVDA or another ticker',0,0,'human'),
  wn('api','Research API','Research container · :8014',1,0,'service','Studio proxies /api/research to the Wealth adapter in this independent Compose stack. Public sources retain dates and provider gaps.'),
  wn('market','Input packet','Financials, earnings, peers, news',2,0,'store','An immutable packet id binds the displayed inputs to the analysis.'),
  wn('precheck','Restricted-list check','research.precheck',3,0,'cisco','Restricted names are refused. Hosted Agent Control or labelled local checks.'),
  wn('news','Article text','Full supplied contents',0,1,'store','Yahoo news and the cached NVIDIA earnings release. The same synthetic injection accompanies every ticker.'),
  wn('defense','Cisco AI Defense','Tool-result inspection',1,1,'cisco','Every article is inspected before analysis. Model-hop inspection follows Studio settings.',sources.defense.url),
  wn('withheld','Excluded article','Flagged or uninspected',2,1,'failure','Excluded text is visible for inspection but absent from the model prompt.'),
  wn('evidence','Evidence registry','Accepted text and numeric fields',3,1,'store','Each source has an id; fields carry a value, unit and display string.'),
  wn('model','Studio model chain','Structured assessment',0,2,'ai','The configured healthy model proposes an outlook, Buy/Hold/Sell opinion, cited facts and risks.'),
  wn('grounding','Claim verifier','Fields and verbatim quotes',1,2,'service','At least three supporting facts must verify. One repair attempt; any revised opinion uses verified facts only.'),
  wn('gate','Research report','Human review',2,2,'human','The user reviews the outlook, drivers, peer comparison and risks. Nothing is traded or published.'),
  wn('unavailable','Assessment unavailable','Blocked or incomplete evidence',3,2,'failure','Blocked or failed runs release no assessment. Incomplete evidence withholds a recommendation.'),
  wn('observe','Splunk Agent Observability','Model and tool spans',0,3,'cisco','Galileo tracing exports only when configured. Live run stats reports actual trace delivery.',sources.splunk.url),
  wn('timeline','Run timeline','Sources, verdicts, model calls',1,3,'store','One run id connects the analysis and inspection evidence.'),
  wn('compute','Inference runtime','Configured Studio chain',2,3,'service','Studio settings select the inference host. Host-loopback URLs become host.docker.internal inside containers. Cisco UCS / AI POD placement remains proposed.'),
  wn('splunk','Splunk OTLP export','Optional receiver',3,3,'cisco','Generic telemetry exports only when configured. Receiver acknowledgement is reported separately from dashboard visibility.',sources.splunk.url),
 ],edges:[
  e('user','api','load'),e('api','market','cache / public providers'),e('market','precheck','analyze packet'),
  e('precheck','model','allow assessment',{kind:'control'}),e('precheck','unavailable','deny assessment',{kind:'control',ports:'down'}),
  e('market','news','article inputs',{ports:'down'}),e('news','defense','inspect'),e('defense','withheld','exclude',{kind:'control'}),
  e('defense','evidence','accepted sources',{via:[[556,450],[1316,450]]}),e('evidence','model','screened evidence',{ports:'down'}),
  e('model','grounding','cited draft'),e('grounding','gate','verified support'),e('grounding','unavailable','insufficient support',{kind:'control',via:[[556,700],[1316,700]]}),
  e('model','observe','usage / spans',{kind:'telemetry',ports:'down'}),e('grounding','timeline','verdicts',{kind:'telemetry',ports:'down'}),
  e('model','compute','selected endpoint',{kind:'placement',ports:'down'}),e('api','splunk','optional OTLP',{kind:'telemetry',ports:'down'}),
 ]};
}

export function researchKnowledge():Diagram {
 return {...researchRuntime(), title:'Market research · sources and verification',note:'NVDA starts from demos/market-research/fixtures/NVDA.json. Other tickers fetch Yahoo financials, earnings, peers and recent news. Article dialogs show all supplied text and label provider summaries. The injected article is synthetic and is screened before any model can see it. A hash identifies the exact packet used by a report.'};
}
