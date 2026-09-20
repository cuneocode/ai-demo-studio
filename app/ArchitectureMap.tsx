"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { Maximize2, Minimize2, Minus, Plus, RotateCcw, ArrowUpRight, X } from 'lucide-react';
import { bankingKnowledge, bankingRuntime, briefingKnowledge, briefingRuntime, capabilityDiagram, deploymentDiagram, fraudKnowledge, fraudRuntime, knowledgeDiagram, profiles, proposedRuntime, securityDiagram, sources, type Diagram, type DiagramEdge, type FrameMapping } from './architecture-model';
import './architecture.css';

const NODE_W=240, NODE_H=128;
type Lens='execution'|'knowledge'|'security'|'deployment';
// Explicit ports and waypoints preserve topology at every viewport size. Never
// hide edges at breakpoints or turn this canvas into a grid of unrelated cards.
export function edgeGeometry(edge:DiagramEdge, graph:Diagram) {
 const a=graph.nodes.find(n=>n.id===edge.from)!,b=graph.nodes.find(n=>n.id===edge.to)!;
 let start:[number,number]=[a.x+NODE_W,a.y+NODE_H/2],end:[number,number]=[b.x,b.y+NODE_H/2];
 if(edge.ports==='down'){start=[a.x+NODE_W/2,a.y+NODE_H];end=[b.x+NODE_W/2,b.y];}
 if(edge.ports==='up'){start=[a.x+NODE_W/2,a.y];end=[b.x+NODE_W/2,b.y+NODE_H];}
 if(edge.ports==='left'){start=[a.x,a.y+NODE_H/2];end=[b.x+NODE_W,b.y+NODE_H/2];}
 const points=[start,...(edge.via||[]),end];
 const label=edge.labelAt||[(start[0]+end[0])/2,(start[1]+end[1])/2] as [number,number];
 const labelWidth=!edge.labelAt&&!edge.via&&start[1]===end[1]?Math.max(64,Math.abs(end[0]-start[0])-12):undefined;
 return {path:points.map((p,i)=>(i?'L':'M')+p.join(',')).join(' '),label,labelWidth};
}

export default function ArchitectureMap({caseId,title,frame}:{caseId:string;title:string;frame:FrameMapping}) {
 const [view,setView]=useState<'capability'|'architecture'>('capability');
 const [lens,setLens]=useState<Lens>('execution');
 const liveImplemented=caseId==='brahe-bank'||caseId==='fraud-modeling'||caseId==='company-briefing';
 const [system,setSystem]=useState<'running'|'proposed'>(liveImplemented?'running':'proposed');
 const [zoom,setZoom]=useState(1);
 const [expanded,setExpanded]=useState(false);
 const [selection,setSelection]=useState<string|null>(null);
 const [step,setStep]=useState(0);
 const scroll=useRef<HTMLDivElement>(null);
 const expandButton=useRef<HTMLButtonElement>(null);
 const panel=useRef<HTMLElement>(null);
 const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 const prefix=useId().replaceAll(':','');
 const runningGraph=caseId==='fraud-modeling'?(lens==='knowledge'?fraudKnowledge():fraudRuntime()):caseId==='company-briefing'?(lens==='knowledge'?briefingKnowledge():briefingRuntime()):(lens==='knowledge'?bankingKnowledge():bankingRuntime());
 const graph:Diagram=view==='capability'?capabilityDiagram(frame,step,caseId):system==='running'?runningGraph:lens==='knowledge'?knowledgeDiagram(caseId):lens==='security'?securityDiagram(caseId):lens==='deployment'?deploymentDiagram(caseId):proposedRuntime(caseId);
 const liveCapability=view==='capability'&&(caseId==='fraud-modeling'||caseId==='company-briefing');
 const liveDeepDive=view==='architecture'&&system==='running';
 const selected=graph.nodes.find(n=>n.id===selection);
 const connected=new Set(selection?[selection,...graph.edges.filter(e=>e.from===selection||e.to===selection).flatMap(e=>[e.from,e.to])]:[]);
 const reset=()=>{setSelection(null);setZoom(1);scroll.current?.scrollTo({top:0,left:0});};
 useEffect(()=>{
   if(!expanded)return;
   const previous=document.body.style.overflow;
   const toggleButton=expandButton.current;
   document.body.style.overflow='hidden'; toggleButton?.focus();
   const key=(event:KeyboardEvent)=>{
     if(event.key==='Escape'){setExpanded(false);}
     if(event.key==='Tab'){
       const focusable=Array.from(panel.current?.querySelectorAll<HTMLElement>('button,a[href],[tabindex="0"]')||[]).filter(e=>e.getClientRects().length);
       const first=focusable[0],last=focusable.at(-1);
       if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
       else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
     }
   };
   document.addEventListener('keydown',key);
   return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',key);requestAnimationFrame(()=>{if(toggleButton?.isConnected)toggleButton.focus();});};
 },[expanded]);

 return <section ref={panel} className={`architecture-map ${expanded?'is-expanded':''}`} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} aria-label={`${title} system map`}>
   <header className="architecture-header">
     <div><span className="eyebrow">SYSTEM MAP</span><h2>{title}</h2></div>
     <div className="architecture-header-actions"><div className="diagram-toggle" role="group" aria-label="Diagram detail level">
       <button className={view==='capability'?'active':''} aria-pressed={view==='capability'} onClick={()=>{setView('capability');reset();}}>Capability map</button>
       <button className={view==='architecture'?'active':''} aria-pressed={view==='architecture'} onClick={()=>{setView('architecture');reset();}}>Architecture deep dive</button>
     </div><button ref={expandButton} className="map-icon-button" aria-label={expanded?'Exit full screen':'Full screen diagram'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={19}/>:<Maximize2 size={19}/>}</button></div>
   </header>
   {view==='architecture'&&<div className="architecture-navigation">
     {liveImplemented&&<div className="diagram-toggle" role="group" aria-label="System implementation"><button className={system==='running'?'active':''} aria-pressed={system==='running'} onClick={()=>{setSystem('running');setLens('execution');reset();}}>Implemented system</button><button className={system==='proposed'?'active':''} aria-pressed={system==='proposed'} onClick={()=>{setSystem('proposed');reset();}}>Proposed Cisco deployment</button></div>}
     {system==='running'&&caseId==='brahe-bank'&&<div className="map-lenses" role="group" aria-label="Implemented perspective"><button className={lens==='execution'?'active':''} aria-pressed={lens==='execution'} onClick={()=>{setLens('execution');reset();}}>Agent execution</button><button className={lens==='knowledge'?'active':''} aria-pressed={lens==='knowledge'} onClick={()=>{setLens('knowledge');reset();}}>Retrieval alternatives</button></div>}
     {system==='running'&&caseId==='fraud-modeling'&&<div className="map-lenses" role="group" aria-label="Implemented perspective"><button className={lens==='execution'?'active':''} aria-pressed={lens==='execution'} onClick={()=>{setLens('execution');reset();}}>Scoring execution</button><button className={lens==='knowledge'?'active':''} aria-pressed={lens==='knowledge'} onClick={()=>{setLens('knowledge');reset();}}>Scoring backends</button></div>}
     {system==='running'&&caseId==='company-briefing'&&<div className="map-lenses" role="group" aria-label="Implemented perspective"><button className={lens==='execution'?'active':''} aria-pressed={lens==='execution'} onClick={()=>{setLens('execution');reset();}}>Agent execution</button><button className={lens==='knowledge'?'active':''} aria-pressed={lens==='knowledge'} onClick={()=>{setLens('knowledge');reset();}}>Filing retrieval</button></div>}
     {system==='proposed'&&<div className="map-lenses" role="group" aria-label="Architecture perspective">{(['execution','knowledge','security','deployment'] as Lens[]).map(l=><button key={l} aria-pressed={lens===l} className={lens===l?'active':''} onClick={()=>{setLens(l);reset();}}>{{execution:'Execution',knowledge:'Knowledge & data',security:'Security & telemetry',deployment:'Deployment'}[l]}</button>)}</div>}
   </div>}
   <div className="map-context"><span className={`map-status ${liveDeepDive||liveCapability?'implemented':''}`}>{liveDeepDive?'Code-verified topology':liveCapability?(caseId==='fraud-modeling'?'Live score path':'Live briefing path'):'Proposed design'}</span><h3>{graph.title}</h3><p>{graph.note}</p></div>
   {view==='capability'&&<div className="transformation-summary"><p><span>Before</span>{frame.transformation.friction}</p><p><span>With AI</span>{frame.transformation.aiShift}</p><p><span>Human authority</span>{frame.transformation.humanControl}</p></div>}
   {view==='capability'&&<div className="map-step-picker" role="group" aria-label="Business step focus">{frame.architecture.process.map((p,i)=><button key={p.title} aria-pressed={step===i} onClick={()=>{setStep(i);setSelection(null);}}><span>{i+1}</span>{p.title}</button>)}</div>}
   <div className="map-toolbar"><div className="map-legend"><span className="data">Data / request</span><span className="control">Control / verdict</span><span className="telemetry">Telemetry</span><span className="placement">Placement</span></div><div className="map-zoom"><button aria-label="Zoom out" disabled={zoom<=.6} onClick={()=>setZoom(z=>Math.max(.6,Math.round((z-.1)*10)/10))}><Minus size={16}/></button><output aria-label="Diagram zoom">{Math.round(zoom*100)}%</output><button aria-label="Zoom in" disabled={zoom>=1.6} onClick={()=>setZoom(z=>Math.min(1.6,Math.round((z+.1)*10)/10))}><Plus size={16}/></button><button aria-label="Reset diagram view" onClick={reset}><RotateCcw size={16}/></button></div></div>
   <div className="map-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Diagram canvas. Scroll or drag the background to pan." onPointerDown={event=>{
     if(event.button!==0||(event.target as HTMLElement).closest('button,a'))return;
     const el=scroll.current!;drag.current={x:event.clientX,y:event.clientY,left:el.scrollLeft,top:el.scrollTop};el.setPointerCapture(event.pointerId);
   }} onPointerMove={event=>{if(!drag.current)return;const el=scroll.current!;el.scrollLeft=drag.current.left-(event.clientX-drag.current.x);el.scrollTop=drag.current.top-(event.clientY-drag.current.y);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
     <div className="map-sizer" style={{width:graph.width*zoom,height:graph.height*zoom}}><div className="map-canvas" style={{width:graph.width,height:graph.height,transform:`scale(${zoom})`}}>
       {graph.boundaries?.map(b=><div key={b.title} className="map-boundary" style={{left:b.x,top:b.y,width:b.width,height:b.height}}><span>{b.title}</span></div>)}
       <svg className="map-edges" width={graph.width} height={graph.height} aria-hidden="true"><defs>{['data','control','telemetry','placement'].map(kind=><marker key={kind} id={`${prefix}-${kind}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" className={`arrow-${kind}`}/></marker>)}</defs>{graph.edges.map((edge,i)=>{const geometry=edgeGeometry(edge,graph),kind=edge.kind||'data';return <g key={i} className={`map-edge ${kind} ${selection&&edge.from!==selection&&edge.to!==selection?'dim':''}`}><path d={geometry.path} markerEnd={`url(#${prefix}-${kind})`}/></g>;})}</svg>
       {graph.edges.map((edge,i)=>{const {label,labelWidth}=edgeGeometry(edge,graph);return <button key={i} className={`map-edge-label ${edge.kind||'data'} ${selection&&edge.from!==selection&&edge.to!==selection?'dim':''}`} style={{left:label[0],top:label[1],maxWidth:labelWidth??170}} aria-label={`${graph.nodes.find(n=>n.id===edge.from)?.title}: ${edge.label} → ${graph.nodes.find(n=>n.id===edge.to)?.title}`} onClick={()=>setSelection(edge.from)}>{edge.label}</button>;})}
       {graph.nodes.map(node=><button key={node.id} className={`map-node ${node.kind||'service'} ${selection===node.id?'selected':''} ${selection&&!connected.has(node.id)?'dim':''}`} style={{left:node.x,top:node.y,width:NODE_W,height:NODE_H}} aria-pressed={selection===node.id} onClick={()=>setSelection(selection===node.id?null:node.id)}><span className="node-type">{{service:'Service',ai:'AI capability',store:'Data / state',human:'Business / human',cisco:'Cisco platform',failure:'Exception'}[node.kind||'service']}</span><strong>{node.title}</strong><span className="node-subtitle">{node.subtitle}</span></button>)}
     </div></div>
   </div>
   <div className="map-inspector" aria-live="polite">{selected?<><div><strong>{selected.title}</strong><button className="map-icon-button" aria-label="Clear diagram selection" onClick={()=>setSelection(null)}><X size={16}/></button></div><p>{selected.detail}</p><ul>{graph.edges.filter(e=>e.from===selected.id||e.to===selected.id).map((edge,i)=><li key={i}>{graph.nodes.find(n=>n.id===edge.from)?.title} <span>— {edge.label} →</span> {graph.nodes.find(n=>n.id===edge.to)?.title}</li>)}</ul>{selected.source&&<a href={selected.source} target="_blank" rel="noreferrer">Supporting documentation <ArrowUpRight size={14}/></a>}</>:<p>Drag to pan · select a component to inspect its connections · full screen keeps the system in view.</p>}</div>
   {view==='architecture'&&system==='proposed'&&<details className="map-assumptions"><summary>Design assumptions & references</summary><p>{profiles[caseId].note} Identity integration, data residency, model sizing, retention, failure budgets and high availability require deployment validation. Cisco components shown here are not connected to the local demo.</p><div>{Object.values(sources).map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title}<ArrowUpRight size={14}/></a>)}</div></details>}
 </section>;
}
