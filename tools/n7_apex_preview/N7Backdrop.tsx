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
    image.addEventListener("load",load);
    if(image.complete&&image.naturalWidth) load();
    return()=>{disposed=true;observer.disconnect();layer.replaceChildren();image.removeEventListener("load",load);restart.current=()=>{};waveRef.current=()=>{};};
  },[]);

  return <div ref={hostRef} aria-label="N7 Step 6 living backdrop" data-effects={effects&&!reduced?"on":"off"}
    style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",overflow:"hidden"}}>
    <img ref={imageRef} src={N7_BACKDROP_REFERENCE} alt="Cinematic mountain landscape" style={{position:"absolute",width:"100%",height:"100%",objectFit:"cover"}} />
    <style>{`@keyframes n7-ridge-light {0%,100% {opacity:.08} 50% {opacity:.78}}`}</style>
    <div ref={layerRef} data-ridge-layer="" aria-label="Existing ridge illumination" style={{position:"absolute",inset:0}} />
  </div>;
});
export default N7Backdrop;
