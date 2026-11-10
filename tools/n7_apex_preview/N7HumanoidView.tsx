"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { N7_HUMANOID_REFERENCE } from "./N7HumanoidReference";

type ViewMode = "assembly" | "particle" | "original" | "compare";
type Stats = { particles:number; sampleW:number; sampleH:number; renderMs:number; assembly:number };

const VERT = `
  attribute vec3 color;
  attribute vec3 origin;
  attribute float delay;
  varying vec3 vColor;
  uniform float uPointSize;
  uniform float uProgress;
  uniform float uAssembly;

  void main(){
    vColor = color;
    vec3 p = position;

    if(uAssembly > 0.5){
      float local = clamp((uProgress - delay) / max(0.001, 1.0 - delay), 0.0, 1.0);
      local = local * local * (3.0 - 2.0 * local);
      p = mix(origin, position, local);

      // Gentle outward arc from the chest source. The final point is always
      // the exact source-image sample position when local reaches 1.
      float arc = sin(local * 3.14159265);
      float side = sign(position.x);
      p.x += side * arc * (8.0 + abs(position.x) * 0.055);
      p.y += arc * (10.0 + max(position.y, 0.0) * 0.025);
      p.z += arc * 8.0;
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
    gl_PointSize = uPointSize;
  }
`;

const FRAG = `
  precision mediump float;
  varying vec3 vColor;
  void main(){
    vec2 p = gl_PointCoord - vec2(.5);
    float d = length(p);
    if(d > .56) discard;
    float edge = 1.0 - smoothstep(.42,.56,d);
    gl_FragColor = vec4(vColor, edge);
  }
`;

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
    let ro:ResizeObserver|null=null;
    let raf=0;
    let start=0;
    let completed=false;

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

      const positions:number[]=[];
      const colors:number[]=[];
      const origins:number[]=[];
      const delays:number[]=[];

      // Exact Stage-1 sampling remains unchanged.
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

          const px=x-sampleW/2+.5;
          const py=sampleH/2-y-.5;
          positions.push(px,py,0);
          colors.push(r,g,b);

          // Deterministic origin around the amber chest core.
          // No randomness/flicker: each sample always has the same path.
          const h=((x*73856093)^(y*19349663))>>>0;
          const angle=(h%10000)/10000*Math.PI*2;
          const radius=2+((h>>>8)%1000)/1000*10;
          origins.push(
            Math.cos(angle)*radius,
            -88+Math.sin(angle)*radius,
            ((h>>>16)%1000)/1000*8-4
          );

          // Build lower torso/shoulders first, then neck/head/hair.
          // Distance from source adds a small secondary stagger.
          const vertical=clamp01((py+235)/470);
          const dist=Math.min(1,Math.hypot(px,py+88)/300);
          delays.push(Math.min(.58,vertical*.44+dist*.14));
        }
      }

      const scene=new THREE.Scene();
      const camera=new THREE.OrthographicCamera(-sampleW/2,sampleW/2,sampleH/2,-sampleH/2,.1,1000);
      camera.position.z=10;

      geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
      geometry.setAttribute("origin",new THREE.Float32BufferAttribute(origins,3));
      geometry.setAttribute("delay",new THREE.Float32BufferAttribute(delays,1));

      material=new THREE.ShaderMaterial({
        vertexShader:VERT,
        fragmentShader:FRAG,
        vertexColors:true,
        transparent:true,
        depthWrite:false,
        blending:THREE.NormalBlending,
        uniforms:{
          uPointSize:{value:2},
          uProgress:{value:assembly&& !reduced ? 0 : 1},
          uAssembly:{value:assembly ? 1 : 0},
        },
      });

      scene.add(new THREE.Points(geometry,material));

      renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:"high-performance"});
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.NoToneMapping;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
      host.replaceChildren(renderer.domElement);

      const renderFrame=(progress:number)=>{
        if(!renderer||!material) return;
        const rect=host.getBoundingClientRect();
        renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
        const displayScale=Math.min(rect.width/sampleW,rect.height/sampleH);
        material.uniforms.uPointSize.value=Math.max(1.15,displayScale*1.18);
        material.uniforms.uProgress.value=progress;

        const t0=performance.now();
        renderer.render(scene,camera);
        onStats({
          particles:positions.length/3,
          sampleW,
          sampleH,
          renderMs:Math.round((performance.now()-t0)*10)/10,
          assembly:Math.round(progress*100),
        });
      };

      const tick=(now:number)=>{
        if(disposed) return;
        if(!start) start=now;
        const duration=3200;
        const raw=reduced?1:Math.min(1,(now-start)/duration);
        const eased=1-Math.pow(1-raw,3);
        renderFrame(eased);
        if(raw<1){
          raf=requestAnimationFrame(tick);
        }else if(!completed){
          completed=true;
          onAssemblyDone();
        }
      };

      if(assembly){
        raf=requestAnimationFrame(tick);
      }else{
        renderFrame(1);
      }

      ro=new ResizeObserver(()=>{
        const p=material?.uniforms.uProgress.value ?? 1;
        renderFrame(p);
      });
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

  return <div ref={hostRef} aria-label={assembly?"N7 assembling particle humanoid":"N7 image-sampled particle humanoid"} style={{position:"absolute",inset:0}}/>;
}

function clamp01(v:number){ return Math.max(0,Math.min(1,v)); }

export default function N7HumanoidView({open,onClose}:{open:boolean;onClose:()=>void}) {
  const reduced=useMemo(()=>typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,[]);
  const [mode,setMode]=useState<ViewMode>("particle");
  const [details,setDetails]=useState(false);
  const [replayKey,setReplayKey]=useState(0);
  const [assemblyDone,setAssemblyDone]=useState(false);
  const [stats,setStats]=useState<Stats>({particles:0,sampleW:0,sampleH:0,renderMs:0,assembly:100});

  if(!open) return null;

  const startAssembly=()=>{
    setAssemblyDone(false);
    setMode("assembly");
    setReplayKey(x=>x+1);
  };

  return <section role="dialog" aria-modal="true" aria-label="N7 Humanoid preview"
    style={{position:"fixed",inset:0,zIndex:120,background:"#000",color:"#e9fbff",fontFamily:"system-ui,sans-serif",overflow:"hidden"}}>
    <header style={{position:"absolute",top:14,left:18,right:18,zIndex:5,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div>
        <strong style={{letterSpacing:4,color:"#62e8f7"}}>N7 · HUMANOID</strong>
        <div style={{fontSize:11,opacity:.62}}>Guide Stage 2 · approved idle artwork → chest-core assembly → exact idle</div>
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
          onAssemblyDone={()=>setAssemblyDone(true)}
        />}

        {mode==="assembly"&&<div aria-label="N7 amber assembly core" style={{
          position:"absolute",
          left:"50%",
          top:"68.3%",
          width:22,
          height:22,
          marginLeft:-11,
          marginTop:-11,
          borderRadius:"50%",
          background:"radial-gradient(circle,#fff7c7 0 12%,#ffb000 30%,#ff7a00aa 48%,transparent 72%)",
          boxShadow:"0 0 18px #ffad00,0 0 42px #ff7a0088",
          opacity:assemblyDone?.35:1,
          transform:`scale(${assemblyDone?.85:1})`,
          transition:"opacity .45s ease, transform .45s ease",
          pointerEvents:"none"
        }}/>}

        {mode==="assembly"&&<div style={{position:"absolute",top:10,left:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>
          ASSEMBLY · {assemblyDone?"COMPLETE":`${stats.assembly}%`}
        </div>}
        {mode==="compare"&&<div style={{position:"absolute",top:10,left:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>REFERENCE 38% + PARTICLE RECONSTRUCTION</div>}
      </div>
    </div>

    <div style={{position:"absolute",left:"50%",bottom:16,transform:"translateX(-50%)",zIndex:5,width:"min(960px,calc(100vw - 24px))"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",padding:9,background:"#030c13df",border:"1px solid #204f60",borderRadius:10,backdropFilter:"blur(10px)"}}>
        <button type="button" onClick={startAssembly} style={{padding:"8px 11px",border:"1px solid #8b5d20",borderRadius:6,color:"#fff0c4",background:mode==="assembly"?"#6d3e0c":"#171006",cursor:"pointer"}}>{mode==="assembly"?"Replay Assembly":"Assembly"}</button>
        {mode==="assembly"&&!assemblyDone&&<button type="button" onClick={()=>setMode("particle")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#07131b",cursor:"pointer"}}>Skip</button>}
        <button type="button" onClick={()=>setMode("original")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="original"?"#115068":"#07131b",cursor:"pointer"}}>Original</button>
        <button type="button" onClick={()=>setMode("particle")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="particle"?"#115068":"#07131b",cursor:"pointer"}}>Particles</button>
        <button type="button" onClick={()=>setMode("compare")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="compare"?"#115068":"#07131b",cursor:"pointer"}}>Compare</button>
        <button type="button" onClick={()=>setDetails(x=>!x)} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#07131b",cursor:"pointer"}}>Technical details</button>
      </div>
      {details&&<div style={{marginTop:6,padding:9,background:"#02080dee",border:"1px solid #204856",borderRadius:8,fontSize:11,lineHeight:1.55}}>
        <b>Stage 2 diagnostics</b> · source sample {stats.sampleW||"—"}×{stats.sampleH||"—"} · particles {stats.particles||"loading"} · render {stats.renderMs||"—"} ms · assembly {stats.assembly}% · sRGB · tone mapping OFF · reduced motion {reduced?"ON":"OFF"}.
        <br/>Assembly reuses the exact approved Stage-1 image samples. It changes particle position over time only; final positions and colors are unchanged.
      </div>}
    </div>
  </section>;
}
