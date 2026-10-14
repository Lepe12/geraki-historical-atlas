import React,{useEffect,useMemo,useState,useRef} from "react";
import ReasoningWeb from "./vendor/apex/ReasoningWeb.jsx";
import ApexOrb from "./vendor/apex/ApexOrb.jsx";
import ApexCore3D from "./vendor/apex/ApexCore3D.jsx";
import {getSnapshot,verifySnapshot,agentRoster,ARCHIVE_LANES,metric,timeLabel,displayValue} from "./research-data.js";

const dataTabs=["NETWORK","ARCHIVES","RUN HISTORY","SCIENTIFIC REVIEW"];
const stateWord={RUNNING:"RUNNING",COMPLETED:"COMPLETED",FAILED:"FAILED",BLOCKED:"BLOCKED",QUEUED:"QUEUED"};
const show=x=>x===null||x===undefined||x===""?"—":String(x);
const dataCell=(label,value)=><div className="datum" key={label}><span>{label}</span><strong>{show(value)}</strong></div>;
function localFrame({event}){return event;}
export default function App(){
 const [entry,setEntry]=useState(null),[loadError,setLoadError]=useState("");
 const [tab,setTab]=useState("NETWORK"),[selected,setSelected]=useState(null),[replayIndex,setReplayIndex]=useState(0),[isPlaying,setPlaying]=useState(false);
 const [draftOpen,setDraftOpen]=useState(false),[draft,setDraft]=useState({target:"Μήλος",period:"1660–1680",objective:""});
 const [directoryOpen,setDirectoryOpen]=useState(false);
 const [draftJson,setDraftJson]=useState(""),[evidenceFilter,setEvidenceFilter]=useState("blockers"),[search,setSearch]=useState("");
 const [filterAgent,setFilterAgent]=useState(""),[orbSupported,setOrbSupported]=useState(false),[notice,setNotice]=useState("");
 const tickRef=useRef(null),selectedRef=useRef(null),networkRef=useRef(null);
 const data=entry?.snapshot||null;
 const events=useMemo(()=>[...(data?.events||[])].sort((a,b)=>String(a.created_utc||"").localeCompare(String(b.created_utc||""))),[data]);
 const agents=data?.agents||[],claims=data?.claims||[],blockers=data?.blockers||[];
 const roster=useMemo(()=>agentRoster(data),[data]);
 const agentLookup=useMemo(()=>new Map(agents.map(a=>[a.id,a])),[agents]);
 const active=events[replayIndex]||null;
 const chosen=agentLookup.get(selected)||null;
 const selectedEvents=useMemo(()=>events.filter(x=>x.agent_id===selected),[events,selected]);
 const selectedBlocks=useMemo(()=>blockers.filter(x=>x.agent_id===selected),[blockers,selected]);
 const [evidenceItem,setEvidenceItem]=useState(null);
 const [frame,setFrame]=useState(0);
 const reduced=useMemo(()=>typeof window!=="undefined"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches,[]);
 const trace=useMemo(()=>active&&frame>0?{n:frame,trace:[{helper:active.agent_id}]}:null,[frame,active]);
 const replayState=isPlaying?"processing":"standby";
 const headlineState=isPlaying?"PLAYING RECORDING":entry?.sourceKind==="live"?"CONNECTED • IDLE":"RECORDED • STANDBY";
 const evidenceList=useMemo(()=>{
 const list=evidenceFilter==="events"?events:evidenceFilter==="claims"?claims:blockers;
 return list.map((record,i)=>({record,i})).filter(x=>!search||JSON.stringify(x.record).toLowerCase().includes(search.toLowerCase())).slice(0,200);
 },[evidenceFilter,events,claims,blockers,search]);
 useEffect(()=>{let mounted=true;const controller=new AbortController();getSnapshot(controller.signal).then(v=>{if(mounted){setEntry(v);setLoadError("");}}).catch(e=>{if(mounted)setLoadError(e.message);});return()=>{mounted=false;controller.abort();};},[]);
 useEffect(()=>{try{const c=document.createElement("canvas");setOrbSupported(!reduced&&!!(c.getContext("webgl2")||c.getContext("webgl")));}catch(_){setOrbSupported(false)}},[reduced]);
 useEffect(()=>{clearInterval(tickRef.current);if(isPlaying&&events.length){tickRef.current=setInterval(()=>{setReplayIndex(i=>{if(i>=events.length-1){setPlaying(false);return i}return i+1});setFrame(x=>x+1);},reduced?1100:780);}return()=>clearInterval(tickRef.current);},[isPlaying,events.length,reduced]);
 function rewind(){setPlaying(false);setReplayIndex(0);setFrame(x=>x+1)}
 function next(){setPlaying(false);setReplayIndex(i=>Math.min(Math.max(0,events.length-1),i+1));setFrame(x=>x+1)}
 function seek(i){setPlaying(false);setReplayIndex(Number(i));setFrame(x=>x+1)}
 function showAgent(node){const id=typeof node==="string"?node:node?.key;if(!id)return;setSelected(id);setDirectoryOpen(false);setTab("NETWORK");selectedRef.current=id;}
 function reviewEvidence(record){setEvidenceItem(record)}
 function openEvidenceForAgent(id){setSelected(id);setEvidenceFilter("blockers");setSearch("");setTab("ARCHIVES")}
 function showHistoryForAgent(id){setSelected(id);setFilterAgent(id);setTab("RUN HISTORY")}
 function prepareDraft(){
 if(!draft.target.trim()){setNotice("Συμπλήρωσε αντικείμενο έρευνας.");return;}
 setDraftJson(JSON.stringify({target:draft.target.trim(),date_range:draft.period.trim(),purpose:draft.objective.trim(),aliases:[],status:"DRAFT_NOT_DISPATCHED",source:"jarvis_research_network_v5"},null,2));
 }
 function shortEvent(ev){return show(ev?.detail||ev?.phase||ev?.event_type||"Recorded research action")}
 function labelAgent(id){return agentLookup.get(id)?.label||id||"JARVIS"}
 const displayedEvents=useMemo(()=>events.map((event,i)=>({event,i})).filter(({event})=>!filterAgent||event.agent_id===filterAgent).slice(-220).reverse(),[events,filterAgent]);
 useEffect(()=>{if(!selected&&active?.agent_id&&data?.agents?.length){/* Selection remains user-driven; replay never opens a surprise drawer. */}},[active,selected,data]);
 return <div className={"chamber "+(isPlaying?"replaying":"")} data-mode={tab} data-source={entry?.sourceKind||"none"}>
  <div className="ambient-field" aria-hidden="true"><div className="ambient-threads"/><div className="field-aurora"/><div className="horizon-mark"/><div className="starfield"/></div>
  <header className="topbar">
   <a className="brand" href="../command-center/" title="Stable JARVIS command center"><span className="crest">✥</span><span><b>PIRATECARTOGRAPHY</b><small>JARVIS · HISTORICAL INTELLIGENCE</small></span></a>
   <nav aria-label="Research workspaces" className="top-tabs">{dataTabs.map(v=><button key={v} className={v===tab?"active":""} onClick={()=>setTab(v)}>{v}</button>)}</nav>
   <div className="signal"><span className="prototype">RESEARCH NETWORK / V5</span><span className={"live-tag "+(entry?.sourceKind||"offline")}><i></i>{entry?.source|| (loadError?"NO DATA":"CONNECTING")}</span></div>
  </header>
  {tab==="NETWORK"?<main className="main-network">
   <section className="intro-panel intelligence-console"><div className="console-title-row"><span className="eyebrow">JARVIS / RESEARCH CONTROL</span><span className="console-led" aria-hidden="true"/></div>
     <h1>RESEARCH <em>NETWORK</em></h1>
     <p className="console-lead">Πραγματικοί agents. Καταγεγραμμένες εργασίες. Κάθε κόμβος ανοίγει τον ερευνητικό του φάκελο.</p>
     <div className="current"><span className="eyebrow">CURRENT MISSION / ARCHIVED RUN</span><strong>{show(data?.mission?.target)}</strong><span>{show(data?.mission?.date_range)} · {show(data?.mission?.status)}</span><span className="run-key">RUN {show(data?.run_id)}</span></div>
     <div className="console-section-heading"><span>ARCHIVAL RESEARCH LANES</span><span>{agents.filter(a=>ARCHIVE_LANES.has(a.id)).length} LANES</span></div>
     <div className="console-agent-list" aria-label="Select an archival research agent">{agents.filter(a=>ARCHIVE_LANES.has(a.id)).map(a=><button key={a.id} className={selected===a.id?"console-agent selected": "console-agent"} onClick={()=>showAgent(a.id)}><span className={"mini-led "+(a.status==="RUNNING"?"running":a.status==="COMPLETED"?"completed":"idle")}/><span className="agent-caption">{a.label}</span><small>{a.status==="COMPLETED"?"DONE":show(a.status)}</small><span aria-hidden="true">↗</span></button>)}</div>
     <div className="console-signals"><span><b>{metric(data,"specialist_discovery_records")}</b> DISCOVERIES</span><span><b>{metric(data,"blocker_records")}</b> ACCESS BLOCKERS</span><span><b>{metric(data,"verified_events")}</b> VERIFIED EVENTS</span></div>
     <div className="intro-actions"><button className="gold-cta" onClick={()=>{if(events.length){rewind();setPlaying(true)}else setNotice("Δεν υπάρχουν ερευνητικά συμβάντα για αναπαραγωγή.")}}><span>▶</span> ACTIVATE RESEARCH REPLAY <span>↗</span></button><button className="line-cta" onClick={()=>setDraftOpen(true)}>NEW RESEARCH MISSION →</button></div>
    </section>
   <div className="network-world" aria-label="Interactive JARVIS research agent constellation">
     <div className="world-orbits" aria-hidden="true"><span></span><span></span><span></span></div>
     <div className="reasoning-stage">
       <ReasoningWeb state={replayState} trace={trace} roster={roster} coreless={true} onSelect={showAgent} />
       <div className="apex-ring-adapter" aria-hidden="true"><ApexOrb variant="frame" state={isPlaying?"thinking":"idle"}/></div>
       <div className="particle-core" aria-hidden="true">{orbSupported?<ApexCore3D variant="particles" contained state={replayState}/>:<div className="fallback-core">✧</div>}</div>
       <button className="core-action" aria-label={isPlaying?"Pause recorded research playback":"Play recorded research"} onClick={()=>setPlaying(x=>!x)}><span className="core-title">JARVIS</span><small>{headlineState}</small></button>
     </div>
     <div className="orbital-subtitle">16 SOURCE-DRIVEN AGENTS <span>✦</span> NO AUTOMATIC HISTORICAL VERIFICATION</div>
   </div>
   <div className="mobile-agent-access"><button onClick={()=>setDirectoryOpen(true)}>✧ AGENT DIRECTORY <span>{agents.length} RESEARCH AGENTS ↗</span></button></div>
   {directoryOpen&&<div className="mobile-agent-sheet" aria-label="Agent directory"><div className="sheet-top"><strong>THE RESEARCH NETWORK</strong><button onClick={()=>setDirectoryOpen(false)} aria-label="Close agent directory">×</button></div><p>Επίλεξε έναν agent για να δεις πραγματικά συμβάντα και εμπόδια.</p><div className="agent-options">{agents.map(a=><button key={a.id} onClick={()=>showAgent(a.id)}><b>{a.label}</b><span>{a.status||"NOT REPORTED"}</span></button>)}</div></div>}
   <div className="operational-insight"><span className="eyebrow">JARVIS / SELECTED RESEARCH ACTION</span><strong id="now-agent">{labelAgent(active?.agent_id)}</strong><p id="now-event">{active?shortEvent(active):"Τα πραγματικά ερευνητικά συμβάντα εμφανίζονται εδώ. Ο πυρήνας δεν προσομοιώνει εκτελέσεις."}</p><div><span>{timeLabel(active?.created_utc)}</span><span>{show(active?.event_type)}</span></div></div>
   {selected&&chosen&&<aside className="agent-dossier" aria-label="Research agent dossier">
    <div className="dossier-top"><span className="eyebrow">AGENT INTELLIGENCE / ACTUAL LOGS</span><button onClick={()=>setSelected(null)} aria-label="Close agent dossier">×</button></div>
    <div className="dossier-crest">✦</div><h2>{chosen.label||selected}</h2><span className="agent-role">{ARCHIVE_LANES.has(selected)?"ARCHIVAL RESEARCH LANE":"SPECIALIST RESEARCH AGENT"}</span>
    <div className="data-matrix">{dataCell("CURRENT REPORTED STATUS",chosen.status)}{dataCell("LATEST REPORTED PHASE",chosen.phase)}{dataCell("RECORDED EVENTS",selectedEvents.length)}{dataCell("ACCESS BLOCKERS",selectedBlocks.length)}</div>
    <div className="dossier-trace"><span className="eyebrow">LAST LOG ENTRY</span><p>{shortEvent(selectedEvents.at(-1))}</p></div>
    <div className="dossier-actions"><button onClick={()=>openEvidenceForAgent(selected)}>EXAMINE BLOCKERS ↗</button><button onClick={()=>showHistoryForAgent(selected)}>INSPECT AGENT TIMELINE ↗</button></div>
   </aside>}
   <div className="corner-note">16 RESEARCH AGENTS · REAL RECORDED ACTIVITY<br/>NETWORK LINKS ARE OPERATIONAL, NOT HISTORICAL ROUTES</div>
  </main>:null}
  {tab==="ARCHIVES"?<main className="workspace"><div className="workspace-title"><span className="eyebrow">SPACE 02 / THE EVIDENCE LAB</span><h1>Behind every claim,<br/><em>its evidence.</em></h1><p>Μόνο πραγματικές εγγραφές από τον JARVIS. Τα blockers και τα τεχνικά logs δεν αποτελούν ιστορικά τεκμήρια.</p></div>
    <div className="research-columns"><section className="research-records">
     <div className="records-top"><strong>RESEARCH COLLECTION</strong><span>{evidenceFilter==="blockers"?blockers.length:evidenceFilter==="events"?events.length:claims.length} RECORDS</span></div>
     <div className="facets"><button className={evidenceFilter==="blockers"?"active":""} onClick={()=>{setEvidenceFilter("blockers");setEvidenceItem(null)}}>BLOCKERS</button><button className={evidenceFilter==="events"?"active":""} onClick={()=>{setEvidenceFilter("events");setEvidenceItem(null)}}>EVENTS</button><button className={evidenceFilter==="claims"?"active":""} onClick={()=>{setEvidenceFilter("claims");setEvidenceItem(null)}}>CLAIMS</button></div>
     <input value={search} onChange={v=>setSearch(v.target.value)} placeholder="Αναζήτηση στις εγγραφές…" aria-label="Αναζήτηση τεκμηρίων"/>
     <div className="records-scroll">{evidenceList.length?evidenceList.map(({record,i})=><button key={evidenceFilter+"-"+i} className={"record "+(evidenceItem===record?"selected":"")} onClick={()=>reviewEvidence(record)}><span className="record-emblem">{evidenceFilter==="blockers"?"⚑":evidenceFilter==="events"?"◷":"◇"}</span><span><b>{show(record.repository||record.title||labelAgent(record.agent_id))}</b><small>{show(record.event_type||record.status||record.source_type)}</small></span></button>):<div className="no-records">Δεν υπάρχουν εγγραφές για αυτό το φίλτρο.</div>}</div>
    </section><section className="reading-room"><header><span>PROVENANCE / DOCUMENT INSPECTION</span><span>{evidenceItem?"ACTUAL RECORD":"NO RECORD SELECTED"}</span></header>
    {evidenceItem?<div className="reading-body selected"><span className="eyebrow">RESEARCH LOG / NOT A HISTORICAL PRIMARY SOURCE</span><h2>{show(evidenceItem.title||evidenceItem.repository||labelAgent(evidenceItem.agent_id))}</h2><div className="record-fields">{Object.entries(evidenceItem).filter(([,v])=>["string","number","boolean"].includes(typeof v)).slice(0,24).map(([key,value])=>dataCell(key.replaceAll("_"," ").toUpperCase(),value))}</div></div>:<div className="reading-body"><div className="archive-sigil">❧</div><h2>The source comes first.</h2><p>Άνοιξε καταγεγραμμένη εγγραφή από αριστερά. Δεν κατασκευάζουμε έγγραφα, υπογραφές, παραπομπές ή ιστορικά συμπεράσματα.</p></div>}
    <footer>ARCHIVAL CATALOGUE ≠ ORIGINAL EXAMINATION ≠ HUMAN VERIFIED CLAIM</footer></section></div>
   </main>:null}
  {tab==="RUN HISTORY"?<main className="workspace"><div className="workspace-title"><span className="eyebrow">SPACE 03 / TEMPORAL RESEARCH INTELLIGENCE</span><h1>Trace every<br/><em>research decision.</em></h1><p>Χρονολογία των εργασιών JARVIS. Δεν συγχέεται με χρονολογία ιστορικών γεγονότων.</p></div>
   <div className="research-columns history-columns"><section className="research-records"><div className="records-top"><strong>RECORDED RESEARCH HISTORY</strong><span>{displayedEvents.length} RESULTS</span></div>
    <select value={filterAgent} onChange={v=>setFilterAgent(v.target.value)} aria-label="Filter history by agent"><option value="">ALL AGENTS</option>{agents.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select>
    <div className="records-scroll">{displayedEvents.map(({event,i})=><button key={i} className={"record "+(replayIndex===i?"selected":"")} onClick={()=>seek(i)}><span className="record-emblem">◷</span><span><b>{labelAgent(event.agent_id)}</b><small>{show(event.event_type)} · {timeLabel(event.created_utc)}</small></span></button>)}</div></section>
   <section className="reading-room history-room"><header><span>JARVIS OPERATIONS / READ ONLY</span><span>EVENT {events.length?replayIndex+1:0} / {events.length}</span></header><div className="reading-body"><div className="archive-sigil">✧</div><span className="eyebrow">SELECTED OPERATIONAL EVENT</span><h2>{labelAgent(active?.agent_id)}</h2><p>{shortEvent(active)}</p><div className="record-fields">{dataCell("EVENT TYPE",active?.event_type)}{dataCell("PHASE",active?.phase)}{dataCell("CREATED",timeLabel(active?.created_utc))}{dataCell("RUN ID",data?.run_id)}</div><button className="gold-cta" onClick={()=>{setTab("NETWORK");setFrame(v=>v+1)}}>VISUALIZE IN JARVIS NETWORK ↗</button></div></section></div>
  </main>:null}
  {tab==="SCIENTIFIC REVIEW"?<main className="workspace"><div className="workspace-title"><span className="eyebrow">SPACE 04 / SCIENTIFIC SAFETY GATE</span><h1>No authority<br/><em>without evidence.</em></h1><p>Η επιστημονική έγκριση ανήκει στον ερευνητή. Το UI δεν μετατρέπει ερευνητικές εγγραφές σε ιστορικά γεγονότα.</p></div>
   <div className="metrics-grid">{[["SOURCE DISCOVERIES","specialist_discovery_records","Εγγραφές ανακάλυψης — όχι έλεγχος πρωτοτύπου"],["CANDIDATE CLAIMS","candidate_claims","Αναμένουν μεθοδολογικό έλεγχο"],["VERIFIED EVENTS","verified_events","Μόνο όπου υπάρχει καταγεγραμμένη επικύρωση"],["ACCESS BLOCKERS","blocker_records","Ερευνητικά εμπόδια που απαιτούν επίλυση"]].map(([label,key,hint])=><div className="metric-box" key={key}><span>{label}</span><strong>{metric(data,key)}</strong><small>{hint}</small></div>)}</div>
   <div className="review-gate"><span className="gate-orb">◇</span><div><span className="eyebrow">HUMAN AUTHORITY / NO AUTO-VERIFIED CLAIMS</span><h2>{claims.length?claims.length+" candidate claims require human inspection":"No historical claim is awaiting approval."}</h2><p>Δεν υπάρχει πιστοποιημένο review API σε αυτή την προεπισκόπηση. Η αξιολόγηση πρωτογενών πηγών, της γενεαλογίας πηγών και των αντιφάσεων παραμένει υποχρεωτική.</p></div><div className="gate-actions"><button disabled>APPROVE</button><button disabled>REJECT</button><small>READ-ONLY PREVIEW</small></div></div>
  </main>:null}
  <footer className="control-deck"><div className="deck-data"><span>JARVIS / RECORDED RUN</span><b>{events.length?(replayIndex+1)+" / "+events.length:"— / —"} EVENTS</b><small>{show(data?.run_id)}</small></div><div className="play-controls"><button onClick={rewind} disabled={!events.length} aria-label="First event">↶</button><button className="play" onClick={()=>{setPlaying(p=>!p);setFrame(x=>x+1)}} disabled={!events.length} aria-label={isPlaying?"Pause replay":"Play replay"}>{isPlaying?"Ⅱ":"▶"}</button><button onClick={next} disabled={!events.length} aria-label="Next event">↦</button></div><input aria-label="Research event replay position" type="range" min="0" max={Math.max(0,events.length-1)} step="1" value={replayIndex} onChange={v=>seek(v.target.value)} disabled={!events.length}/><div className="deck-live" aria-live="polite"><b>{labelAgent(active?.agent_id)}</b><small>{shortEvent(active)}</small></div><span className="deck-qualifier">RECORDED / NOT LIVE EXECUTION</span><a className="atlas-link" href="../">HISTORICAL ATLAS ↗</a></footer>
  <div className="footnote">APEX-UI COMPONENTS © RUBEN MOURADIAN · MIT · ORIGINAL AGENT DATA: PIRATECARTOGRAPHY</div>
  {draftOpen&&<div className="modal-backdrop" onMouseDown={v=>{if(v.target===v.currentTarget)setDraftOpen(false)}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><span className="eyebrow">JARVIS MISSION COMPOSER</span><button onClick={()=>setDraftOpen(false)} aria-label="Close dialog">×</button></header><h2 id="modal-title">Begin the next inquiry.</h2><label>RESEARCH TARGET<input value={draft.target} onChange={v=>setDraft(o=>({...o,target:v.target.value}))}/></label><label>TIME PERIOD<input value={draft.period} onChange={v=>setDraft(o=>({...o,period:v.target.value}))}/></label><label>RESEARCH QUESTION<textarea value={draft.objective} onChange={v=>setDraft(o=>({...o,objective:v.target.value}))} rows="3"/></label><button className="gold-cta" onClick={prepareDraft}>PREPARE AUDITABLE DRAFT ↗</button>{draftJson&&<><pre>{draftJson}</pre><button className="line-cta" onClick={async()=>{try{await navigator.clipboard.writeText(draftJson);setNotice("Το προσχέδιο αντιγράφηκε. Δεν εκτελέστηκε έρευνα.")}catch(_){setNotice("Η αντιγραφή δεν υποστηρίζεται σε αυτόν τον browser.")}}}>COPY JSON →</button></>}<p>Προετοιμασία μόνο· καμία αποστολή χωρίς ασφαλές backend.</p></div></div>}
  {loadError&&<div className="data-error" role="alert">Δεν φορτώθηκαν τα ερευνητικά δεδομένα: {loadError}</div>}
  {notice&&<div className="toast" role="status">{notice}<button onClick={()=>setNotice("")} aria-label="Dismiss">×</button></div>}
 </div>;
}
