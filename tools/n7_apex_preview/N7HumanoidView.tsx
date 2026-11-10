"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { N7_HUMANOID_REFERENCE } from "./N7HumanoidReference";

type ViewMode = "particle" | "original" | "compare";
type Stats = { particles:number; sampleW:number; sampleH:number; renderMs:number };

const VERT = `
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uPointSize;
  void main(){
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
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

function ParticleReference({enabled,onStats}:{enabled:boolean;onStats:(s:Stats)=>void}) {
  const hostRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!enabled||!hostRef.current) return;
    const host=hostRef.current;
    let disposed=false;
    let renderer:THREE.WebGLRenderer|null=null;
    let geometry:THREE.BufferGeometry|null=null;
    let material:THREE.ShaderMaterial|null=null;
    let ro:ResizeObserver|null=null;

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

      // Strictly image-driven: keep every non-dark source sample.
      // No procedural lines or invented anatomy.
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

          positions.push(
            x-sampleW/2+.5,
            sampleH/2-y-.5,
            0
          );
          colors.push(r,g,b);
        }
      }

      const scene=new THREE.Scene();
      const camera=new THREE.OrthographicCamera(-sampleW/2,sampleW/2,sampleH/2,-sampleH/2,.1,1000);
      camera.position.z=10;

      geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));

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

      const draw=()=>{
        if(!renderer||!material) return;
        const rect=host.getBoundingClientRect();
        renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);

        // One source sample should visually occupy roughly one source-cell
        // after scaling, preventing the "dust cloud" gaps of earlier versions.
        const displayScale=Math.min(rect.width/sampleW,rect.height/sampleH);
        material.uniforms.uPointSize.value=Math.max(1.15,displayScale*1.18);

        const t0=performance.now();
        renderer.render(scene,camera);
        onStats({
          particles:positions.length/3,
          sampleW,
          sampleH,
          renderMs:Math.round((performance.now()-t0)*10)/10,
        });
      };

      draw();
      ro=new ResizeObserver(draw);
      ro.observe(host);
    };

    return()=>{
      disposed=true;
      ro?.disconnect();
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      host.replaceChildren();
    };
  },[enabled,onStats]);

  return <div ref={hostRef} aria-label="N7 image-sampled particle humanoid" style={{position:"absolute",inset:0}}/>;
}

export default function N7HumanoidView({open,onClose}:{open:boolean;onClose:()=>void}) {
  const reduced=useMemo(()=>typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,[]);
  const [mode,setMode]=useState<ViewMode>("particle");
  const [details,setDetails]=useState(false);
  const [stats,setStats]=useState<Stats>({particles:0,sampleW:0,sampleH:0,renderMs:0});

  if(!open) return null;

  return <section role="dialog" aria-modal="true" aria-label="N7 Humanoid preview"
    style={{position:"fixed",inset:0,zIndex:120,background:"#000",color:"#e9fbff",fontFamily:"system-ui,sans-serif",overflow:"hidden"}}>
    <header style={{position:"absolute",top:14,left:18,right:18,zIndex:5,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div>
        <strong style={{letterSpacing:4,color:"#62e8f7"}}>N7 · HUMANOID</strong>
        <div style={{fontSize:11,opacity:.62}}>Guide Stage 1 · approved idle artwork → image-sampled particles</div>
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
        {(mode==="particle"||mode==="compare")&&<ParticleReference enabled onStats={setStats}/>}
        {mode==="compare"&&<div style={{position:"absolute",top:10,left:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>REFERENCE 38% + PARTICLE RECONSTRUCTION</div>}
      </div>
    </div>

    <div style={{position:"absolute",left:"50%",bottom:16,transform:"translateX(-50%)",zIndex:5,width:"min(880px,calc(100vw - 24px))"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",padding:9,background:"#030c13df",border:"1px solid #204f60",borderRadius:10,backdropFilter:"blur(10px)"}}>
        <button type="button" onClick={()=>setMode("original")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="original"?"#115068":"#07131b",cursor:"pointer"}}>Original</button>
        <button type="button" onClick={()=>setMode("particle")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="particle"?"#115068":"#07131b",cursor:"pointer"}}>Particles</button>
        <button type="button" onClick={()=>setMode("compare")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode==="compare"?"#115068":"#07131b",cursor:"pointer"}}>Compare</button>
        <button type="button" onClick={()=>setDetails(x=>!x)} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#07131b",cursor:"pointer"}}>Technical details</button>
      </div>
      {details&&<div style={{marginTop:6,padding:9,background:"#02080dee",border:"1px solid #204856",borderRadius:8,fontSize:11,lineHeight:1.55}}>
        <b>Stage 1 diagnostics</b> · source sample {stats.sampleW||"—"}×{stats.sampleH||"—"} · particles {stats.particles||"loading"} · render {stats.renderMs||"—"} ms · sRGB · tone mapping OFF · reduced motion {reduced?"ON":"OFF"}.
        <br/>No assembly, listening, thinking, speech, head turn, breathing or extra lighting is enabled. This stage exists only to approve resting-image fidelity.
      </div>}
    </div>
  </section>;
}
