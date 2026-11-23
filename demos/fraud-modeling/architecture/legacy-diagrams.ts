import { n, e, sources, type Diagram, type FrameMapping, type Profile } from "../../../app/map/legacy-diagram.ts";

export const fraudProfile: Profile = {entry:'Payment features',router:'Fraud scoring endpoint',left:'GraphSAGE + XGBoost scorer',leftDetail:'Exact TreeSHAP · no LLM',right:'Fraud triage agent',rightDetail:'Tools + cited summary · proposes, never acts',store:'Point-in-time transaction graph + model files',tool:'Rules, neighborhood, and playbook tools',result:'Risk score + TreeSHAP reasons',gate:'Analyst decides under fraud.take_action',failure:'Sidecar down → recorded, then sample scores, labelled',ingest:'TabFormer transactions → offline training on Sparky',gpu:'Scorer on Sparky (DGX Spark dev box) today; Cisco UCS / AI POD proposed',note:'The score path bypasses the LLM and AI Defense. The triage agent works beside it, and card actions need analyst approval. Cisco UCS / AI POD placement is proposed.'};

export function fraudCapability(frame:FrameMapping,step:number):Diagram {
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
  n('artifacts','Trained weights','model_final.pt · xgboost_fraud.json',816,72,'store','Written to demos/fraud-modeling/backend/.cache/train. Gitignored. Required before serve.sh can score.'),
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
