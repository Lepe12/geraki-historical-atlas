"use client";
import {useEffect,useRef,useState} from "react";
import N7RealAvatarView,{type RealPose} from "./N7RealAvatarView";
import useN7Voice from "./useN7Voice";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";
const base=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"));
type Row={role:"user"|"assistant";content:string};
export default function N7RealAvatar(){
 const [pose,setPose]=useState<RealPose>("follow"),[closeup,setCloseup]=useState(true),[blink,setBlink]=useState(-1),[jaw,setJaw]=useState(0),[smile,setSmile]=useState(false),[n7,setN7]=useState(false),[reduced,setReduced]=useState(false);
 const [ready,setReady]=useState(false),[progress,setProgress]=useState(0),[modelError,setModelError]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[draft,setDraft]=useState(""),[rows,setRows]=useState<Row[]>([]);
 const sendRef=useRef<(s:string)=>void>(()=>{}),history=useRef<Row[]>([]),pending=useRef(false),generation=useRef(0),request=useRef<AbortController|null>(null);
 const voice=useN7Voice(setDraft,s=>sendRef.current(s)),voiceRef=useRef(voice);voiceRef.current=voice;
 useEffect(()=>{history.current=rows;},[rows]);
 useEffect(()=>{const q=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>{setReduced(q.matches);if(q.matches)setPose(p=>p==="auto"?"front":p);};change();q.addEventListener("change",change);return()=>q.removeEventListener("change",change);},[]);
 useEffect(()=>()=>{generation.current++;request.current?.abort();},[]);
 const stop=()=>{generation.current++;request.current?.abort();request.current=null;pending.current=false;setBusy(false);setJaw(0);voice.suspend();};
 async function send(text:string){
  const prompt=text.trim();if(!prompt||pending.current)return;if(prompt.length>2000){setError("Γράψε έως 2.000 χαρακτήρες.");return;}
  const token=++generation.current;const next:Row[]=[...history.current.slice(-6),{role:"user",content:prompt}];history.current=next;setRows(next);setDraft("");pending.current=true;setBusy(true);setError("");voice.stop();const controller=new AbortController();request.current=controller;
  try{const response=await fetch("/api/n7-apex/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:next.map(r=>({...r,content:r.content.slice(0,r.role==="user"?2000:1500)}))}),signal:controller.signal});const data=await response.json();if(token!==generation.current)return;if(!response.ok||typeof data.reply!=="string"||!data.reply.trim())throw Error(typeof data.error==="string"?data.error:"Δεν επέστρεψε απάντηση το N7.");const updated:Row[]=[...next,{role:"assistant",content:data.reply}];history.current=updated;setRows(updated);voiceRef.current.speak(data.reply);}
  catch(e){if(token===generation.current&&(e as Error).name!=="AbortError"){const msg=e instanceof Error?e.message:"Η σύνδεση διακόπηκε.";setError(msg);voiceRef.current.failConversation(msg);}}
  finally{if(token===generation.current){pending.current=false;setBusy(false);request.current=null;}}
 }
 sendRef.current=s=>void send(s);
 const previousConversation=useRef(false);useEffect(()=>{if(previousConversation.current&&!voice.conversation){generation.current++;request.current?.abort();request.current=null;pending.current=false;setBusy(false);}previousConversation.current=voice.conversation;},[voice.conversation]);
 const phase=voice.phase||(busy?"thinking":"idle"),lastReply=[...rows].reverse().find(r=>r.role==="assistant")?.content||"";
 return <main className="n7-real-page">
  <header><strong>N7 · Πραγματικό 3D</strong><a href={base+"/"}>Επιστροφή στο N7</a></header>
  <section className="n7-real-stage" aria-label="Προβολή avatar">
   <N7RealAvatarView pose={pose} closeup={closeup} blink={blink} jaw={jaw} smile={smile} n7={n7} reduced={reduced} phase={phase} onReady={()=>setReady(true)} onError={setModelError} onProgress={setProgress}/>
   {!ready&&!modelError&&<div className="n7-real-loading" role="status">Φόρτωση μοντέλου 3D… {progress>0?`${progress}%`:""}</div>}
   {modelError&&<div className="n7-real-loading" role="alert">{modelError}</div>}
  </section>
  <footer>
   <div className="n7-real-toolbar" aria-label="Έλεγχοι προβολής">
    {([["Μπροστά","front"],["Προφίλ 90°","profile"],["Πίσω 180°","back"],["Ποντίκι","follow"],["Περιστροφή 360°","orbit"]] as const).map(([label,value])=><button key={value} aria-pressed={pose===value} onClick={()=>setPose(value)}>{label}</button>)}
    <button aria-pressed={pose==="auto"} disabled={reduced} onClick={()=>setPose(p=>p==="auto"?"front":"auto")}>{pose==="auto"?"Παύση κίνησης":"Αυτόματη κίνηση"}</button>
    <button onClick={()=>setCloseup(v=>!v)}>{closeup?"Ολόκληρη φιγούρα":"Μόνο πρόσωπο"}</button><button aria-pressed={n7} onClick={()=>setN7(v=>!v)}>Χρώματα N7</button>
   </div>
   <div className="n7-real-toolbar">
    <button onClick={voice.conversation?stop:voice.startConversation} disabled={!voice.conversation&&(!voice.supported.input||!voice.supported.output||busy)}>{voice.conversation?"Τέλος συζήτησης":"Έναρξη συζήτησης"}</button>
    {!voice.conversation&&<button onClick={()=>voice.speak("Γεια σου. Είμαι το N7. Τώρα κινούμαι σε πραγματικό τρισδιάστατο χώρο.",true)} disabled={!voice.supported.output}>Δοκιμή φωνής</button>}
    <button onClick={stop}>Διακοπή</button><span role="status" aria-label="Κατάσταση avatar">{phase==="listening"?"Σε ακούω":phase==="thinking"?"Το N7 απαντά…":phase==="speaking"?"Το N7 μιλά":ready?"Έτοιμο":"Φόρτωση…"}</span>
   </div>
   <p aria-label="Κατάσταση φωνής" className="n7-real-status">{voice.status}</p>
   {error&&<p role="alert">{error}</p>}
   <details><summary>Συνομιλία και δοκιμές προσώπου</summary>
    <form onSubmit={e=>{e.preventDefault();void send(draft);}}><input aria-label="Μήνυμα στο N7" placeholder="Μίλησε ή γράψε εδώ…" value={draft} readOnly={voice.conversation} maxLength={2000} onChange={e=>setDraft(e.target.value)}/>{!voice.conversation&&<button disabled={busy||!draft.trim()}>Αποστολή</button>}</form>
    {lastReply&&<div aria-label="Απάντηση N7"><p>{lastReply}</p>{!voice.conversation&&<button onClick={()=>voice.speak(lastReply,true)}>Ανάγνωση απάντησης</button>}</div>}
    <div className="n7-real-toolbar"><button onClick={()=>setBlink(b=>b>.5?0:.95)}>{blink>.5?"Άνοιγμα ματιών":"Κλείσιμο ματιών"}</button><button onClick={()=>setJaw(j=>j>.1?0:.6)}>{jaw>.1?"Κλείσιμο στόματος":"Άνοιγμα στόματος"}</button><button aria-pressed={smile} onClick={()=>setSmile(v=>!v)}>Χαμόγελο</button><button onClick={()=>{setBlink(-1);setJaw(0);setSmile(false);setPose("front");}}>Ουδέτερο</button></div>
    <p className="n7-real-status">Το στόμα ακολουθεί την ένταση της φωνής. Το πρόσωπο και τα μαλλιά είναι η πρώτη προσαρμογή της δοκιμής 3D.</p>
   </details>
  </footer>
  <style>{`body{margin:0}.n7-real-page{height:100dvh;min-height:420px;display:flex;flex-direction:column;color:#dcf5ff;background:linear-gradient(#020810dd,#020810ee),url('${base}/n7-mountain-backdrop.webp') center/cover;font-family:system-ui,sans-serif}.n7-real-page header{padding:12px 18px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex:none}.n7-real-page a{color:#8eeaff}.n7-real-stage{flex:1;min-height:0;position:relative;overflow:hidden}.n7-real-loading{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}.n7-real-page footer{flex:none;background:#030d15eb;padding:8px 12px;max-height:38dvh;overflow:auto}.n7-real-toolbar{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;margin:4px 0}.n7-real-page button{padding:7px 10px;border:1px solid #276477;border-radius:7px;background:#092632;color:#d7f7ff;cursor:pointer}.n7-real-page button[aria-pressed=true]{background:#15566d}.n7-real-page button:disabled{opacity:.5;cursor:default}.n7-real-page button:focus-visible,.n7-real-page a:focus-visible,.n7-real-page summary:focus-visible{outline:2px solid #ffcb7b;outline-offset:2px}.n7-real-status{font-size:12px;margin:5px 0;text-align:center;min-height:1em}.n7-real-page summary{cursor:pointer;font-size:13px;padding:4px;text-align:center}.n7-real-page form{display:flex;gap:8px;margin:8px auto;max-width:800px}.n7-real-page input{min-width:0;flex:1;padding:9px;border-radius:7px;border:1px solid #286779;background:#07131f;color:#ecfaff}.n7-real-page [aria-label='Απάντηση N7']{max-width:800px;margin:auto;font-size:14px}.n7-real-page [role=alert]{color:#ffb99e}@media(max-width:700px){.n7-real-page header{font-size:13px;padding:9px}.n7-real-page button{font-size:11px;padding:6px}.n7-real-page footer{padding:6px}.n7-real-toolbar{gap:4px}}`}</style>
 </main>;
}
