"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { N7_BACKDROP_REFERENCE } from "./N7BackdropReference";

type Highlight={x:number;y:number;phase:number;sprite:HTMLCanvasElement};

export type N7BackdropHandle={wave:(x:number,y:number,radius:number,fade:number)=>void;clear:()=>void};
const N7Backdrop=forwardRef<N7BackdropHandle,{effects:boolean;reduced:boolean}>(function N7Backdrop({effects,reduced},ref) {
  const hostRef=useRef<HTMLDivElement>(null);
  const imageRef=useRef<HTMLImageElement>(null);
  const layerRef=useRef<HTMLDivElement>(null);
  const flags=useRef({effects,reduced});
  const restart=useRef<()=>void>(()=>{});
  const waveRef=useRef<(x:number,y:number,radius:number,fade:number)=>void>(()=>{});
  useImperativeHandle(ref,()=>({wave:(x,y,r,f)=>waveRef.current(x,y,r,f),clear:()=>waveRef.current(0,0,-1,0)}),[]);
  useEffect(()=>{flags.current={effects,reduced};restart.current();},[effects,reduced]);

  useEffect(()=>{
    const host=hostRef.current,image=imageRef.current,layer=layerRef.current;
    if(!host||!image||!layer) return;
    let disposed=false,loaded=false;
    const highlights:Highlight[]=[];
    let centers:{x:number;y:number}[]=[];
    const start=()=>{
      layer.style.display=flags.current.effects&&!flags.current.reduced?"block":"none";
    };
    restart.current=start;
    let layout=()=>{};
    const observer=new ResizeObserver(()=>layout());observer.observe(host);
    const load=()=>{
      if(disposed||loaded) return;
      loaded=true;
      const w=418,h=Math.round(w*image.naturalHeight/image.naturalWidth);
      const sample=document.createElement("canvas");sample.width=w;sample.height=h;
      const sctx=sample.getContext("2d",{willReadFrequently:true});
      if(!sctx) return;
      sctx.drawImage(image,0,0,w,h);
      // The only readback/analysis, once per loaded asset. Never in the RAF loop.
      const pixels=sctx.getImageData(0,0,w,h).data;
      const candidates:{x:number;y:number;score:number}[]=[];
      for(let y=12;y<h-12;y+=2) for(let x=12;x<w-12;x+=2){
        const i=(y*w+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
        const lum=.2126*r+.7152*g+.0722*b;
        if(lum>62&&((b>r*1.18&&g>r*1.12)||(r>b*1.25&&g>b*.8))) candidates.push({x,y,score:lum});
      }
      candidates.sort((a,b)=>b.score-a.score||a.y-b.y||a.x-b.x);
      for(const c of candidates){
        if(highlights.some(p=>Math.hypot(p.x-c.x,p.y-c.y)<24)) continue;
        const sprite=document.createElement("canvas");sprite.width=24;sprite.height=24;
        const sc=sprite.getContext("2d")!;const patch=sc.createImageData(24,24);
        for(let y=0;y<24;y++) for(let x=0;x<24;x++){
          const si=((c.y+y-12)*w+c.x+x-12)*4,di=(y*24+x)*4;
          const r=pixels[si],g=pixels[si+1],b=pixels[si+2];
          const lum=.2126*r+.7152*g+.0722*b;
          // Existing bright ridge pixels only, sampled color and local falloff.
          const weight=Math.max(0,1-Math.hypot(x-12,y-12)/12)*Math.max(0,(lum-48)/120);
          patch.data[di]=r;patch.data[di+1]=g;patch.data[di+2]=b;patch.data[di+3]=Math.min(120,weight*170);
        }
        sc.putImageData(patch,0,0);
        highlights.push({x:c.x,y:c.y,sprite,phase:highlights.length*2.39996});
        if(highlights.length===12) break;
      }
      for(const point of highlights){
        Object.assign(point.sprite.style,{position:"absolute",mixBlendMode:"screen",animation:"n7-ridge-light 9.6s ease-in-out infinite",animationDelay:`${-point.phase}s`});
        layer.append(point.sprite);
      }
      layout=()=>{
        const scale=Math.max(host.clientWidth/image.naturalWidth,host.clientHeight/image.naturalHeight);
        const iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;
        centers=[];
        const box=host.getBoundingClientRect();
        for(const point of highlights){
          centers.push({x:box.left+(host.clientWidth-iw)/2+point.x/w*iw,y:box.top+(host.clientHeight-ih)/2+point.y/h*ih});
          Object.assign(point.sprite.style,{
            left:`${(host.clientWidth-iw)/2+(point.x-12)/w*iw}px`,
            top:`${(host.clientHeight-ih)/2+(point.y-12)/h*ih}px`,
            width:`${24/w*iw}px`,height:`${24/h*ih}px`
          });
        }
      };
      layout();
      waveRef.current=(cx,cy,radius,fade)=>{
        for(let i=0;i<highlights.length;i++){
          const point=highlights[i],center=centers[i];
          const distance=fade>0?Math.hypot(center.x-cx,center.y-cy):0;
          const lift=flags.current.effects&&!flags.current.reduced?Math.max(0,1-Math.abs(distance-radius)/55)*fade*.5:0;
          const filter=lift>.001?`brightness(${1+lift})`:"";
          if(point.sprite.style.filter!==filter)point.sprite.style.filter=filter;
        }
      };
      host.dataset.highlightCount=String(highlights.length);
      host.dataset.analysisCount="1";
      start();
    };
    // Floating strands (owner reference: MIRA): a few long, faint silk-like
    // ribbons drifting slowly across the scene. Drawn at half resolution, about
    // 30 times a second, only while effects are on and motion is allowed.
    const strands=layer.querySelector<HTMLCanvasElement>("[data-strands]");
    const sctx2=strands?.getContext("2d")||null;
    const ribbons=Array.from({length:7},(_,i)=>({y:.12+i*.12+((i*37)%11)/100,amp:.04+((i*53)%7)/120,len:.55+((i*29)%5)/10,phase:i*1.7,speed:.018+((i*13)%5)/400,tilt:((i%3)-1)*.10,alpha:.10+((i*17)%5)/40,lines:2+(i%3)}));
    let strandRaf=0,lastStrand=0;
    const drawStrands=(now:number)=>{
      strandRaf=requestAnimationFrame(drawStrands);
      if(!strands||!sctx2||disposed)return;
      if(!flags.current.effects||flags.current.reduced||now-lastStrand<33)return;lastStrand=now;
      const w=Math.max(1,Math.round(host.clientWidth/2)),h=Math.max(1,Math.round(host.clientHeight/2));
      if(strands.width!==w||strands.height!==h){strands.width=w;strands.height=h;}
      sctx2.clearRect(0,0,w,h);const t=now/1000;
      for(const r of ribbons){
        const start=((t*r.speed+r.phase*.13)%1.6)-.55,x0=start*w,x1=(start+r.len)*w;
        const g=sctx2.createLinearGradient(x0,0,x1,0);g.addColorStop(0,"rgba(170,232,248,0)");g.addColorStop(.5,`rgba(196,240,252,${r.alpha})`);g.addColorStop(1,"rgba(170,232,248,0)");
        sctx2.strokeStyle=g;
        for(let l=0;l<r.lines;l++){
          sctx2.lineWidth=l?.6:1;sctx2.beginPath();
          for(let s=0;s<=40;s++){const f=s/40,x=x0+(x1-x0)*f,yy=(r.y+r.tilt*(f-.5)+r.amp*Math.sin(f*5.2+t*.35+r.phase)+.012*Math.sin(f*13+t*.6+r.phase))*h+l*2.2;s?sctx2.lineTo(x,yy):sctx2.moveTo(x,yy);}
          sctx2.stroke();
        }
      }
    };
    strandRaf=requestAnimationFrame(drawStrands);
    image.addEventListener("load",load);
    if(image.complete&&image.naturalWidth) load();
    return()=>{disposed=true;cancelAnimationFrame(strandRaf);observer.disconnect();for(const point of highlights)point.sprite.remove();image.removeEventListener("load",load);restart.current=()=>{};waveRef.current=()=>{};};
  },[]);

  return <div ref={hostRef} aria-label="N7 Step 6 living backdrop" data-effects={effects&&!reduced?"on":"off"}
    style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",overflow:"hidden"}}>
    <img ref={imageRef} src={N7_BACKDROP_REFERENCE} alt="Cinematic mountain landscape" style={{position:"absolute",width:"100%",height:"100%",objectFit:"cover"}} />
    <style>{`@keyframes n7-ridge-light {0%,100% {opacity:.08} 50% {opacity:.78}}@keyframes n7-smoke-drift {0% {transform:scale(1.10) translate(-1.8%,.8%)} 100% {transform:scale(1.14) translate(1.8%,-1.2%)}}`}</style>
    <div ref={layerRef} data-ridge-layer="" aria-label="Existing ridge illumination" style={{position:"absolute",inset:0}}>
      {/* Slow smoke drift: a soft, faint copy of the same raster moving very slowly. */}
      <div aria-hidden="true" data-smoke-drift="" style={{position:"absolute",inset:0,backgroundImage:`url(${N7_BACKDROP_REFERENCE})`,backgroundSize:"cover",backgroundPosition:"center",opacity:.32,mixBlendMode:"screen",filter:"blur(6px)",animation:"n7-smoke-drift 48s ease-in-out infinite alternate"}}/>
      <canvas data-strands="" aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}/>
    </div>
  </div>;
});
export default N7Backdrop;
