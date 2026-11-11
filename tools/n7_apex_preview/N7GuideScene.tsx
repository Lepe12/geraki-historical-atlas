"use client";
import { useEffect, useRef } from "react";
import { createHeadSurface } from "./N7HeadSurface";
import { N7_HUMANOID_REFERENCE } from "./N7HumanoidReference";

export type GuideMood="idle"|"listening"|"thinking"|"speaking";
export type GuideMode="assembly"|"particle"|"original"|"compare";
export type GuideFrameInfo={turn:number;breath:number;progress:number;shock:number;ignition:number;renderMs:number;particles:number;frameMs:number};
export type GuideSceneProps={mode:GuideMode;mood:GuideMood;effects:boolean;reduced:boolean;breathing:boolean;replay:number;manualMotion:boolean;diagnostics:boolean;onComplete:()=>void;onFrame:(f:GuideFrameInfo)=>void};
const moods:GuideMood[]=["idle","listening","thinking","speaking"];

// A single Three.js scene owns source tiles, moods, assembly and breathing.
// The native canvas is an immutable reference/fallback, never an animated layer.
export default function N7GuideScene(props:GuideSceneProps){
  const hostRef=useRef<HTMLDivElement>(null),config=useRef(props);
  useEffect(()=>{config.current=props;},[props]);
  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    let disposed=false,raf=0,target=0,current=0,last=0,lastStats=0;
    let surface:ReturnType<typeof createHeadSurface>|undefined;
    let mode:GuideMode|null=null,replay=-1,assemblyStart:number|null=null,completed=false,shockStart:number|null=null,breathStart=0;
    let baseMood=0,lastMood:GuideMood="idle",lastEffects=true,lastReduced=false;
    let transitions:{mood:number;start:number}[]=[];
    const reference=document.createElement("canvas");reference.width=320;reference.height=480;
    Object.assign(reference.style,{width:"100%",height:"100%",display:"none"});
    const ctx=reference.getContext("2d",{willReadFrequently:true});if(!ctx)return;
    host.replaceChildren(reference);
    const clearTarget=()=>{target=0;host.dataset.headTarget="0.000";};
    const pointer=(event:PointerEvent)=>{
      const c=config.current;
      if(event.target instanceof Element&&event.target.closest("button,input,select,textarea,a"))return;
      if(!c.effects||c.reduced||c.mode==="original"||c.mode==="assembly"&&!completed){clearTarget();return;}
      const r=host.getBoundingClientRect();if(!r.width)return;
      target=Math.max(-1,Math.min(1,(event.clientX-r.left-r.width/2)/(r.width*.42)));
      if(Math.abs(target)<.1)target=0;
      host.dataset.headTarget=target.toFixed(3);
    };
    window.addEventListener("pointermove",pointer,{passive:true});window.addEventListener("blur",clearTarget);document.addEventListener("mouseleave",clearTarget);
    const image=new Image();image.decoding="async";
    image.onload=()=>{
      if(disposed)return;
      ctx.drawImage(image,0,0);ctx.putImageData(ctx.getImageData(0,0,320,480),0,0);
      try{surface=createHeadSurface(reference);}catch(e){host.dataset.renderError=String(e);reference.style.display="block";return;}
      Object.assign(surface.canvas.style,{width:"100%",height:"100%",display:"none"});host.append(surface.canvas);
      host.dataset.renderer="shared-edge-texture-mesh";host.dataset.engine="three-shared-scene";
      host.dataset.referenceReady="true";host.dataset.headTarget="0.000";
      const draw=(now:number)=>{
        if(disposed)return;
        const c=config.current,rawDt=last?now-last:16.67,dt=Math.min(100,rawDt);last=now;
        if(lastReduced!==c.reduced){breathStart=now;lastReduced=c.reduced;}
        const previousMode=mode;
        if(mode!==c.mode||replay!==c.replay){
          mode=c.mode;replay=c.replay;shockStart=null;
          if(mode==="assembly"){assemblyStart=now;breathStart=now;completed=false;clearTarget();current=0;}
          else{if(!completed||previousMode===null||previousMode==="original")breathStart=now;assemblyStart=null;completed=true;
            if(replay!==-1){baseMood=moods.indexOf(c.mood);lastMood=c.mood;transitions=[];}
          }
          if(previousMode==="assembly"&&mode!=="assembly")host.dataset.cancelledAssembly="true";
        }
        if(!c.effects||lastEffects!==c.effects){
          shockStart=null;breathStart=now;clearTarget();current=0;
          if(!c.effects){baseMood=0;transitions=[];}
        }
        lastEffects=c.effects;
        const canAssemble=c.effects&&(!c.reduced||c.manualMotion);
        const progress=mode==="assembly"&&assemblyStart!==null&&canAssemble?Math.min(1,(now-assemblyStart)/6000):1;
        if(mode==="assembly"&&!canAssemble)assemblyStart=null;
        if(mode==="assembly"&&progress>=1&&!completed){
          completed=true;breathStart=now;shockStart=c.effects&&!c.reduced?now:null;c.onComplete();
        }
        if(!c.effects||c.reduced){shockStart=null;clearTarget();current=0;if(c.reduced){baseMood=moods.indexOf(c.effects?c.mood:"idle");transitions=[];}}
        if(mode==="original"){clearTarget();current=0;}
        current+=(target-current)*(1-Math.exp(-dt/42));if(Math.abs(target-current)<.0001)current=target;
        const desired=c.effects?c.mood:"idle";
        if(desired!==lastMood){
          if(!c.effects||c.reduced){baseMood=moods.indexOf(desired);transitions=[];}
          else{
            // Concurrent radial changes move toward the newest state; no queue.
            if(transitions.length&&now-transitions.at(-1)!.start>=1000){baseMood=transitions.at(-1)!.mood;transitions=[];}
            transitions.push({mood:moods.indexOf(desired),start:now});
            if(transitions.length>4){baseMood=transitions.shift()!.mood;}
          }
          lastMood=desired;
        }
        if(transitions.length&&now-transitions.at(-1)!.start>=1000){baseMood=transitions.at(-1)!.mood;transitions=[];}
        const age=Math.max(0,now-breathStart);
        const breath=c.effects&&!c.reduced&&c.breathing&&progress>=1&&mode!=="original"
          ?Math.sin(age/7200*Math.PI*2)*Math.min(1,age/1000):0;
        const shock=shockStart!==null?(now-shockStart)/2500:-1;
        if(shock>1)shockStart=null;
        const wave=shock>=0&&shock<=1?shock:-1;
        const ignition=c.effects&&!c.reduced?(progress<1?Math.max(0,(progress-.91)/.09):wave>=0?Math.max(0,1-wave*3):0):0;
        const exact=mode==="original"||!c.effects||progress===1&&current===0&&breath===0&&baseMood===0&&!transitions.length&&ignition===0;
        const start=performance.now();
        if(exact){surface!.canvas.style.display="none";reference.style.display="block";}
        else{
          reference.style.display="none";surface!.canvas.style.display="block";
          surface!.render({turn:current,breath,assembly:progress,baseMood,states:transitions.map(t=>t.mood),ages:transitions.map(t=>Math.min(1,(now-t.start)/1000)),ignition,time:c.reduced?0:now/1000});
        }
        const renderMs=performance.now()-start;
        host.dataset.currentTurn=current.toFixed(4);host.dataset.assemblyProgress=progress.toFixed(4);
        host.dataset.breath=breath.toFixed(4);host.dataset.shock=wave.toFixed(4);
        host.dataset.referenceVisible=String(exact);host.dataset.mood=desired;
        if(c.diagnostics){host.dataset.renderMs=renderMs.toFixed(3);host.dataset.frameMs=rawDt.toFixed(3);host.dataset.moodRadius=String(transitions.length?Math.min(1,(now-transitions.at(-1)!.start)/1000)*430:430);}
        // The callback writes visual refs; React diagnostics are throttled there.
        c.onFrame({turn:current,breath,progress,shock:wave,ignition,renderMs,particles:surface!.particles,frameMs:rawDt});
        if(c.diagnostics&&now-lastStats>500){lastStats=now;host.dataset.particleCount=String(surface!.particles);}
        raf=requestAnimationFrame(draw);
      };
      raf=requestAnimationFrame(draw);
    };
    image.src=N7_HUMANOID_REFERENCE;
    return()=>{disposed=true;cancelAnimationFrame(raf);surface?.dispose();window.removeEventListener("pointermove",pointer);window.removeEventListener("blur",clearTarget);document.removeEventListener("mouseleave",clearTarget);host.replaceChildren();};
  },[]);
  return <div ref={hostRef} aria-label="N7 guide artwork-tile humanoid" style={{position:"absolute",inset:0}} />;
}
