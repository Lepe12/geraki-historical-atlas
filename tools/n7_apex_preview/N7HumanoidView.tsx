"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type HumanoidState = "assembly" | "idle" | "listening" | "thinking" | "speech" | "strong";
type Stats = { filaments:number; particles:number; fps:number };

const CYAN = 0x00e5ff;
const CYAN_SOFT = 0x58f2ff;
const AMBER = 0xff9d1e;
const AMBER_SOFT = 0xffc15c;

function seeded(i:number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

function headRadius(y:number) {
  const cy = 78, hh = 116, rx = 76;
  const n = Math.max(-1, Math.min(1, (y-cy)/hh));
  const ellipse = Math.sqrt(Math.max(0, 1-n*n));
  const jaw = n < -0.25 ? 0.74 + (n+1)*0.24 : 1;
  const crown = n > 0.62 ? 0.95 - (n-0.62)*0.16 : 1;
  return rx * ellipse * jaw * crown;
}

function makeLine(points:THREE.Vector3[], color:number, opacity:number, additive=false) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = new THREE.LineBasicMaterial({
    color,
    transparent:true,
    opacity,
    blending:additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite:false,
  });
  return { line:new THREE.Line(g,m), geometry:g, material:m };
}

function makeLoop(points:THREE.Vector3[], color:number, opacity:number) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
  return { line:new THREE.LineLoop(g,m), geometry:g, material:m };
}

function ringPoints(cx:number, cy:number, rx:number, ry:number, z=0, steps=96) {
  const pts:THREE.Vector3[]=[];
  for(let i=0;i<steps;i++){
    const t=(i/steps)*Math.PI*2;
    pts.push(new THREE.Vector3(cx+Math.cos(t)*rx,cy+Math.sin(t)*ry,z));
  }
  return pts;
}

function FilamentScene({ state, effects, onStats }:{state:HumanoidState;effects:boolean;onStats:(s:Stats)=>void}) {
  const hostRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!hostRef.current) return;
    const host=hostRef.current;
    let disposed=false;
    let renderer:THREE.WebGLRenderer|null=null;
    let ro:ResizeObserver|null=null;
    let raf=0;
    const disposables:Array<{dispose:()=>void}>=[];
    const animatedMaterials:THREE.Material[]=[];

    const scene=new THREE.Scene();
    const camera=new THREE.OrthographicCamera(-230,230,315,-315,.1,1000);
    camera.position.z=500;

    const root=new THREE.Group();
    const headGroup=new THREE.Group();
    const bodyGroup=new THREE.Group();
    const listeningGroup=new THREE.Group();
    scene.add(root);
    root.add(headGroup,bodyGroup,listeningGroup);

    let filamentCount=0;

    // Head silhouette.
    const outline:THREE.Vector3[]=[];
    for(let i=0;i<=160;i++){
      const t=(i/160)*Math.PI*2;
      const y=78+Math.sin(t)*116;
      const x=Math.cos(t)*headRadius(y);
      outline.push(new THREE.Vector3(x,y,4));
    }
    const outer=makeLine(outline,CYAN_SOFT,.98,true);
    headGroup.add(outer.line); disposables.push(outer.geometry,outer.material); animatedMaterials.push(outer.material); filamentCount++;

    // Horizontal facial/cranial contour bands.
    for(let j=0;j<27;j++){
      const y=-22+j*7.7;
      const r=headRadius(y);
      if(r<6) continue;
      const pts:THREE.Vector3[]=[];
      for(let i=0;i<=80;i++){
        const u=-1+(i/80)*2;
        const x=u*r;
        const curvature=(1-u*u);
        const wave=Math.sin((u+1)*Math.PI*2+j*.32)*(.8+curvature*1.6);
        pts.push(new THREE.Vector3(x,y+wave,2+curvature*2));
      }
      const q=makeLine(pts,j%4===0?CYAN_SOFT:CYAN,j%4===0?.62:.33,true);
      headGroup.add(q.line); disposables.push(q.geometry,q.material); animatedMaterials.push(q.material); filamentCount++;
    }

    // Neck edges.
    for(const side of [-1,1]){
      const pts=[
        new THREE.Vector3(side*45,-16,2),
        new THREE.Vector3(side*42,-42,1),
        new THREE.Vector3(side*48,-72,0),
        new THREE.Vector3(side*65,-100,-1),
        new THREE.Vector3(side*104,-122,-2),
        new THREE.Vector3(side*155,-136,-3),
      ];
      const c=new THREE.CatmullRomCurve3(pts);
      const q=makeLine(c.getPoints(80),CYAN_SOFT,.88,true);
      bodyGroup.add(q.line); disposables.push(q.geometry,q.material); animatedMaterials.push(q.material); filamentCount++;
    }

    // Shoulder and torso outer envelope.
    for(const side of [-1,1]){
      const c=new THREE.CatmullRomCurve3([
        new THREE.Vector3(side*45,-48,0),
        new THREE.Vector3(side*70,-92,0),
        new THREE.Vector3(side*142,-126,-1),
        new THREE.Vector3(side*184,-152,-2),
        new THREE.Vector3(side*190,-210,-3),
        new THREE.Vector3(side*150,-275,-4),
      ]);
      const q=makeLine(c.getPoints(110),CYAN_SOFT,.78,true);
      bodyGroup.add(q.line); disposables.push(q.geometry,q.material); animatedMaterials.push(q.material); filamentCount++;
    }

    // Chest filaments, symmetric and anatomical without becoming photographic.
    for(let k=0;k<17;k++){
      const frac=k/16;
      const startX=10+frac*25;
      const endX=38+frac*125;
      for(const side of [-1,1]){
        const c=new THREE.CatmullRomCurve3([
          new THREE.Vector3(side*startX,-58-k*2.3,1),
          new THREE.Vector3(side*(28+frac*28),-94-k*2.0,0),
          new THREE.Vector3(side*(65+frac*48),-132-k*1.8,-1),
          new THREE.Vector3(side*endX,-185-k*2.2,-2),
          new THREE.Vector3(side*(78+frac*36),-260,-3),
        ]);
        const q=makeLine(c.getPoints(72),k%4===0?CYAN_SOFT:CYAN,k%4===0?.34:.19,true);
        bodyGroup.add(q.line); disposables.push(q.geometry,q.material); animatedMaterials.push(q.material); filamentCount++;
      }
    }

    // Central amber neural axis.
    for(const side of [-1,1]){
      for(let k=0;k<7;k++){
        const spread=6+k*4;
        const c=new THREE.CatmullRomCurve3([
          new THREE.Vector3(side*spread*.18,55,5),
          new THREE.Vector3(side*spread*.42,16,4),
          new THREE.Vector3(side*spread*.60,-38,3),
          new THREE.Vector3(side*spread*.85,-92,2),
          new THREE.Vector3(side*spread*1.15,-150,1),
          new THREE.Vector3(side*spread*.72,-235,0),
        ]);
        const q=makeLine(c.getPoints(72),k<2?AMBER_SOFT:AMBER,k<2?.58:.24,true);
        root.add(q.line); disposables.push(q.geometry,q.material); animatedMaterials.push(q.material); filamentCount++;
      }
    }

    // Head core and chest core built as concentric rings.
    const coreMaterials:THREE.LineBasicMaterial[]=[];
    const headCoreGroup=new THREE.Group();
    const chestCoreGroup=new THREE.Group();
    root.add(headCoreGroup,chestCoreGroup);
    for(let r=0;r<7;r++){
      const a=makeLoop(ringPoints(0,62,7+r*4,7+r*4,7+r*.2,64),r<2?AMBER_SOFT:AMBER,.82-r*.085);
      headCoreGroup.add(a.line); disposables.push(a.geometry,a.material); coreMaterials.push(a.material); filamentCount++;
    }
    for(let r=0;r<5;r++){
      const a=makeLoop(ringPoints(0,-94,4+r*3.1,4+r*3.1,5+r*.15,56),r<2?AMBER_SOFT:AMBER,.76-r*.11);
      chestCoreGroup.add(a.line); disposables.push(a.geometry,a.material); coreMaterials.push(a.material); filamentCount++;
    }

    // Ambient particle volume: head + torso, deterministic so the silhouette never flickers randomly.
    const p:number[]=[];
    for(let i=0;i<4200;i++){
      const u=seeded(i*3+1), v=seeded(i*3+2), w=seeded(i*3+3);
      let x=0,y=0,z=0;
      if(i<1900){
        y=-28+v*220;
        const r=headRadius(y);
        x=(u*2-1)*r*(.55+.45*w);
        z=(w-.5)*9;
      } else {
        y=-275+v*245;
        const t=(y+275)/245;
        const maxX=105+Math.sin(Math.min(1,t)*Math.PI*.82)*88;
        x=(u*2-1)*maxX*(.48+.52*w);
        z=(w-.5)*10;
      }
      p.push(x,y,z-5);
    }
    const pg=new THREE.BufferGeometry();
    pg.setAttribute("position",new THREE.Float32BufferAttribute(p,3));
    const pm=new THREE.PointsMaterial({color:CYAN,size:1.25,transparent:true,opacity:.34,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:false});
    const points=new THREE.Points(pg,pm);
    root.add(points); disposables.push(pg,pm);

    // Listening rings live around the head only when state asks for them.
    const listenMats:THREE.LineBasicMaterial[]=[];
    for(let i=0;i<7;i++){
      const rr=98+i*14;
      const q=makeLoop(ringPoints(0,78,rr,rr*.78,-8-i,96),CYAN,.16);
      listeningGroup.add(q.line); disposables.push(q.geometry,q.material); listenMats.push(q.material); filamentCount++;
    }

    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});
    renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    host.replaceChildren(renderer.domElement);

    let assemblyStart=performance.now();
    let frames=0,fps=0,fpsStart=assemblyStart;
    const pointer={x:0,y:0};
    const onMove=(ev:PointerEvent)=>{
      const rect=host.getBoundingClientRect();
      pointer.x=((ev.clientX-rect.left)/Math.max(1,rect.width)-.5)*2;
      pointer.y=-(((ev.clientY-rect.top)/Math.max(1,rect.height)-.5)*2);
    };
    host.addEventListener("pointermove",onMove);

    const draw=(now:number)=>{
      if(!renderer||disposed) return;
      const rect=host.getBoundingClientRect();
      renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);

      const t=now*.001;
      const assembly = state==="assembly" ? Math.min(1,(now-assemblyStart)/2400) : 1;
      const ease=1-Math.pow(1-assembly,3);
      root.scale.setScalar(.985 + ease*.015);
      root.visible=assembly>.02;

      const matOpacityScale = state==="assembly" ? .08 + ease*.92 : 1;
      animatedMaterials.forEach((m:any)=>{ if("opacity" in m) m.opacity=Math.min(m.opacity,1)*matOpacityScale; });
      pm.opacity=(state==="assembly"?.06+ease*.28:.30) * (effects?1:.35);

      // State behavior.
      listeningGroup.visible=effects && state==="listening";
      listenMats.forEach((m,i)=>m.opacity=.06+.10*(.5+.5*Math.sin(t*2.3-i*.55)));
      listeningGroup.scale.setScalar(1+.025*Math.sin(t*2));

      const thinkingBoost=state==="thinking"?1.0:0.0;
      const speakingBoost=state==="speech"?.58:state==="strong"?1.0:0.0;
      headCoreGroup.scale.setScalar(1 + thinkingBoost*(.08+.06*Math.sin(t*3.2)) + speakingBoost*(.04+.05*Math.sin(t*6.0)));
      chestCoreGroup.scale.setScalar(1 + .025*Math.sin(t*1.7));
      coreMaterials.forEach((m,i)=>{
        const base=.72-i*.065;
        m.opacity=Math.max(.12,base + thinkingBoost*.15*Math.sin(t*3.6+i*.3) + speakingBoost*.12*Math.sin(t*7.5+i*.6));
      });

      // Speech ripples: face contour groups breathe forward/back subtly.
      if(state==="speech"||state==="strong"){
        const amp=state==="strong"?7:3.5;
        headGroup.position.z=Math.sin(t*7.8)*amp;
        headGroup.scale.x=1+Math.sin(t*7.8)*(.012*(state==="strong"?1.8:1));
      }else{
        headGroup.position.z=0;
        headGroup.scale.x=1;
      }

      // Gentle attention/head follow. This is deliberately restrained.
      const follow=effects && state!=="assembly" ? 1 : 0;
      headGroup.rotation.y += ((pointer.x*.12*follow)-headGroup.rotation.y)*.08;
      headGroup.rotation.x += ((pointer.y*.055*follow)-headGroup.rotation.x)*.08;

      // Idle breathing through the torso only.
      bodyGroup.scale.y=1 + (effects?.006*Math.sin(t*1.55):0);
      bodyGroup.scale.x=1 + (effects?.004*Math.sin(t*1.55):0);

      renderer.render(scene,camera);
      frames++;
      if(now-fpsStart>600){ fps=Math.round(frames*1000/(now-fpsStart)); frames=0; fpsStart=now; onStats({filaments:filamentCount,particles:p.length/3,fps}); }
      raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);
    ro=new ResizeObserver(()=>{}); ro.observe(host);

    return()=>{
      disposed=true;
      cancelAnimationFrame(raf);
      host.removeEventListener("pointermove",onMove);
      ro?.disconnect();
      disposables.forEach(x=>x.dispose());
      renderer?.dispose();
      host.replaceChildren();
    };
  },[state,effects,onStats]);

  return <div ref={hostRef} aria-label="N7 filament humanoid" style={{position:"absolute",inset:0}}/>;
}

export default function N7HumanoidView({open,onClose}:{open:boolean;onClose:()=>void}) {
  const reduced=useMemo(()=>typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,[]);
  const [state,setState]=useState<HumanoidState>("assembly");
  const [effects,setEffects]=useState(!reduced);
  const [details,setDetails]=useState(false);
  const [stats,setStats]=useState<Stats>({filaments:0,particles:0,fps:0});

  if(!open) return null;

  const labels:Record<HumanoidState,string>={
    assembly:"Assembly",
    idle:"Idle",
    listening:"Listening",
    thinking:"Thinking",
    speech:"Speech",
    strong:"Strong speech",
  };

  return <section role="dialog" aria-modal="true" aria-label="N7 Humanoid preview"
    style={{position:"fixed",inset:0,zIndex:120,background:"radial-gradient(circle at 50% 43%,#06131c 0,#02060b 48%,#000 100%)",color:"#e9fbff",fontFamily:"system-ui,sans-serif",overflow:"hidden"}}>
    <header style={{position:"absolute",top:14,left:18,right:18,zIndex:4,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
      <div>
        <strong style={{letterSpacing:4,color:"#62e8f7"}}>N7 · HUMANOID</strong>
        <div style={{fontSize:11,opacity:.62}}>Filament prototype · energy body + state field</div>
      </div>
      <button type="button" onClick={onClose} style={{padding:"9px 13px",border:"1px solid #2c6c7e",background:"#091823",color:"#dffbff",borderRadius:7,cursor:"pointer"}}>Exit</button>
    </header>

    <div style={{position:"absolute",inset:"58px 0 108px",display:"grid",placeItems:"center"}}>
      <div style={{position:"relative",height:"100%",aspectRatio:"3/4",maxWidth:"94vw",overflow:"hidden",filter:"drop-shadow(0 0 18px rgba(0,229,255,.16))"}}>
        <FilamentScene state={state} effects={effects} onStats={setStats}/>
        <div style={{position:"absolute",top:12,left:14,fontSize:10,letterSpacing:2.2,color:"#79f1ff",opacity:.68}}>STATUS · {labels[state].toUpperCase()}</div>
      </div>
    </div>

    <div style={{position:"absolute",left:"50%",bottom:16,transform:"translateX(-50%)",zIndex:4,width:"min(980px,calc(100vw - 24px))"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",padding:9,background:"#030c13df",border:"1px solid #204f60",borderRadius:10,backdropFilter:"blur(10px)"}}>
        {(Object.keys(labels) as HumanoidState[]).map(x=><button key={x} type="button" onClick={()=>setState(x)}
          style={{padding:"8px 10px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:state===x?"#115068":"#07131b",cursor:"pointer"}}>
          {labels[x]}
        </button>)}
        <button type="button" onClick={()=>setEffects(x=>!x)}
          style={{padding:"8px 10px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:effects?"#113747":"#30201a",cursor:"pointer"}}>
          Effects {effects?"ON":"OFF"}
        </button>
        <button type="button" onClick={()=>setDetails(x=>!x)}
          style={{padding:"8px 10px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#07131b",cursor:"pointer"}}>
          Technical details
        </button>
      </div>
      {details&&<div style={{marginTop:6,padding:9,background:"#02080dee",border:"1px solid #204856",borderRadius:8,fontSize:11,lineHeight:1.55}}>
        <b>Filament diagnostics</b> · contour filaments {stats.filaments||"—"} · particle volume {stats.particles||"—"} · render {stats.fps||"—"} fps · sRGB · tone mapping OFF · reduced motion {reduced?"ON":"OFF"}.
        <br/>This renderer is procedural: cyan contour geometry defines the humanoid; particles reinforce volume; amber cores drive cognition/chest energy; state effects are layered over the same identity.
      </div>}
    </div>
  </section>;
}
