"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { N7_IDLE_IMAGE } from "./N7HumanoidIdle";

type Mode = "particles" | "reference" | "compare";
type Stats = { particles:number; glow:number; width:number; height:number; renderMs:number };

const TILE_VERTEX = `
  attribute vec2 uvCenter;
  varying vec2 vUvCenter;
  uniform float uPointSize;
  void main() {
    vUvCenter = uvCenter;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPointSize;
  }
`;

const TILE_FRAGMENT = `
  precision highp float;
  varying vec2 vUvCenter;
  uniform sampler2D uArtwork;
  uniform vec2 uTexel;
  uniform float uPatchRadius;
  uniform vec3 uBg;
  uniform float uOpacity;

  float keepPixel(vec3 c) {
    float lum = dot(c, vec3(.2126,.7152,.0722));
    float dist = distance(c, uBg);
    float cyan = max(0.0, ((c.g + c.b) * .5) - c.r);
    return step(.045, dist) + step(.16, lum) + step(.055, cyan);
  }

  void main() {
    vec2 local = (gl_PointCoord - vec2(.5)) * 2.0;
    if (max(abs(local.x), abs(local.y)) > 1.0) discard;

    vec2 uv = vUvCenter + local * uTexel * uPatchRadius;
    vec4 tex = texture2D(uArtwork, uv);

    float edge = 1.0 - smoothstep(.82, 1.0, max(abs(local.x), abs(local.y)));
    float keep = clamp(keepPixel(tex.rgb), 0.0, 1.0);
    float a = tex.a * edge * keep * uOpacity;
    if (a < .025) discard;

    gl_FragColor = vec4(tex.rgb, a);
  }
`;

const GLOW_VERTEX = `
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uPointSize;
  void main() {
    vColor=color;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
    gl_PointSize=uPointSize;
  }
`;

const GLOW_FRAGMENT = `
  precision mediump float;
  varying vec3 vColor;
  uniform float uOpacity;
  void main() {
    vec2 p=gl_PointCoord-vec2(.5);
    float d=length(p);
    if(d>.5) discard;
    float a=smoothstep(.5,.06,d)*uOpacity;
    gl_FragColor=vec4(vColor,a);
  }
`;

function ParticleCanvas({enabled,onStats}:{enabled:boolean;onStats:(s:Stats)=>void}) {
  const hostRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!enabled||!hostRef.current) return;
    const host=hostRef.current;
    let disposed=false;
    let ro:ResizeObserver|null=null;
    let renderer:THREE.WebGLRenderer|null=null;
    const disposables:Array<{dispose:()=>void}>=[];

    const image=new Image();
    image.decoding="async";
    image.src=N7_IDLE_IMAGE;

    image.onload=()=>{
      if(disposed) return;

      const viewport=Math.max(window.innerWidth,1);
      const sampleW=viewport>=1400?320:viewport>=900?256:192;
      const sampleH=Math.round(sampleW*1.5);
      const step=2;

      const sampleCanvas=document.createElement("canvas");
      sampleCanvas.width=sampleW;
      sampleCanvas.height=sampleH;
      const ctx=sampleCanvas.getContext("2d",{willReadFrequently:true});
      if(!ctx) return;
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(image,0,0,sampleW,sampleH);
      const px=ctx.getImageData(0,0,sampleW,sampleH).data;

      const margin=Math.max(3,Math.round(sampleW*.02));
      const bgCoords=[
        [margin,margin],[sampleW-margin-1,margin],
        [margin,sampleH-margin-1],[sampleW-margin-1,sampleH-margin-1],
        [sampleW>>1,margin],[sampleW>>1,sampleH-margin-1]
      ];
      const bg=bgCoords.reduce((acc,[x,y])=>{
        const i=(y*sampleW+x)*4;
        acc[0]+=px[i]/255; acc[1]+=px[i+1]/255; acc[2]+=px[i+2]/255;
        return acc;
      },[0,0,0]).map(v=>v/bgCoords.length);

      const pos:number[]=[];
      const uvCenters:number[]=[];
      const glowPos:number[]=[];
      const glowCol:number[]=[];

      const worldW=405, worldH=607.5;
      const sx=worldW/sampleW, sy=worldH/sampleH;

      for(let y=0;y<sampleH;y+=step){
        for(let x=0;x<sampleW;x+=step){
          const i=(y*sampleW+x)*4;
          const r=px[i]/255,g=px[i+1]/255,b=px[i+2]/255,a=px[i+3]/255;
          if(a<.04) continue;

          const lum=.2126*r+.7152*g+.0722*b;
          const dist=Math.hypot(r-bg[0],g-bg[1],b-bg[2]);
          const cyan=Math.max(0,((g+b)*.5)-r);
          const nx=(x-sampleW/2)/(sampleW/2);
          const ny=(y-sampleH/2)/(sampleH/2);
          const bodyZone=(nx*nx*.72+ny*ny)<.96;

          // Only place a tile where the source actually contains humanoid/aura information.
          if(!(dist>.045||lum>.16||cyan>.055||(bodyZone&&(lum>.105||dist>.028)))) continue;

          const z=bodyZone?1.5:-1.0;
          pos.push((x-sampleW/2)*sx,(sampleH/2-y)*sy,z);
          uvCenters.push((x+.5)/sampleW,1.0-(y+.5)/sampleH);

          if(lum>.45||cyan>.17){
            glowPos.push((x-sampleW/2)*sx,(sampleH/2-y)*sy,z+1.0);
            glowCol.push(Math.min(1,r*.92+.03),Math.min(1,g*1.06),Math.min(1,b*1.10));
          }
        }
      }

      const scene=new THREE.Scene();
      const camera=new THREE.OrthographicCamera(-230,230,345,-345,.1,1000);
      camera.position.z=500;

      const texture=new THREE.CanvasTexture(sampleCanvas);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.minFilter=THREE.LinearFilter;
      texture.magFilter=THREE.LinearFilter;
      texture.generateMipmaps=false;
      disposables.push(texture);

      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
      geometry.setAttribute("uvCenter",new THREE.Float32BufferAttribute(uvCenters,2));
      disposables.push(geometry);

      const tileMat=new THREE.ShaderMaterial({
        vertexShader:TILE_VERTEX,
        fragmentShader:TILE_FRAGMENT,
        transparent:true,
        depthWrite:false,
        blending:THREE.NormalBlending,
        uniforms:{
          uArtwork:{value:texture},
          uPointSize:{value:viewport>=1400?4.4:4.8},
          uTexel:{value:new THREE.Vector2(1/sampleW,1/sampleH)},
          uPatchRadius:{value:1.35},
          uBg:{value:new THREE.Vector3(bg[0],bg[1],bg[2])},
          uOpacity:{value:1.0},
        },
      });
      disposables.push(tileMat);
      scene.add(new THREE.Points(geometry,tileMat));

      const glowGeometry=new THREE.BufferGeometry();
      glowGeometry.setAttribute("position",new THREE.Float32BufferAttribute(glowPos,3));
      glowGeometry.setAttribute("color",new THREE.Float32BufferAttribute(glowCol,3));
      disposables.push(glowGeometry);

      const glowMat=new THREE.ShaderMaterial({
        vertexShader:GLOW_VERTEX,
        fragmentShader:GLOW_FRAGMENT,
        vertexColors:true,
        transparent:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
        uniforms:{
          uPointSize:{value:viewport>=1400?5.8:6.2},
          uOpacity:{value:.18},
        },
      });
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
          width:sampleW,
          height:sampleH,
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
      disposables.forEach(x=>x.dispose());
      renderer?.dispose();
      host.replaceChildren();
    };
  },[enabled,onStats]);

  return <div ref={hostRef} aria-label="N7 textured-tile humanoid" style={{position:"absolute",inset:0}}/>;
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
        <div style={{fontSize:11,opacity:.6}}>Stage 2 · textured image tiles, not color dots</div>
      </div>
      <button type="button" onClick={onClose} style={{padding:"9px 13px",border:"1px solid #2c6c7e",background:"#091823",color:"#dffbff",borderRadius:7,cursor:"pointer"}}>Exit</button>
    </header>

    <div style={{position:"absolute",inset:"62px 0 92px",display:"grid",placeItems:"center"}}>
      <div style={{position:"relative",height:"100%",aspectRatio:"2/3",maxWidth:"92vw",overflow:"hidden",filter:particleVisible?"drop-shadow(0 0 14px rgba(53,224,255,.12))":"none"}}>
        {referenceVisible&&<img src={N7_IDLE_IMAGE} alt="Approved N7 idle reference"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain",opacity:mode==="compare"&&effects?.22:1}}/>}
        {particleVisible&&<ParticleCanvas enabled onStats={setStats}/>}
        {mode==="compare"&&effects&&<div style={{position:"absolute",top:10,left:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>REFERENCE 22% + TEXTURED TILES</div>}
      </div>
    </div>

    <div style={{position:"absolute",left:"50%",bottom:18,transform:"translateX(-50%)",zIndex:4,width:"min(900px,calc(100vw - 28px))"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",padding:9,background:"#04101adb",border:"1px solid #245b70",borderRadius:10,backdropFilter:"blur(10px)"}}>
        {(["particles","reference","compare"] as Mode[]).map(x=><button key={x} type="button" onClick={()=>setMode(x)}
          style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mode===x?"#115068":"#091721",cursor:"pointer"}}>
          {x==="particles"?"Textured tiles":x==="reference"?"Original":"Compare"}
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
        <b>Stage 2 diagnostics</b> · source {stats.width||"—"}×{stats.height||"—"} · textured tiles {stats.particles||"loading"} · glow points {stats.glow||"—"} · render {stats.renderMs||"—"} ms · sRGB · tone mapping OFF.
        <br/>Each visible particle now displays a local patch of the approved artwork. Head-turn, moods, birth and breathing remain disabled until the resting form is approved.
      </div>}
    </div>
  </section>;
}
