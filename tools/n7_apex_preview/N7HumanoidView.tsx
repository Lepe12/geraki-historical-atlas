"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { N7_HUMANOID_REFERENCE } from "./N7HumanoidReference";

type ViewMode = "assembly" | "particle" | "original" | "compare";
type Stats = { particles:number; sampleW:number; sampleH:number; renderMs:number; assembly:number };

const VERT = `
  attribute vec3 color;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPointSize;

  void main(){
    vColor = color;
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    gl_PointSize = uPointSize;
  }
`;

const FRAG = `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;

  void main(){
    vec2 p = gl_PointCoord - vec2(.5);
    float d = length(p);
    if(d > .56 || vAlpha < .01) discard;
    float edge = 1.0 - smoothstep(.40,.56,d);
    gl_FragColor = vec4(vColor, edge * vAlpha);
  }
`;

function clamp01(v:number){ return Math.max(0,Math.min(1,v)); }
function smooth01(v:number){ const x=clamp01(v); return x*x*(3-2*x); }

function ParticleReference({
  enabled,
  assembly,
  replayKey,
  reduced,
  onStats,
  onAssemblyDone,
}:{
  enabled:boolean;
  assembly:boolean;
  replayKey:number;
  reduced:boolean;
  onStats:(s:Stats)=>void;
  onAssemblyDone:()=>void;
}) {
  const hostRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!enabled||!hostRef.current) return;
    const host=hostRef.current;
    let disposed=false;
    let renderer:THREE.WebGLRenderer|null=null;
    let geometry:THREE.BufferGeometry|null=null;
    let material:THREE.ShaderMaterial|null=null;
    let positionAttr:THREE.BufferAttribute|null=null;
    let alphaAttr:THREE.BufferAttribute|null=null;
    let ro:ResizeObserver|null=null;
    let raf=0;
    let start=0;
    let lastFrame=0;
    let completed=false;
    let currentProgress=assembly&&!reduced ? 0 : 1;

    const image=new Image();
    image.decoding="async";
    image.src=N7_HUMANOID_REFERENCE;

    image.onload=()=>{
      if(disposed) return;

      const sampleW=320;
      const sampleH=480;
      const canvas=document.createElement("canvas");
      canvas.width=sampleW;
      canvas.height=sampleH;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx) return;

      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(image,0,0,sampleW,sampleH);
      const pixels=ctx.getImageData(0,0,sampleW,sampleH).data;

      const finals:number[]=[];
      const colors:number[]=[];
      const launchDelays:number[]=[];
      const jitter:number[]=[];

      // One point = one sampled artwork pixel/color.
      for(let y=0;y<sampleH;y++){
        for(let x=0;x<sampleW;x++){
          const i=(y*sampleW+x)*4;
          const r=pixels[i]/255;
          const g=pixels[i+1]/255;
          const b=pixels[i+2]/255;
          const a=pixels[i+3]/255;
          const lum=.2126*r+.7152*g+.0722*b;
          const chroma=Math.max(r,g,b)-Math.min(r,g,b);
          if(a<.03) continue;
          if(lum<.025 && chroma<.025) continue;

          const fx=x-sampleW/2+.5;
          const fy=sampleH/2-y-.5;
          finals.push(fx,fy,0);
          colors.push(r,g,b);

          // Guide Step 4: the body completes left-to-right.
          let delay=((fx+sampleW/2)/sampleW)*.66;

          // The head dome closes late; the central face ignites last.
          if(fy>72) delay+=.10;
          if(fy>72 && Math.abs(fx)<72) delay+=.10;
          launchDelays.push(Math.min(.82,delay));

          const h=((x*73856093)^(y*19349663))>>>0;
          jitter.push(((h%2001)-1000)/1000);
        }
      }

      const finalArray=new Float32Array(finals);
      const currentArray=new Float32Array(finalArray.length);
      const alphaArray=new Float32Array(finalArray.length/3);

      const sourceX=-145;
      const sourceY=-175;

      if(assembly&&!reduced){
        for(let n=0;n<alphaArray.length;n++){
          const j=n*3;
          currentArray[j]=sourceX;
          currentArray[j+1]=sourceY;
          currentArray[j+2]=0;
          alphaArray[n]=0;
        }
      }else{
        currentArray.set(finalArray);
        alphaArray.fill(1);
      }

      const scene=new THREE.Scene();
      const camera=new THREE.OrthographicCamera(-sampleW/2,sampleW/2,sampleH/2,-sampleH/2,.1,1000);
      camera.position.z=10;

      geometry=new THREE.BufferGeometry();
      positionAttr=new THREE.BufferAttribute(currentArray,3);
      positionAttr.setUsage(THREE.DynamicDrawUsage);
      alphaAttr=new THREE.BufferAttribute(alphaArray,1);
      alphaAttr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position",positionAttr);
      geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
      geometry.setAttribute("alpha",alphaAttr);

      material=new THREE.ShaderMaterial({
        vertexShader:VERT,
        fragmentShader:FRAG,
        vertexColors:true,
        transparent:true,
        depthWrite:false,
        blending:THREE.NormalBlending,
        uniforms:{uPointSize:{value:2}},
      });

      scene.add(new THREE.Points(geometry,material));

      renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:"high-performance"});
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.NoToneMapping;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
      host.replaceChildren(renderer.domElement);

      const applyAssembly=(progress:number)=>{
        currentProgress=progress;
        if(!positionAttr||!alphaAttr) return;

        const arr=positionAttr.array as Float32Array;
        const aa=alphaAttr.array as Float32Array;

        if(!assembly || reduced || progress>=1){
          arr.set(finalArray);
          aa.fill(1);
          positionAttr.needsUpdate=true;
          alphaAttr.needsUpdate=true;
          return;
        }

        for(let n=0;n<launchDelays.length;n++){
          const j=n*3;
          const delay=launchDelays[n];
          const local=clamp01((progress-delay)/.18);
          const eased=smooth01(local);

          if(local<=0){
            arr[j]=sourceX;
            arr[j+1]=sourceY;
            arr[j+2]=0;
            aa[n]=0;
            continue;
          }

          const fx=finalArray[j];
          const fy=finalArray[j+1];

          if(local>=1){
            arr[j]=fx;
            arr[j+1]=fy;
            arr[j+2]=0;
            aa[n]=1;
            continue;
          }

          // Guide: particles pour from one source, arc over in a river,
          // then rain down into their exact final pixel positions.
          const jv=jitter[n];
          const cx=-35 + fx*.28 + jv*9;
          const cy=218 + Math.max(0,fy)*.10 + Math.abs(jv)*10;

          const inv=1-eased;
          arr[j]=inv*inv*sourceX + 2*inv*eased*cx + eased*eased*fx;
          arr[j+1]=inv*inv*sourceY + 2*inv*eased*cy + eased*eased*fy;
          arr[j+2]=Math.sin(eased*Math.PI)*(5+jv*2);
          aa[n]=Math.min(1,local*3);
        }

        positionAttr.needsUpdate=true;
        alphaAttr.needsUpdate=true;
      };

      const renderFrame=(progress:number)=>{
        if(!renderer||!material) return;
        applyAssembly(progress);

        const rect=host.getBoundingClientRect();
        renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
        const displayScale=Math.min(rect.width/sampleW,rect.height/sampleH);
        material.uniforms.uPointSize.value=Math.max(1.35,displayScale*1.34);

        const t0=performance.now();
        renderer.render(scene,camera);
        onStats({
          particles:finalArray.length/3,
          sampleW,
          sampleH,
          renderMs:Math.round((performance.now()-t0)*10)/10,
          assembly:Math.round(progress*100),
        });
      };

      const tick=(now:number)=>{
        if(disposed) return;
        if(!start) start=now;
        if(now-lastFrame<24){
          raf=requestAnimationFrame(tick);
          return;
        }
        lastFrame=now;

        const duration=6000;
        const raw=reduced?1:Math.min(1,(now-start)/duration);
        renderFrame(raw);

        if(raw<1){
          raf=requestAnimationFrame(tick);
        }else if(!completed){
          completed=true;
          onAssemblyDone();
        }
      };

      if(assembly){
        if(reduced){
          renderFrame(1);
          completed=true;
          onAssemblyDone();
        }else{
          renderFrame(0);
          raf=requestAnimationFrame(tick);
        }
      }else{
        renderFrame(1);
      }

      ro=new ResizeObserver(()=>renderFrame(currentProgress));
      ro.observe(host);
    };

    return()=>{
      disposed=true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      host.replaceChildren();
    };
  },[enabled,assembly,replayKey,reduced,onStats,onAssemblyDone]);

  return <div
    ref={hostRef}
    aria-label={assembly?"N7 assembling particle humanoid":"N7 image-sampled particle humanoid"}
    style={{position:"absolute",inset:0}}
  />;
}

export default function N7HumanoidView({open,onClose}:{open:boolean;onClose:()=>void}) {
  const systemReduced=useMemo(()=>typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,[]);
  const [allowMotion,setAllowMotion]=useState(false);
  const reduced=systemReduced&&!allowMotion;

  const [mode,setMode]=useState<ViewMode>("particle");
  const [details,setDetails]=useState(false);
  const [replayKey,setReplayKey]=useState(0);
  const [assemblyDone,setAssemblyDone]=useState(false);
  const [stats,setStats]=useState<Stats>({particles:0,sampleW:0,sampleH:0,renderMs:0,assembly:100});

  const handleAssemblyDone=useCallback(()=>setAssemblyDone(true),[]);

  if(!open) return null;

  const startAssembly=()=>{
    setAssemblyDone(false);
    setMode("assembly");
    setReplayKey(x=>x+1);
  };

  const faceIgnited=mode==="assembly" && stats.assembly>=91;

  return <section role="dialog" aria-modal="true" aria-label="N7 Humanoid preview"
    style={{position:"fixed",inset:0,zIndex:120,background:"#000",color:"#e9fbff",fontFamily:"system-ui,sans-serif",overflow:"hidden"}}>
    <header style={{position:"absolute",top:14,left:18,right:18,zIndex:5,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div>
        <strong style={{letterSpacing:4,color:"#62e8f7"}}>N7 · HUMANOID</strong>
        <div style={{fontSize:11,opacity:.62}}>Guide Step 4 · source → particle river → left-to-right build → face ignition → exact idle</div>
      </div>
      <button type="button" onClick={onClose} style={{padding:"9px 13px",border:"1px solid #2c6c7e",background:"#091823",color:"#dffbff",borderRadius:7,cursor:"pointer"}}>Exit</button>
    </header>

    <div style={{position:"absolute",inset:"58px 0 104px",display:"grid",placeItems:"center"}}>
      <div style={{position:"relative",height:"100%",aspectRatio:"2/3",maxWidth:"94vw",overflow:"hidden"}}>
        {(mode==="original"||mode==="compare")&&<img
          src={N7_HUMANOID_REFERENCE}
          alt="Approved N7 idle reference"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",opacity:mode==="compare"?.38:1}}
        />}

        {(mode==="particle"||mode==="compare"||mode==="assembly")&&<ParticleReference
          enabled
          assembly={mode==="assembly"}
          replayKey={replayKey}
          reduced={reduced}
          onStats={setStats}
          onAssemblyDone={handleAssemblyDone}
        />}

        {mode==="assembly"&&!assemblyDone&&<div
          aria-label="N7 visible assembly source"
          style={{
            position:"absolute",left:"4.7%",top:"86.5%",
            width:20,height:20,marginLeft:-10,marginTop:-10,borderRadius:"50%",
            background:"radial-gradient(circle,#fff7c7 0 10%,#ffb000 27%,#ff7a00aa 48%,transparent 72%)",
            boxShadow:"0 0 18px #ffad00,0 0 42px #ff7a0088",
            pointerEvents:"none"
          }}
        />}

        {faceIgnited&&<div
          aria-label="N7 face ignition"
          style={{
            position:"absolute",left:"50%",top:"30.1%",
            width:34,height:34,marginLeft:-17,marginTop:-17,borderRadius:"50%",
            background:"radial-gradient(circle,#fff8d8 0 8%,#ffbd2e 24%,#ff7a0077 44%,transparent 72%)",
            boxShadow:"0 0 18px #ffb000,0 0 38px #ff7a0077",
            opacity:assemblyDone ? .35 : Math.min(1,(stats.assembly-90)/7),
            pointerEvents:"none"
          }}
        />}

        {mode==="assembly"&&<div style={{position:"absolute",top:10,left:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>
          ASSEMBLY · {assemblyDone?"COMPLETE":`${stats.assembly}%`}
        </div>}

        {mode==="compare"&&<div style={{position:"absolute",top:10,left:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>REFERENCE 38% + PARTICLE RECONSTRUCTION</div>}
      </div>
    </div>

    <div style={{position:"absolute",left:"50%",bottom:16,transform:"translateX(-50%)",zIndex:5,width:"min(980px,calc(100vw - 24px))"}}>
      {systemReduced&&!allowMotion&&<div style={{marginBottom:6,padding:"7px 10px",background:"#241b08dd",border:"1px solid #806421",borderRadius:8,fontSize:11,textAlign:"center"}}>
        Reduced motion is enabled on this device, so the guide requires Assembly to skip animation.
        <button type="button" onClick={()=>setAllowMotion(true)} style={{marginLeft:8,padding:"5px 8px",border:"1px solid #a47a26",borderRadius:5,background:"#38270b",color:"#fff0c4",cursor:"pointer"}}>Animate this session</button>
      </div>}

      <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",padding:9,background:"#030c13df",border:"1px solid #204f60",borderRadius:10,backdropFilter:"blur(10px)"}}>
        <button type="button" onClick={startAssembly} style={{padding:"8px 11px",border:"1px solid #8b5d20",borderRadius:6,color:"#fff0c4",background:mode==="assembly"?"#6d3e0c":"#171006",cursor:"pointer"}}>{mode==="assembly"?"Replay Assembly":"Assembly"}</button>
        {mode==="assembly"&&!assemblyDone&&<button type="button" onClick={()=>setMode("particle")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#07131b",cursor:"pointer"}}>Skip</button>}
        <button type="button" onClick={()=>setMode("original")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="original"?"#115068":"#07131b",cursor:"pointer"}}>Original</button>
        <button type="button" onClick={()=>setMode("particle")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="particle"?"#115068":"#07131b",cursor:"pointer"}}>Particles</button>
        <button type="button" onClick={()=>setMode("compare")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="compare"?"#115068":"#07131b",cursor:"pointer"}}>Compare</button>
        <button type="button" onClick={()=>setDetails(x=>!x)} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#07131b",cursor:"pointer"}}>Technical details</button>
      </div>

      {details&&<div style={{marginTop:6,padding:9,background:"#02080dee",border:"1px solid #204856",borderRadius:8,fontSize:11,lineHeight:1.55}}>
        <b>Step 4 diagnostics</b> · source sample {stats.sampleW||"—"}×{stats.sampleH||"—"} · particles {stats.particles||"loading"} · render {stats.renderMs||"—"} ms · assembly {stats.assembly}% · duration 6s · sRGB · tone mapping OFF · reduced motion {reduced?"ON":"OFF"}.
        <br/>Every particle carries its sampled artwork color. Completion is left-to-right; head/face are delayed; the last frame uses the exact approved Stage-1 positions.
      </div>}
    </div>
  </section>;
}
