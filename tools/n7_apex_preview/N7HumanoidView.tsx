"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { N7_IDLE_IMAGE } from "./N7HumanoidIdle";

type Mode = "particles" | "reference" | "compare";

function ParticleCanvas({ enabled, onStats }: { enabled: boolean; onStats: (s: { particles:number; width:number; height:number; fps:number }) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !hostRef.current) return;
    const host = hostRef.current;
    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.PointsMaterial | null = null;
    let ro: ResizeObserver | null = null;

    const image = new Image();
    image.decoding = "async";
    image.src = N7_IDLE_IMAGE;
    image.onload = () => {
      if (disposed) return;
      const sampleW = 180, sampleH = 270;
      const c = document.createElement("canvas");
      c.width = sampleW; c.height = sampleH;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, 0, 0, sampleW, sampleH);
      const px = ctx.getImageData(0, 0, sampleW, sampleH).data;

      const corners = [[2,2],[sampleW-3,2],[2,sampleH-3],[sampleW-3,sampleH-3]];
      const bg = corners.reduce((acc,[x,y]) => {
        const i=(y*sampleW+x)*4; acc[0]+=px[i]; acc[1]+=px[i+1]; acc[2]+=px[i+2]; return acc;
      }, [0,0,0]).map(v=>v/corners.length);

      const positions:number[] = [], colors:number[] = [];
      for (let y=0;y<sampleH;y+=1) for (let x=0;x<sampleW;x+=1) {
        const i=(y*sampleW+x)*4, r=px[i], g=px[i+1], b=px[i+2], a=px[i+3]/255;
        if (a < .05) continue;
        const dist=Math.hypot(r-bg[0],g-bg[1],b-bg[2]);
        const lum=.2126*r+.7152*g+.0722*b;
        const cx=(x-sampleW/2)/(sampleW/2), cy=(y-sampleH/2)/(sampleH/2);
        const central=(cx*cx + cy*cy*.55) < .98;
        if (dist < 20 && lum < 54 && !central) continue;
        if (dist < 11 && lum < 34) continue;
        positions.push((x-sampleW/2)*2.25, (sampleH/2-y)*2.25, 0);
        colors.push(r/255,g/255,b/255);
      }

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-230,230,345,-345,0.1,1000);
      camera.position.z=500;
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors,3));
      material = new THREE.PointsMaterial({
        size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true,
        opacity: 1, depthWrite: false, blending: THREE.NormalBlending
      });
      const points = new THREE.Points(geometry, material);
      scene.add(points);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference:"high-performance" });
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      host.replaceChildren(renderer.domElement);

      let frames=0, start=performance.now(), fps=0;
      const draw=()=>{
        if (!renderer) return;
        const rect=host.getBoundingClientRect();
        renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);
        renderer.render(scene,camera);
        frames++; const now=performance.now();
        if (now-start>500) { fps=Math.round(frames*1000/(now-start)); onStats({particles:positions.length/3,width:sampleW,height:sampleH,fps}); }
      };
      draw();
      ro=new ResizeObserver(draw); ro.observe(host);
    };
    return () => {
      disposed=true; ro?.disconnect(); geometry?.dispose(); material?.dispose(); renderer?.dispose(); host.replaceChildren();
    };
  }, [enabled, onStats]);

  return <div ref={hostRef} aria-label="N7 particle humanoid" style={{position:"absolute",inset:0}} />;
}

export default function N7HumanoidView({ open, onClose }: { open:boolean; onClose:()=>void }) {
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const [mode,setMode]=useState<Mode>("particles");
  const [effects,setEffects]=useState(!reduced);
  const [details,setDetails]=useState(false);
  const [stats,setStats]=useState({particles:0,width:0,height:0,fps:0});
  if (!open) return null;
  const particleVisible=effects && (mode==="particles" || mode==="compare");
  const referenceVisible=!effects || mode==="reference" || mode==="compare";
  return <section role="dialog" aria-modal="true" aria-label="N7 Humanoid preview"
    style={{position:"fixed",inset:0,zIndex:120,background:"radial-gradient(circle at 50% 44%,#082334 0,#030912 48%,#010307 100%)",color:"#e9fbff",fontFamily:"system-ui,sans-serif"}}>
    <header style={{position:"absolute",top:14,left:18,right:18,zIndex:4,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div><strong style={{letterSpacing:4,color:"#62e8f7"}}>N7 · HUMANOID</strong><div style={{fontSize:11,opacity:.6}}>Stage 1 · approved idle → Three.js particles</div></div>
      <button type="button" onClick={onClose} style={{padding:"9px 13px",border:"1px solid #2c6c7e",background:"#091823",color:"#dffbff",borderRadius:7,cursor:"pointer"}}>Exit</button>
    </header>

    <div style={{position:"absolute",inset:"62px 0 92px",display:"grid",placeItems:"center"}}>
      <div style={{position:"relative",height:"100%",aspectRatio:"2/3",maxWidth:"92vw",overflow:"hidden"}}>
        {referenceVisible && <img src={N7_IDLE_IMAGE} alt="Approved N7 idle reference"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",opacity:mode==="compare"&&effects?.42:1}} />}
        {particleVisible && <ParticleCanvas enabled onStats={setStats} />}
        {mode==="compare" && effects && <div style={{position:"absolute",top:10,left:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>REFERENCE + PARTICLES</div>}
      </div>
    </div>

    <div style={{position:"absolute",left:"50%",bottom:18,transform:"translateX(-50%)",zIndex:4,width:"min(880px,calc(100vw - 28px))"}}>
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
          style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#091721",cursor:"pointer"}}>Technical details</button>
      </div>
      {details && <div style={{marginTop:6,padding:10,background:"#030b12ee",border:"1px solid #244e5e",borderRadius:8,fontSize:11,lineHeight:1.6}}>
        <b>Stage 1 diagnostics</b> · source sample {stats.width||180}×{stats.height||270} · particles {stats.particles||"loading"} · render {stats.fps||"—"} fps · output sRGB · tone mapping OFF · reduced motion {reduced?"ON":"OFF"}.
        <br/>No head-turn, state bloom, birth animation, breathing or audio reaction has been enabled yet. Chat/backend remain mounted behind this view.
      </div>}
    </div>
  </section>;
}
