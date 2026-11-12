"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import N7GuideScene,{type GuideFrameInfo,type GuideMode,type GuideMood} from "./N7GuideScene";
import N7Backdrop,{type N7BackdropHandle} from "./N7Backdrop";
import { N7_HUMANOID_REFERENCE } from "./N7HumanoidReference";

// Second face option: the owner-supplied H01 head composed onto the same body.
// It is a different source raster for the same scene, rig, moods and voice.
type Face="n7"|"h01";
const H01_FIGURE=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"))+"/n7-humanoid-h01-v2.webp";
const H01_SCALE=2.5;

export default function N7GuideView({open,onClose,activity,onWorkspace}:{open:boolean;onClose:()=>void;activity?:GuideMood|null;onWorkspace?:()=>void}){
  const [reduced,setReduced]=useState(false),[effects,setEffects]=useState(true),[breathing,setBreathing]=useState(true),[gestures,setGestures]=useState(true);
  const [mode,setMode]=useState<GuideMode>("assembly"),[mood,setMood]=useState<GuideMood>("idle");
  const [replay,setReplay]=useState(0),[done,setDone]=useState(false),[manualMotion,setManualMotion]=useState(false),[details,setDetails]=useState(false);
  const [stats,setStats]=useState<GuideFrameInfo|null>(null);
  const [faceChoice,setFace]=useState<Face>("n7");
  useEffect(()=>{
    try{const asked=new URLSearchParams(window.location.search).get("face"),saved=window.localStorage.getItem("n7-face");const next=asked||saved;if(next==="h01"||next==="n7")setFace(next);}catch{}
  },[]);
  const chooseFace=(next:Face)=>{setFace(next);try{window.localStorage.setItem("n7-face",next);}catch{}};
  const figureUrl=faceChoice==="h01"?H01_FIGURE:N7_HUMANOID_REFERENCE;
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
      .n7-guide-view{position:fixed;inset:0;height:100dvh;max-height:100dvh;z-index:120;background:#000;color:#e6f7fb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column;overflow:hidden}
      .n7-guide-view button{padding:7px 12px;border:1px solid rgba(120,220,240,.20);border-radius:9px;color:#cfeff6;background:rgba(6,20,30,.55);cursor:pointer;font-size:12px;line-height:1.2;letter-spacing:.02em}
      .n7-guide-view button:hover:not(:disabled){background:rgba(98,232,247,.10);border-color:rgba(120,220,240,.42);color:#f2fdff}
      .n7-guide-view button:focus-visible,.n7-guide-view a:focus-visible{outline:2px solid #f5c26b;outline-offset:2px}
      .n7-guide-view button[aria-pressed=true]{background:rgba(98,232,247,.17);border-color:rgba(120,232,247,.60);color:#f2fdff}.n7-guide-view button:disabled{opacity:.40;cursor:default}
      .n7-guide-header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;gap:12px;z-index:5;flex:none}
      .n7-guide-brand{letter-spacing:.34em;color:#7fe6f5;font-size:13px;font-weight:600}.n7-guide-brand i{font-style:normal;color:#f5c26b}
      .n7-guide-main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:0 12px}
      .n7-guide-main[data-details=true]{grid-template-columns:minmax(0,1fr) 260px}
      .n7-guide-figure-slot{min-height:0;min-width:0;display:grid;place-items:center;overflow:hidden}
      .n7-guide-figure{position:relative;height:100%;aspect-ratio:2/3;max-width:100%;mix-blend-mode:screen}
      .n7-guide-controls{flex:none;z-index:5;align-self:center;display:flex;justify-content:center;align-items:center;gap:4px 8px;flex-wrap:wrap;margin:6px 12px 12px;padding:6px 10px;max-width:calc(100% - 24px);box-sizing:border-box;background:rgba(3,11,18,.84);border:1px solid rgba(120,220,240,.16);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
      .n7-guide-status{display:inline-flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.14em;color:#9fdbe8;white-space:nowrap;padding-right:4px}
      .n7-guide-status::before{content:"";width:6px;height:6px;border-radius:50%;background:#f5c26b;box-shadow:0 0 10px #f5c26b}
      .n7-guide-group{display:inline-flex;align-items:center;gap:0;padding-left:8px;border-left:1px solid rgba(120,220,240,.14)}
      .n7-guide-group>small{font-size:9px;letter-spacing:.16em;color:#5f97a6;margin-right:3px;white-space:nowrap}
      .n7-guide-group button{border-color:transparent;background:transparent;padding:6px 7px}.n7-guide-assembly{min-width:112px;text-align:left}
      .n7-guide-group a{color:#9befff;font-size:12px;padding:6px 10px;border-radius:9px;text-decoration:none;white-space:nowrap}.n7-guide-group a:hover{background:rgba(98,232,247,.10)}
      /* Voice panel: presentation only. Its markup and behaviour live in N7Workspace. */
      #n7-guide-voice>div{background:rgba(3,11,18,.86)!important;border:1px solid rgba(120,220,240,.14);border-radius:16px;margin:0 auto;width:min(880px,calc(100% - 24px));box-sizing:border-box;padding:8px 12px!important}
      #n7-guide-voice>div:has(>button:only-child){width:fit-content;background:transparent!important;border:0;overflow:visible!important;padding:0!important}
      #n7-guide-voice p{font-size:12px;line-height:1.5;margin:6px 0;color:#a9cfd9}
      .n7-guide-details{padding:14px;background:rgba(2,9,14,.88);border:1px solid rgba(120,220,240,.16);border-radius:12px;overflow:auto;font-size:12px;line-height:1.6;min-height:0}
      @media(max-width:700px), (max-width:1000px) and (max-height:500px){.n7-guide-main[data-details=true]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) 115px}.n7-guide-controls{align-self:stretch;margin:0;max-width:none;border-radius:0;border-width:1px 0 0;padding:6px 8px;gap:4px 10px;flex-wrap:nowrap;justify-content:flex-start;overflow-x:auto;min-height:42px}#n7-guide-voice>div{width:100%;border-radius:0;border-width:1px 0 0}.n7-guide-controls>*{flex-shrink:0}.n7-guide-group{padding-left:10px}.n7-guide-view button{padding:6px 8px;font-size:11px}}
    `}</style>
    <N7Backdrop ref={backdrop} effects={effects} reduced={reduced}/>
    <div ref={waveRef} aria-label="N7 completion shockwave" data-progress="-1" style={{display:"none",position:"fixed",pointerEvents:"none",border:"2px solid #ffe0a6",boxShadow:"0 0 12px #63ddff88",borderRadius:"50%",zIndex:3}}/>
    <header className="n7-guide-header"><strong className="n7-guide-brand">N7 <i>·</i> HUMANOID</strong><div style={{display:"flex",gap:8}}>{onWorkspace&&<button type="button" onClick={onWorkspace}>Συνομιλία</button>}<button type="button" data-exit="" onClick={onClose}>Exit</button></div></header>
    <div className="n7-guide-main" data-details={details}>
      <div className="n7-guide-figure-slot"><div ref={figureRef} className="n7-guide-figure" aria-label={mode==="assembly"?"N7 guide particle-river assembly":undefined}>
        {(mode==="original"||mode==="compare")&&<img src={figureUrl} alt="Approved N7 idle reference" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",opacity:mode==="compare"?.38:1,zIndex:mode==="compare"?1:undefined}}/>}
        <N7GuideScene key={faceChoice} source={faceChoice==="h01"?H01_FIGURE:undefined} scale={faceChoice==="h01"?H01_SCALE:undefined} mode={mode} mood={mood} effects={effects} reduced={reduced} breathing={breathing} gestures={gestures} replay={replay} manualMotion={manualMotion} diagnostics={details} onComplete={complete} onFrame={frame}/>
        <span ref={ignitionRef} aria-label="N7 face ignition" data-active="false" style={{position:"absolute",pointerEvents:"none"}}/>
        {mode==="assembly"&&!done&&<span aria-label="N7 visible assembly source" style={{position:"absolute",left:"4.7%",top:"86.5%",width:1,height:1,pointerEvents:"none"}}/>}
      </div></div>
      {details&&<aside className="n7-guide-details" aria-label="Technical details"><strong>Guide diagnostics</strong><p>Three.js · one humanoid scene<br/>sRGB · tone mapping OFF<br/>Sample 320×480 · assembly 6s<br/>Shockwave 2.5s · breathing 7.2s<br/>Reduced motion: {reduced?"ON":"OFF"}</p><p>Particles {stats?.particles??"loading"}<br/>Render {stats?.renderMs.toFixed(2)??"—"} ms<br/>Frame {stats?.frameMs.toFixed(2)??"—"} ms</p><label style={{display:"block"}}><input type="checkbox" checked={breathing} onChange={e=>setBreathing(e.target.checked)}/> Breathing</label><label style={{display:"block"}}><input type="checkbox" checked={gestures} onChange={e=>setGestures(e.target.checked)}/> Head gestures</label><p>Listening and Speaking buttons are visual previews. Live Listening follows microphone start; live Speaking follows audio playback.</p><p>Assembly is silent: no owner-supplied audio file. Camera tracking is optional and not enabled.</p>{mode==="compare"&&<p>REFERENCE 38% + PARTICLE RECONSTRUCTION</p>}</aside>}
    </div>
    <div id="n7-guide-voice" style={{position:"relative",zIndex:5,flex:"none"}}/>
    <footer className="n7-guide-controls">
      <span role="status" aria-label="N7 mood status" className="n7-guide-status">{mode==="assembly"?`ASSEMBLY · ${done?"COMPLETE":"BUILDING"}`:`MOOD · ${(realMood||mood).toUpperCase()}${realMood?" · LIVE N7 REQUEST":mood!=="idle"?" · PREVIEW":""}`}</span>
      <span className="n7-guide-group"><small aria-hidden="true">ΔΙΑΘΕΣΗ</small>
        {(["idle","listening","thinking","speaking"] as GuideMood[]).map(s=><button type="button" key={s} disabled={!effects} aria-pressed={mood===s} onClick={()=>{automatic.current=false;setMood(s);skip();}}>{s[0].toUpperCase()+s.slice(1)}</button>)}
      </span>
      <span className="n7-guide-group"><small aria-hidden="true">ΠΡΟΣΩΠΟ</small>
        <button type="button" aria-label="Πρόσωπο N7" aria-pressed={faceChoice==="n7"} onClick={()=>chooseFace("n7")}>N7</button>
        <button type="button" aria-label="Πρόσωπο H01" aria-pressed={faceChoice==="h01"} onClick={()=>chooseFace("h01")}>H01</button>
      </span>
      <span className="n7-guide-group"><small aria-hidden="true">ΠΡΟΒΟΛΗ</small>
        <button type="button" aria-pressed={mode==="original"} onClick={()=>setMode("original")}>Original</button><button type="button" aria-pressed={mode==="particle"} onClick={()=>setMode("particle")}>Particles</button>
        <button type="button" aria-pressed={mode==="compare"} onClick={()=>{setMode("compare");setDetails(true);}}>Compare</button>
      </span>
      <span className="n7-guide-group"><small aria-hidden="true">ΣΚΗΝΗ</small>
        <button type="button" aria-pressed={effects} onClick={changeEffects}>Effects {effects?"On":"Off"}</button>
        <button type="button" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>Technical details</button>
        <a href={N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"))+"/avatar-3d/"} target="_blank" rel="noopener noreferrer">Πραγματικό 3D</a>
        <button type="button" className="n7-guide-assembly" disabled={!effects} onClick={replayAssembly}>{mode==="assembly"?"Replay Assembly":"Assembly"}</button>
        {/* Skip keeps its slot when it does not apply, so the dock and the figure never jump. */}
        {mode==="assembly"||!done?<button type="button" onClick={skip}>Skip</button>:<button type="button" disabled aria-hidden="true" tabIndex={-1} style={{visibility:"hidden"}}>Skip</button>}
      </span>
    </footer>
  </section>;
}
