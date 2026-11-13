"use client";
import {useEffect,useState} from "react";
import N7ModelFittedView,{type FittedMood,type FittedView} from "./N7ModelFittedView";
import N7ModelTestView from "./N7ModelTestView";
import N7Workspace from "./N7Workspace";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";
import type {OrbState} from "./ApexHeroOrb";
const base=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"));

// Separate test page for the owner's 3D model, adapted to the approved N7.
// The existing Humanoid is not touched. Chat, voice, Agents and the N7 back
// end are the same N7 workspace used on the main page; its activity drives
// the moods here.
type Source="n7-3d"|"raw";
export default function N7ModelTest(){
 const [view,setView]=useState<FittedView>("follow"),[manual,setManual]=useState<FittedMood>("idle"),[source,setSource]=useState<Source>("n7-3d"),[compare,setCompare]=useState(false);
 const [reduced,setReduced]=useState(false),[ready,setReady]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState("");
 const [activity,setActivity]=useState<OrbState|"listening"|null>(null);
 useEffect(()=>{const q=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>setReduced(q.matches);change();q.addEventListener("change",change);return()=>q.removeEventListener("change",change);},[]);
 useEffect(()=>{setReady(false);setError("");setProgress(0);},[source]);
 const live=activity==="listening"||activity==="thinking"||activity==="speaking"?activity:null;
 const mood:FittedMood=live||manual;
 const views:[string,FittedView][]=[["Μπροστά","front"],["3/4","three-quarter"],["Προφίλ 90°","profile"],["Πίσω 180°","back"],["Ποντίκι","follow"],["Αυτόματη","auto"]];
 const rawView=view==="three-quarter"?"profile":view;
 return <main className="n7-model-page">
  <header><strong>N7 · 3D <i>· ΔΟΚΙΜΗ</i></strong><a href={base+"/"}>Επιστροφή στο N7 Humanoid</a></header>
  <section className="n7-model-stage" data-compare={compare}>
   <div className="n7-model-view">
    {source==="n7-3d"
     ?<N7ModelFittedView key="fitted" view={view} mood={mood} reduced={reduced} onReady={()=>setReady(true)} onError={setError} onProgress={setProgress}/>
     :<N7ModelTestView key="raw" view={rawView} look="original" bloom={false} closeup={false} reduced={reduced} phase={mood} onReady={()=>setReady(true)} onError={setError} onProgress={setProgress}/>}
    {!ready&&!error&&<div className="n7-model-msg" role="status">Φόρτωση 3D… {progress?`${progress}%`:""}</div>}
    {error&&<div className="n7-model-msg" role="alert">{error}</div>}
   </div>
   {compare&&<figure className="n7-model-compare"><img src={N7_HUMANOID_REFERENCE} alt="Σημερινό εγκεκριμένο N7"/><figcaption>Σημερινό N7 (εγκεκριμένη εικόνα)</figcaption></figure>}
  </section>
  <footer>
   <div className="n7-model-bar" aria-label="Γωνία">{views.map(([label,value])=><button key={value} type="button" aria-pressed={view===value} disabled={reduced&&(value==="auto"||value==="follow")} onClick={()=>setView(value)}>{label}</button>)}</div>
   <div className="n7-model-bar" aria-label="Διάθεση και εμφάνιση">
    {(["idle","listening","thinking","speaking"] as FittedMood[]).map(m=><button key={m} type="button" aria-pressed={mood===m} disabled={!!live} onClick={()=>setManual(m)}>{m[0].toUpperCase()+m.slice(1)}</button>)}
    <button type="button" aria-pressed={source==="n7-3d"} onClick={()=>setSource("n7-3d")}>N7 σε 3D</button>
    <button type="button" aria-pressed={source==="raw"} onClick={()=>setSource("raw")}>Αρχικό μοντέλο</button>
    <button type="button" aria-pressed={compare} onClick={()=>setCompare(v=>!v)}>Σύγκριση με σημερινό N7</button>
    <span role="status" aria-label="Κατάσταση μοντέλου">{live?`${mood.toUpperCase()} · LIVE`:mood.toUpperCase()}</span>
   </div>
  </footer>
  <N7Workspace onActivity={setActivity} onTrace={()=>{}}/>
  <style>{`body{margin:0;background:#02060c}.n7-model-page{height:100dvh;display:flex;flex-direction:column;color:#d8f4fb;font-family:system-ui,sans-serif;background:#02060c url('${base}/n7-environment-v4.webp') center/cover}
   .n7-model-page header{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;flex:none}.n7-model-page header strong{letter-spacing:.3em;color:#7fe6f5;font-size:13px}.n7-model-page header i{font-style:normal;color:#f5c26b}.n7-model-page a{color:#9befff;font-size:13px}
   .n7-model-stage{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:0 12px}.n7-model-stage[data-compare=true]{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
   .n7-model-view{position:relative;min-height:0}.n7-model-msg{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
   .n7-model-compare{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0}.n7-model-compare img{max-height:calc(100% - 28px);max-width:100%;mix-blend-mode:screen}.n7-model-compare figcaption{font-size:12px;color:#9fdbe8;padding-top:6px}
   .n7-model-page footer{flex:none;padding:8px 12px 70px;display:flex;flex-direction:column;gap:6px;align-items:center}.n7-model-bar{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;align-items:center}
   .n7-model-page button{padding:6px 9px;border:1px solid rgba(140,225,245,.2);border-radius:5px;background:rgba(4,14,22,.5);color:#cfeff6;font:500 11px ui-monospace,Menlo,monospace;letter-spacing:.06em;cursor:pointer}.n7-model-page button[aria-pressed=true]{background:rgba(98,232,247,.16);border-color:rgba(140,232,247,.6)}.n7-model-page button:disabled{opacity:.4}
   .n7-model-page [role=status]{font:500 11px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#f5c26b;padding-left:8px}
   @media(max-width:700px){.n7-model-stage[data-compare=true]{grid-template-columns:1fr;grid-template-rows:2fr 1fr}.n7-model-page footer{padding-bottom:64px}}`}</style>
 </main>;
}
