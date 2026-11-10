"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { N7_HUMANOID_REFERENCE } from "./N7HumanoidReference";

type ViewMode = "assembly" | "particle" | "original" | "compare";
type Mood = "idle" | "listening" | "thinking" | "speaking";
type N7Activity = "thinking" | "speaking" | null;
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
  headTurnRef,
  onStats,
  onAssemblyDone,
}:{
  enabled:boolean;
  assembly:boolean;
  replayKey:number;
  reduced:boolean;
  headTurnRef?:React.MutableRefObject<number>;
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

    const handlePointerMove=(e:PointerEvent|MouseEvent)=>{
      if(assembly || !headTurnRef) return;
      const rect=host.getBoundingClientRect();
      if(rect.width<=0) return;
      const nx=(e.clientX-(rect.left+rect.width/2))/(rect.width*.42);
      const target=Math.max(-1,Math.min(1,nx));
      headTurnRef.current=target;
      host.dataset.headTarget=target.toFixed(3);
    };
    const handlePointerReset=()=>{
      if(headTurnRef) headTurnRef.current=0;
      host.dataset.headTarget="0.000";
    };
    window.addEventListener("pointermove",handlePointerMove,{passive:true});
    window.addEventListener("mousemove",handlePointerMove,{passive:true});
    window.addEventListener("blur",handlePointerReset);
    document.addEventListener("mouseleave",handlePointerReset);

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
      const baseColors:number[]=[];
      const headMask:number[]=[];
      const headDepth:number[]=[];
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
          baseColors.push(r,g,b);

          // Guide Step 5: depth illusion only for the head. The body stays
          // fixed and the neutral front remains the untouched Stage-1 layout.
          const isHead=fy>25 && Math.abs(fx)<108;
          headMask.push(isHead?1:0);
          if(isHead){
            const nx=fx/100;
            const ny=(fy-104)/120;
            const inside=Math.max(0,1-nx*nx-ny*ny);
            headDepth.push(Math.sqrt(inside)*42);
          }else{
            headDepth.push(0);
          }

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
      const colorArray=new Float32Array(colors);

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
      const colorAttr=new THREE.BufferAttribute(colorArray,3);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("color",colorAttr);
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

      let currentTurn=0;

      const applyHeadTurn=()=>{
        if(assembly || !positionAttr) return;
        const target=clamp01(((headTurnRef?.current ?? 0)+1)/2)*2-1;
        currentTurn+=(target-currentTurn)*.11;
        if(Math.abs(target-currentTurn)<.0005) currentTurn=target;

        const angle=currentTurn*0.28; // ~16 degrees max: intentionally conservative.
        const cs=Math.cos(angle), sn=Math.sin(angle);
        const arr=positionAttr.array as Float32Array;
        const cc=colorAttr.array as Float32Array;

        for(let n=0;n<headMask.length;n++){
          const j=n*3;
          const fx=finalArray[j], fy=finalArray[j+1];
          if(!headMask[n]){
            arr[j]=fx; arr[j+1]=fy; arr[j+2]=0;
            cc[j]=baseColors[j]; cc[j+1]=baseColors[j+1]; cc[j+2]=baseColors[j+2];
            continue;
          }

          const z=headDepth[n];
          // Rotate each head sample around a neck-centered vertical axis.
          const xr=fx*cs + z*sn;
          const zr=-fx*sn + z*cs;
          arr[j]=xr;
          arr[j+1]=fy;
          arr[j+2]=zr;

          // Far side darkens; near silhouette gets a restrained cyan lift.
          const far=currentTurn===0?0:Math.max(0,Math.sign(currentTurn)*fx/108);
          const edge=Math.max(0,(Math.abs(fx)-72)/36)*Math.abs(currentTurn);
          const shade=1-far*.38;
          cc[j]=Math.min(1,baseColors[j]*shade + edge*.03);
          cc[j+1]=Math.min(1,baseColors[j+1]*shade + edge*.16);
          cc[j+2]=Math.min(1,baseColors[j+2]*shade + edge*.22);
        }
        positionAttr.needsUpdate=true;
        colorAttr.needsUpdate=true;
      };

      const renderFrame=(progress:number)=>{
        if(!renderer||!material) return;
        applyAssembly(progress);
        applyHeadTurn();

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
        // Idle renderer stays alive so mouse-follow can glide continuously.
        const idleTick=()=>{
          if(disposed) return;
          renderFrame(1);
          raf=requestAnimationFrame(idleTick);
        };
        raf=requestAnimationFrame(idleTick);
      }

      ro=new ResizeObserver(()=>renderFrame(currentProgress));
      ro.observe(host);
    };

    return()=>{
      disposed=true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove",handlePointerMove);
      window.removeEventListener("mousemove",handlePointerMove);
      window.removeEventListener("blur",handlePointerReset);
      document.removeEventListener("mouseleave",handlePointerReset);
      if(headTurnRef) headTurnRef.current=0;
      ro?.disconnect();
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      host.replaceChildren();
    };
  },[enabled,assembly,replayKey,reduced,headTurnRef,onStats,onAssemblyDone]);

  return <div
    ref={hostRef}
    aria-label={assembly?"N7 assembling particle humanoid":"N7 image-sampled particle humanoid"}
    style={{position:"absolute",inset:0}}
  />;
}


function MoodCanvas({mood}:{mood:Mood}) {
  const hostRef=useRef<HTMLDivElement>(null);
  const targetMoodRef=useRef<Mood>(mood);
  const previousMoodRef=useRef<Mood>(mood);
  const transitionStartRef=useRef(0);

  useEffect(()=>{
    previousMoodRef.current=targetMoodRef.current;
    targetMoodRef.current=mood;
    transitionStartRef.current=performance.now();
  },[mood]);

  useEffect(()=>{
    if(!hostRef.current) return;
    const host=hostRef.current;
    let disposed=false;
    let raf=0;
    let ro:ResizeObserver|null=null;

    const canvas=document.createElement("canvas");
    canvas.width=320;
    canvas.height=480;
    canvas.style.width="100%";
    canvas.style.height="100%";
    canvas.style.display="block";
    const ctx=canvas.getContext("2d",{alpha:true});
    if(!ctx) return;
    host.replaceChildren(canvas);

    const image=new Image();
    image.decoding="async";
    image.src=N7_HUMANOID_REFERENCE;

    image.onload=()=>{
      if(disposed) return;
      const sample=document.createElement("canvas");
      sample.width=320; sample.height=480;
      const sctx=sample.getContext("2d",{willReadFrequently:true});
      if(!sctx) return;
      sctx.drawImage(image,0,0,320,480);
      const px=sctx.getImageData(0,0,320,480).data;

      type P={x:number;y:number;r:number;g:number;b:number};
      const points:P[]=[];
      for(let y=0;y<480;y+=2){
        for(let x=0;x<320;x+=2){
          const i=(y*320+x)*4;
          const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];
          const lum=.2126*r+.7152*g+.0722*b;
          const chroma=Math.max(r,g,b)-Math.min(r,g,b);
          if(a<8 || (lum<7 && chroma<7)) continue;
          points.push({x:x+.5,y:y+.5,r,g,b});
        }
      }

      const colorFor=(p:P,state:Mood,now:number)=>{
        let r=p.r,g=p.g,b=p.b;
        const dx=p.x-160, dy=p.y-150;
        const dFace=Math.hypot(dx,dy);
        const head=p.y<215;
        const face=dFace<88;
        const cyan=b>r*1.15 && g>r*1.05;
        const amber=r>g*1.15 && g>b*1.2;

        if(state==="listening"){
          if(cyan){ g=Math.min(255,g*1.18+16); b=Math.min(255,b*1.25+24); r=Math.min(255,r*.92); }
          if(amber){ r*=.86; g*=.88; b*=.92; }
        }else if(state==="thinking"){
          // Keep Thinking inside the existing N7 palette. The head becomes
          // denser/brighter cyan-white; the existing amber samples receive
          // only a restrained lift instead of a foreign yellow wash.
          if(head){
            const k=Math.max(0,1-dFace/145);
            if(cyan){
              r=Math.min(255,r + 34*k);
              g=Math.min(255,g + 72*k);
              b=Math.min(255,b + 92*k);
            }else{
              r=Math.min(255,r + 22*k);
              g=Math.min(255,g + 34*k);
              b=Math.min(255,b + 42*k);
            }
            if(amber){
              r=Math.min(255,r + 28*k);
              g=Math.min(255,g + 12*k);
              b=Math.min(255,b + 4*k);
            }
          }else{
            r*=.90; g*=.94; b*=.97;
          }
        }else if(state==="speaking"){
          const pulse=.68+.32*Math.sin(now/115);
          if(face){
            const k=Math.max(0,1-dFace/92)*pulse;
            r=Math.min(255,r + 135*k);
            g=Math.min(255,g + 70*k);
            b=Math.max(0,b - 35*k);
          }
          if(cyan){ g=Math.min(255,g*1.08); b=Math.min(255,b*1.12); }
        }
        return [Math.round(r),Math.round(g),Math.round(b)] as const;
      };

      const draw=(now:number)=>{
        if(disposed) return;
        ctx.clearRect(0,0,320,480);

        const prev=previousMoodRef.current;
        const target=targetMoodRef.current;
        const elapsed=Math.max(0,now-transitionStartRef.current);
        const t=clamp01(elapsed/1000);
        const radius=t*390;
        const soft=28;

        // Idle with no transition stays transparent so the proven Stage-1
        // particle renderer remains the exact resting image.
        const settledIdle=target==="idle" && t>=1;
        if(!settledIdle){
          for(const p of points){
            const d=Math.hypot(p.x-160,p.y-150);
            let mix=0;
            if(t>=1) mix=1;
            else mix=clamp01((radius-d+soft)/(soft*2));
            mix=smooth01(mix);

            const a=colorFor(p,prev,now);
            const b=colorFor(p,target,now);
            let rr=a[0]+(b[0]-a[0])*mix;
            let gg=a[1]+(b[1]-a[1])*mix;
            let bb=a[2]+(b[2]-a[2])*mix;

            const rim=Math.max(0,1-Math.abs(d-radius)/16)*(t<1?1:0);
            rr=Math.min(255,rr+35*rim);
            gg=Math.min(255,gg+80*rim);
            bb=Math.min(255,bb+115*rim);

            ctx.fillStyle="rgb("+Math.round(rr)+","+Math.round(gg)+","+Math.round(bb)+")";
            ctx.globalAlpha=.94;
            ctx.fillRect(p.x-.7,p.y-.7,1.4,1.4);
          }

          // Listening adds quiet outward cyan rings around the head.
          if(target==="listening" && t>.2){
            ctx.globalAlpha=.34;
            ctx.strokeStyle="rgb(90,230,255)";
            ctx.lineWidth=1.2;
            const phase=(now/900)%1;
            for(let i=0;i<3;i++){
              const q=(phase+i/3)%1;
              ctx.beginPath();
              ctx.arc(160,150,72+q*42,0,Math.PI*2);
              ctx.stroke();
            }
          }
        }

        ctx.globalAlpha=1;
        raf=requestAnimationFrame(draw);
      };

      transitionStartRef.current=performance.now();
      raf=requestAnimationFrame(draw);
      ro=new ResizeObserver(()=>{});
      ro.observe(host);
    };

    return()=>{
      disposed=true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      host.replaceChildren();
    };
  },[]);

  return <div
    ref={hostRef}
    aria-label="N7 mood particle overlay"
    style={{position:"absolute",inset:0,pointerEvents:"none"}}
  />;
}

function AssemblyCanvas({
  replayKey,
  onStats,
  onAssemblyDone,
}:{
  replayKey:number;
  onStats:(s:Stats)=>void;
  onAssemblyDone:()=>void;
}) {
  const hostRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!hostRef.current) return;
    const host=hostRef.current;
    let disposed=false;
    let raf=0;
    let ro:ResizeObserver|null=null;
    let start=0;
    let finished=false;
    let progress=0;

    const canvas=document.createElement("canvas");
    canvas.width=320;
    canvas.height=480;
    canvas.style.width="100%";
    canvas.style.height="100%";
    canvas.style.display="block";
    const ctx=canvas.getContext("2d",{alpha:true});
    if(!ctx) return;
    host.replaceChildren(canvas);

    const image=new Image();
    image.decoding="async";
    image.src=N7_HUMANOID_REFERENCE;

    image.onload=()=>{
      if(disposed) return;

      const sample=document.createElement("canvas");
      sample.width=320;
      sample.height=480;
      const sctx=sample.getContext("2d",{willReadFrequently:true});
      if(!sctx) return;
      sctx.drawImage(image,0,0,320,480);
      const px=sctx.getImageData(0,0,320,480).data;

      type P={fx:number;fy:number;r:number;g:number;b:number;delay:number;j:number};
      const particles:P[]=[];

      for(let y=0;y<480;y+=2){
        for(let x=0;x<320;x+=2){
          const i=(y*320+x)*4;
          const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];
          const lum=.2126*r+.7152*g+.0722*b;
          const chroma=Math.max(r,g,b)-Math.min(r,g,b);
          if(a<8 || (lum<7 && chroma<7)) continue;

          let delay=(x/320)*.68;
          if(y<168) delay+=.08;
          if(y<168 && x>105 && x<215) delay+=.10;
          const h=((x*73856093)^(y*19349663))>>>0;
          particles.push({
            fx:x+.5,fy:y+.5,r,g,b,
            delay:Math.min(.84,delay),
            j:((h%2001)-1000)/1000
          });
        }
      }

      const sx=15, sy=415;

      const draw=(p:number)=>{
        progress=p;
        ctx.clearRect(0,0,320,480);
        ctx.globalCompositeOperation="lighter";

        if(p>=.999){
          ctx.globalCompositeOperation="source-over";
          ctx.drawImage(image,0,0,320,480);
          onStats({particles:particles.length,sampleW:320,sampleH:480,renderMs:0,assembly:100});
          return;
        }

        const t0=performance.now();
        for(const q of particles){
          const local=clamp01((p-q.delay)/.20);
          if(local<=0) continue;

          const e=smooth01(local);
          let x:number,y:number,alpha:number;
          if(local>=1){
            x=q.fx; y=q.fy; alpha=1;
          }else{
            const cx=105 + q.fx*.28 + q.j*10;
            const cy=38 - Math.max(0,160-q.fy)*.04 - Math.abs(q.j)*8;
            const inv=1-e;
            x=inv*inv*sx + 2*inv*e*cx + e*e*q.fx;
            y=inv*inv*sy + 2*inv*e*cy + e*e*q.fy;
            alpha=Math.min(1,local*3);
          }

          ctx.globalAlpha=alpha;
          ctx.fillStyle="rgb("+q.r+","+q.g+","+q.b+")";
          const size=local<1 ? 1.8 : 1.25;
          ctx.fillRect(x-size/2,y-size/2,size,size);
        }
        ctx.globalAlpha=1;
        ctx.globalCompositeOperation="source-over";
        onStats({
          particles:particles.length,
          sampleW:320,
          sampleH:480,
          renderMs:Math.round((performance.now()-t0)*10)/10,
          assembly:Math.round(p*100)
        });
      };

      const tick=(now:number)=>{
        if(disposed) return;
        if(!start) start=now;
        const raw=Math.min(1,(now-start)/6000);
        draw(raw);
        if(raw<1){
          raf=requestAnimationFrame(tick);
        }else if(!finished){
          finished=true;
          onAssemblyDone();
        }
      };

      draw(0);
      raf=requestAnimationFrame(tick);
      ro=new ResizeObserver(()=>draw(progress));
      ro.observe(host);
    };

    return()=>{
      disposed=true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      host.replaceChildren();
    };
  },[replayKey,onStats,onAssemblyDone]);

  return <div
    ref={hostRef}
    aria-label="N7 guide particle-river assembly"
    style={{position:"absolute",inset:0}}
  />;
}

export default function N7HumanoidView({open,onClose,activity}:{open:boolean;onClose:()=>void;activity?:N7Activity}) {
  const systemReduced=useMemo(()=>typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,[]);
  const [allowMotion,setAllowMotion]=useState(false);
  const reduced=systemReduced&&!allowMotion;

  const [mode,setMode]=useState<ViewMode>("particle");
  const [details,setDetails]=useState(false);
  const [mood,setMood]=useState<Mood>("idle");
  const autoThinkingRef=useRef(false);
  const [replayKey,setReplayKey]=useState(0);
  const [assemblyDone,setAssemblyDone]=useState(false);
  const [stats,setStats]=useState<Stats>({particles:0,sampleW:0,sampleH:0,renderMs:0,assembly:100});
  const headTurnRef=useRef(0);

  const handleAssemblyDone=useCallback(()=>setAssemblyDone(true),[]);

  useEffect(()=>{
    if(!open) return;
    if(activity==="thinking"){
      autoThinkingRef.current=true;
      setMood("thinking");
      setMode("particle");
    }else if(autoThinkingRef.current){
      autoThinkingRef.current=false;
      setMood("idle");
    }
  },[activity,open]);

  if(!open) return null;

  const startAssembly=()=>{
    // Clicking Assembly is an explicit request to animate this session.
    // Do not silently skip because the OS/browser reports reduced motion.
    setAllowMotion(true);
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
        <div style={{fontSize:11,opacity:.62}}>Guide Step 3–5 · moods + Assembly + conservative mouse-follow head depth</div>
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

        {(mode==="particle"||mode==="compare")&&<ParticleReference
          enabled
          assembly={false}
          replayKey={replayKey}
          reduced={false}
          headTurnRef={headTurnRef}
          onStats={setStats}
          onAssemblyDone={handleAssemblyDone}
        />}

        {(mode==="particle"||mode==="compare")&&<MoodCanvas mood={mood} />}

        {mode==="assembly"&&<AssemblyCanvas
          replayKey={replayKey}
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
        {(mode==="particle"||mode==="compare")&&<div aria-label="N7 mood status" style={{position:"absolute",top:10,right:10,padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:11}}>
          MOOD · {mood.toUpperCase()}{mood==="thinking"&&activity==="thinking"?" · LIVE N7 REQUEST":mood==="listening"||mood==="speaking"?" · PREVIEW":""}
        </div>}
        {(mode==="particle"||mode==="compare")&&<div aria-label="N7 head turn hint" style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",padding:"5px 8px",background:"#03111dcc",border:"1px solid #285d70",borderRadius:5,fontSize:10,opacity:.72,pointerEvents:"none"}}>
          MOVE POINTER · HEAD FOLLOW
        </div>}
      </div>
    </div>

    <div style={{position:"absolute",left:"50%",bottom:16,transform:"translateX(-50%)",zIndex:5,width:"min(980px,calc(100vw - 24px))"}}>
      {systemReduced&&!allowMotion&&<div style={{marginBottom:6,padding:"7px 10px",background:"#241b08dd",border:"1px solid #806421",borderRadius:8,fontSize:11,textAlign:"center"}}>
        Reduced motion is enabled on this device. Pressing <b>Assembly</b> will explicitly play the animation for this session.
      </div>}

      <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",padding:9,background:"#030c13df",border:"1px solid #204f60",borderRadius:10,backdropFilter:"blur(10px)"}}>
        <button type="button" onClick={startAssembly} style={{padding:"8px 11px",border:"1px solid #8b5d20",borderRadius:6,color:"#fff0c4",background:mode==="assembly"?"#6d3e0c":"#171006",cursor:"pointer"}}>{mode==="assembly"?"Replay Assembly":"Assembly"}</button>
        {mode==="assembly"&&!assemblyDone&&<button type="button" onClick={()=>setMode("particle")} style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:"#07131b",cursor:"pointer"}}>Skip</button>}
        {(["idle","listening","thinking","speaking"] as Mood[]).map(s=><button key={s} type="button"
          onClick={()=>{autoThinkingRef.current=false;setMood(s);setMode("particle");}}
          aria-pressed={mood===s}
          style={{padding:"8px 11px",border:"1px solid #28667a",borderRadius:6,color:"#defaff",background:mood===s?"#115068":"#07131b",cursor:"pointer"}}>
          {s[0].toUpperCase()+s.slice(1)}
        </button>)}
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
