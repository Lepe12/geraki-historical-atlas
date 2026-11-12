"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import N7GuideScene,{type GuideFrameInfo,type GuideMode,type GuideMood} from "./N7GuideScene";
import N7Backdrop,{type N7BackdropHandle} from "./N7Backdrop";
import { N7_HUMANOID_REFERENCE } from "./N7HumanoidReference";

export default function N7GuideView({open,onClose,activity,onWorkspace}:{open:boolean;onClose:()=>void;activity?:GuideMood|null;onWorkspace?:()=>void}){
  const [reduced,setReduced]=useState(false),[effects,setEffects]=useState(true),[breathing,setBreathing]=useState(true);
  const [mode,setMode]=useState<GuideMode>("assembly"),[mood,setMood]=useState<GuideMood>("idle");
  const [replay,setReplay]=useState(0),[done,setDone]=useState(false),[manualMotion,setManualMotion]=useState(false),[details,setDetails]=useState(false);
  const [stats,setStats]=useState<GuideFrameInfo|null>(null);
  const dialogRef=useRef<HTMLElement>(null);
  const figureRef=useRef<HTMLDivElement>(null),waveRef=useRef<HTMLDivElement>(null),backdrop=useRef<N7BackdropHandle>(null),ignitionRef=useRef<HTMLDivElement>(null);
  const lastStats=useRef(0),settings=useRef({details:false,effects:true,reduced:false}),wasOpen=useRef(false),automatic=useRef(false);
  const face=useRef({x:0,y:0,max:1});
  const previousActivity=useRef<GuideMood|null>(null);
  useEffect(()=>{
    const query=window.matchMedia("(prefers-reduced-motion: reduce)");const change=()=>{setReduced(query.matches);if(query.matches)setManualMotion(false);};change();query.addEventListener("change",change);
    return()=>query.removeEventListener("change",change);
  },[]);
  useEffect(()=>{settings.current={details,effects,reduced};},[details,effects,reduced]);
  useEffect(()=>{
    if(open&&!wasOpen.current){setMode(effects&&!reduced?"assembly":"particle");setDone(!effects||reduced);setManualMotion(false);setReplay(r=>r+1);}
    wasOpen.current=open;
  },[open,effects,reduced]);
  useEffect(()=>{
    const previous=previousActivity.current;previousActivity.current=activity||null;
    if(!open)return;
    if(activity){automatic.current=true;setMood(activity);setMode("particle");}
    else if(previous){automatic.current=false;setMood("idle");setMode("particle");setReplay(r=>r+1);}
  },[activity,open]);
  useEffect(()=>{
    const host=figureRef.current;if(!host)return;
    const slot=host.parentElement!;
    const resize=()=>{const width=Math.min(slot.clientWidth,slot.clientHeight*2/3);Object.assign(host.style,{width:`${width}px`,height:`${width*3/2}px`});const r=host.getBoundingClientRect();const x=r.left+r.width*.5,y=r.top+r.height*150/480;face.current={x,y,max:Math.max(Math.hypot(x,y),Math.hypot(innerWidth-x,y),Math.hypot(x,innerHeight-y),Math.hypot(innerWidth-x,innerHeight-y))};};
    const observer=new ResizeObserver(resize);observer.observe(slot);window.addEventListener("resize",resize);resize();
    return()=>{observer.disconnect();window.removeEventListener("resize",resize);};
  },[open,details]);
  useEffect(()=>{if(open)dialogRef.current?.querySelector<HTMLButtonElement>("[data-exit]")?.focus();},[open]);
  const complete=useCallback(()=>setDone(true),[]);
  const frame=useCallback((info:GuideFrameInfo)=>{
    const ring=waveRef.current,point=face.current,s=settings.current;
    if(ring){
      if(info.shock>=0&&s.effects&&!s.reduced){
        const radius=12+point.max*info.shock,fade=Math.sin(Math.PI*info.shock)*.55;
        Object.assign(ring.style,{display:"block",left:`${point.x-radius}px`,top:`${point.y-radius}px`,width:`${radius*2}px`,height:`${radius*2}px`,opacity:String(fade)});
        ring.dataset.progress=info.shock.toFixed(4);backdrop.current?.wave(point.x,point.y,radius,fade);
      }else{ring.style.display="none";ring.dataset.progress="-1";backdrop.current?.clear();}
    }
    if(ignitionRef.current)ignitionRef.current.dataset.active=String(info.ignition>0);
    if(s.details&&performance.now()-lastStats.current>500){lastStats.current=performance.now();setStats(info);}
  },[]);
  const replayAssembly=()=>{if(!effects)return;setManualMotion(true);setDone(false);setMode("assembly");setReplay(r=>r+1);};
  const skip=()=>{setMode("particle");setDone(true);waveRef.current?.style.setProperty("display","none");backdrop.current?.clear();};
  const changeEffects=()=>{const enabled=!effects;setEffects(enabled);if(!enabled){setMood("idle");skip();}else if(activity){automatic.current=true;setMood(activity);setMode("particle");}};
  const realMood=automatic.current&&activity?activity:null;
  if(!open)return null;
  return <section ref={dialogRef} onKeyDown={event=>{
    if(event.key==="Escape"){event.stopPropagation();onClose();}
    if(event.key==="Tab"){
      const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]'));
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }} role="dialog" aria-modal="true" aria-label="N7 Humanoid preview" className="n7-guide-view">
    <style>{`
      .n7-guide-view{position:fixed;inset:0;height:100dvh;max-height:100dvh;z-index:120;background:#000;color:#e9fbff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden}
      .n7-guide-view button{padding:8px 11px;border:1px solid #28667a;border-radius:6px;color:#defaff;background:#07131b;cursor:pointer;font-size:12px}
      .n7-guide-view button[aria-pressed=true]{background:#115068}.n7-guide-view button:disabled{opacity:.45;cursor:default}
      .n7-guide-header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;gap:12px;z-index:5;flex:none}
      .n7-guide-main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:0 12px}
      .n7-guide-main[data-details=true]{grid-template-columns:minmax(0,1fr) 260px}
      .n7-guide-figure-slot{min-height:0;min-width:0;display:grid;place-items:center;overflow:hidden}
      .n7-guide-figure{position:relative;height:100%;aspect-ratio:2/3;max-width:100%;mix-blend-mode:screen}
      .n7-guide-controls{flex:none;z-index:5;display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;padding:12px;background:#030c13e8}
      .n7-guide-details{padding:12px;background:#02080de8;border:1px solid #204856;border-radius:8px;overflow:auto;font-size:12px;line-height:1.6;min-height:0}
      @media(max-width:700px), (max-width:1000px) and (max-height:500px){.n7-guide-main[data-details=true]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) 115px}.n7-guide-controls{padding:8px;gap:4px;flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;min-height:42px}.n7-guide-controls>*{flex-shrink:0}.n7-guide-view button{padding:6px 8px;font-size:11px}}
    `}</style>
    <N7Backdrop ref={backdrop} effects={effects} reduced={reduced}/>
    <div ref={waveRef} aria-label="N7 completion shockwave" data-progress="-1" style={{display:"none",position:"fixed",pointerEvents:"none",border:"2px solid #ffe0a6",boxShadow:"0 0 12px #63ddff88",borderRadius:"50%",zIndex:3}}/>
    <header className="n7-guide-header"><strong style={{letterSpacing:4,color:"#62e8f7"}}>N7 · HUMANOID</strong><div style={{display:"flex",gap:8}}>{onWorkspace&&<button type="button" onClick={onWorkspace}>Συνομιλία</button>}<button type="button" data-exit="" onClick={onClose}>Exit</button></div></header>
    <div className="n7-guide-main" data-details={details}>
      <div className="n7-guide-figure-slot"><div ref={figureRef} className="n7-guide-figure" aria-label={mode==="assembly"?"N7 guide particle-river assembly":undefined}>
        {(mode==="original"||mode==="compare")&&<img src={N7_HUMANOID_REFERENCE} alt="Approved N7 idle reference" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",opacity:mode==="compare"?.38:1,zIndex:mode==="compare"?1:undefined}}/>}
        <N7GuideScene mode={mode} mood={mood} effects={effects} reduced={reduced} breathing={breathing} replay={replay} manualMotion={manualMotion} diagnostics={details} onComplete={complete} onFrame={frame}/>
        <span ref={ignitionRef} aria-label="N7 face ignition" data-active="false" style={{position:"absolute",pointerEvents:"none"}}/>
        {mode==="assembly"&&!done&&<span aria-label="N7 visible assembly source" style={{position:"absolute",left:"4.7%",top:"86.5%",width:1,height:1,pointerEvents:"none"}}/>}
      </div></div>
      {details&&<aside className="n7-guide-details" aria-label="Technical details"><strong>Guide diagnostics</strong><p>Three.js · one humanoid scene<br/>sRGB · tone mapping OFF<br/>Sample 320×480 · assembly 6s<br/>Shockwave 2.5s · breathing 7.2s<br/>Reduced motion: {reduced?"ON":"OFF"}</p><p>Particles {stats?.particles??"loading"}<br/>Render {stats?.renderMs.toFixed(2)??"—"} ms<br/>Frame {stats?.frameMs.toFixed(2)??"—"} ms</p><label style={{display:"block"}}><input type="checkbox" checked={breathing} onChange={e=>setBreathing(e.target.checked)}/> Breathing</label><p>Listening and Speaking buttons are visual previews. Live Listening follows microphone start; live Speaking follows audio playback.</p><p>Assembly is silent: no owner-supplied audio file. Camera tracking is optional and not enabled.</p>{mode==="compare"&&<p>REFERENCE 38% + PARTICLE RECONSTRUCTION</p>}</aside>}
    </div>
    <div id="n7-guide-voice" style={{position:"relative",zIndex:5,flex:"none"}}/>
    <footer className="n7-guide-controls">
      <span role="status" aria-label="N7 mood status" style={{fontSize:11,marginRight:5}}>{mode==="assembly"?`ASSEMBLY · ${done?"COMPLETE":"BUILDING"}`:`MOOD · ${(realMood||mood).toUpperCase()}${realMood?" · LIVE N7 REQUEST":mood!=="idle"?" · PREVIEW":""}`}</span>
      <button type="button" disabled={!effects} onClick={replayAssembly}>{mode==="assembly"?"Replay Assembly":"Assembly"}</button>
      {(mode==="assembly"||!done)&&<button type="button" onClick={skip}>Skip</button>}
      {(["idle","listening","thinking","speaking"] as GuideMood[]).map(s=><button type="button" key={s} disabled={!effects} aria-pressed={mood===s} onClick={()=>{automatic.current=false;setMood(s);skip();}}>{s[0].toUpperCase()+s.slice(1)}</button>)}
      <button type="button" onClick={()=>setMode("original")}>Original</button><button type="button" onClick={()=>setMode("particle")}>Particles</button>
      <button type="button" onClick={()=>{setMode("compare");setDetails(true);}}>Compare</button>
      <button type="button" aria-pressed={effects} onClick={changeEffects}>Effects {effects?"On":"Off"}</button>
      <button type="button" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>Technical details</button>
      <a href={N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"))+"/head-test/"} target="_blank" rel="noopener noreferrer" style={{color:"#9befff",padding:"8px"}}>Δοκιμή κεφαλιού</a>
    </footer>
  </section>;
}
