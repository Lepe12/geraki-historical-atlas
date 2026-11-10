"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { N7_IDLE_IMAGE } from "./N7HumanoidIdle";

type Mode = "particles" | "reference" | "compare";
type Stats = { particles:number; glow:number; width:number; height:number; renderMs:number };

const SOFT_VERTEX = `
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uPointSize;
  void main() {
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPointSize;
  }
`;

const SOFT_FRAGMENT = `
  precision mediump float;
  varying vec3 vColor;
  uniform float uOpacity;
  void main() {
    vec2 p = gl_PointCoord - vec2(.5);
    float d = length(p);
    if (d > .5) discard;
    float a = smoothstep(.5, .12, d) * uOpacity;
    gl_FragColor = vec4(vColor, a);
  }
`;

function makeMaterial(size:number, opacity:number, blending:THREE.Blending) {
  return new THREE.ShaderMaterial({
    vertexShader: SOFT_VERTEX,
    fragmentShader: SOFT_FRAGMENT,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending,
    uniforms: {
      uPointSize: { value: size },
      uOpacity: { value: opacity },
    },
  });
}

function ParticleCanvas({ enabled, onStats }: { enabled:boolean; onStats:(s:Stats)=>void }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !hostRef.current) return;
    const host = hostRef.current;
    let disposed=false;
    let ro:ResizeObserver|null=null;
    let renderer:THREE.WebGLRenderer|null=null;
    const disposables:Array<{dispose:()=>void}> = [];

    const image = new Image();
    image.decoding = "async";
    image.src = N7_IDLE_IMAGE;
    image.onload = () => {
      if (disposed) return;

      const vw=Math.max(window.innerWidth,1);
      const sampleW = vw >= 1400 ? 288 : vw >= 900 ? 240 : 180;
      const sampleH = Math.round(sampleW*1.5);
      const c=document.createElement("canvas");
      c.width=sampleW; c.height=sampleH;
      const ctx=c.getContext("2d",{willReadFrequently:true});
      if(!ctx) return;
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(image,0,0,sampleW,sampleH);
      const px=ctx.getImageData(0,0,sampleW,sampleH).data;

      const bgSamples:Array<[number,number,number]> = [];
      const margin=Math.max(3,Math.round(sampleW*.025));
      for (const [x,y] of [
        [margin,margin],[sampleW-margin-1,margin],
        [margin,sampleH-margin-1],[sampleW-margin-1,sampleH-margin-1],
        [sampleW>>1,margin],[sampleW>>1,sampleH-margin-1]
      ]) {
        const i=(y*sampleW+x)*4;
        bgSamples.push([px[i],px[i+1],px[i+2]]);
      }
      const bg=bgSamples.reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2]],[0,0,0]).map(v=>v/bgSamples.length);

      const pos:number[]=[]; const col:number[]=[];
      const glowPos:number[]=[]; const glowCol:number[]=[];
      const scaleX=405/sampleW, scaleY=607.5/sampleH;

      for(let y=0;y<sampleH;y++) for(let x=0;x<sampleW;x++){
        const i=(y*sampleW+x)*4;
        const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3]/255;
        if(a<.04) continue;

        const lum=.2126*r+.7152*g+.0722*b;
        const dist=Math.hypot(r-bg[0],g-bg[1],b-bg[2]);
        const cyan=Math.max(0,(g+b)*.5-r);
        const nx=(x-sampleW/2)/(sampleW/2);
        const ny=(y-sampleH/2)/(sampleH/2);

        // Keep the humanoid and its designed cyan aura, discard the flat dark backdrop.
        const bodyZone=(nx*nx*.72 + ny*ny) < .94;
        const visible = dist>13 || lum>42 || cyan>16 || bodyZone && (lum>27 || dist>8);
        if(!visible) continue;

        const z = bodyZone ? (1-Math.min(1,Math.abs(nx)))*3.0 : -1.0;
        pos.push((x-sampleW/2)*scaleX,(sampleH/2-y)*scaleY,z);
        col.push(r/255,g/255,b/255);

        // Only genuinely bright/cyan pixels become the second luminous layer.
        if(lum>115 || cyan>48){
          glowPos.push((x-sampleW/2)*scaleX,(sampleH/2-y)*scaleY,z+1);
          glowCol.push(Math.min(1,r/255*.9+.04),Math.min(1,g/255*1.08),Math.min(1,b/255*1.12));
        }
      }

      const scene=new THREE.Scene();
      const camera=new THREE.OrthographicCamera(-230,230,345,-345,.1,1000);
      camera.position.z=500;

      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
      geometry.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
      disposables.push(geometry);

      const baseMat=makeMaterial(vw>=1400?2.15:2.35,.98,THREE.NormalBlending);
      disposables.push(baseMat);
      scene.add(new THREE.Points(geometry,baseMat));

      const glowGeometry=new THREE.BufferGeometry();
      glowGeometry.setAttribute("position",new THREE.Float32BufferAttribute(glowPos,3));
      glowGeometry.setAttribute("color",new THREE.Float32BufferAttribute(glowCol,3));
      disposables.push(glowGeometry);
      const glowMat=makeMaterial(vw>=1400?4.6:4.9,.34,THREE.AdditiveBlending);
      disposables.push(glowMat);
      scene.add(new THREE.Points(glowGeometry,glowMat));

      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.NoToneMapping;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
      host.replaceChildren(renderer.domElement);

      const draw=()=>{
        if(!renderer) return;
        const rect=host.getBoundingClientRect();
        renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
        const t0=performance.now();
        renderer.render(scene,camera);
        onStats({
          particles:pos.length/3,
          glow:glowPos.length/3,
          width:sampleW,height:sampleH,
          renderMs:Math.round((performance.now()-t0)*10)/10,
        });
      };
      draw();
      ro=new ResizeObserver(draw); ro.observe(host);
    };

    return()=>{
      disposed=true;
      ro?.disconnect();
      disposables.forEach(x=>x.dispose());
      renderer?.dispose();
      host.replaceChildren();
    };
  },[enabled,onStats]);

  return <div ref={hostRef} aria-label="N7 particle humanoid" style={{position:"absolute",inset:0}}/>;
}

export default function N7HumanoidView({open,onClose}:{open:boolean;onClose:()=>void}) {
  const reduced=useMemo(()=>typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,[]);
  const [mode,setMode]=useState<Mode>("particles");
  const [effects,setEffects]=useState(!reduced);
  const [details,setDetails]=useState(false);
  const [stats,setStats]=useState<Stats>({particles:0,glow:0,width:0,height:0,renderMs:0});

  if(!open) return null;
  const particleVisible=effects&&(mode==="particles"||mode==="compare");
  const referenceVisible=!effects||mode==="reference"||mode==="compare";

  return <section role="dialog" aria-modal="true" aria-label="N7 Humanoid preview"
    style={{position:"fixed",inset:0,zIndex:120,background:"radial-gradient(circle at 50% 44%,#082334 0,#030912 48%,#010307 100%)",color:"#e9fbff",fontFamily:"system-ui,sans-serif",overflow:"hidden"}}>
    <header style={{position:"absolute",top:14,left:18,right:18,zIndex:4,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div>
        <strong style={{letterSpacing:4,color:"#62e8f7"}}>N7 · HUMANOID</strong>
        <div style={{fontSize:11,opacity:.6}}>Stage 1.5 · dense soft-particle reference fidelity</div>
      </div>
      <button type="button" onClick={onClose} style={{padding:"9px 13px",border:"1px solid #2c6c7e",background:"#091823",color:"#dffbff",borderRadius:7,cursor:"pointer"}}>Exit</button>
    </header>

    <div style={{position:"absolute",inset:"62px 0 92px",display:"grid",placeItems:"center"}}>
      <div style={{position:"relative",height:"100%",aspectRatio:"2/3",maxWidth:"92vw",overflow:"hidden",filter:particleVisible?"drop-shadow(0 0 18px rgba(53,224,255,.14))":"none"}}>
        {referenceVisible&&<img src={N7_IDLE_IMAGE} alt="Approved N7 idle reference"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",opacity:mode==="compare"&&effects?.28:1}}/>}
        {particleVisible&&<ParticleCanvas enabled onStats={setStats}/>}
        {mode==="compare"&&effects&&<div style={{position:"absolute",top:10,left:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>REFERENCE 28% + PARTICLES</div>}
      </div>
    </div>

    <div style={{position:"absolute",left:"50%",bottom:18,transform:"translateX(-50%)",zIndex:4,width:"min(900px,calc(100vw - 28px))"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",padding:9,background:"#04101adb",border:"1px solid #245b70",borderRadius:10,backdropFilter:"blur(10px)"}}>
        {(["particles","reference","compare"] as Mode[]).map(x=><button key={x} type="button" onClick={()=>setMode(x)}
          style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode===x?"#115068":"#091721",cursor:"pointer"}}>
          {x==="particles"?"Particles":x==="reference"?"Original":"Compare"}
        </button>)}
        <button type="button" onClick={()=>setEffects(x=>!x)}
          style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:effects?"#113747":"#30201a",cursor:"pointer"}}>
          Effects {effects?"ON":"OFF"}
        </button>
        <button type="button" onClick={()=>setDetails(x=>!x)}
          style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#091721",cursor:"pointer"}}>
          Technical details
        </button>
      </div>
      {details&&<div style={{marginTop:6,padding:10,background:"#030b12ee",border:"1px solid #244e5e",borderRadius:8,fontSize:11,lineHeight:1.6}}>
        <b>Stage 1.5 diagnostics</b> · sample {stats.width||"—"}×{stats.height||"—"} · base particles {stats.particles||"loading"} · glow particles {stats.glow||"—"} · render {stats.renderMs||"—"} ms · sRGB · tone mapping OFF · reduced motion {reduced?"ON":"OFF"}.
        <br/>No head-turn, state bloom, birth, breathing or audio reaction enabled yet. This stage only improves the resting humanoid fidelity.
      </div>}
    </div>
  </section>;
}
