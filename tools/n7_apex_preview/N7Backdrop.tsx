"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
import { N7_BACKDROP_REFERENCE } from "./N7BackdropReference";
import N7MiraField from "./N7MiraField";
import type {GuideMood} from "./N7GuideScene";

type Highlight={x:number;y:number;phase:number;sprite:HTMLCanvasElement};

export type N7BackdropHandle={wave:(x:number,y:number,radius:number,fade:number)=>void;clear:()=>void;setVoiceLevel:(level:number)=>void};
export type N7BackdropTuning={fog:number;brightness:number;motion:number};
type BackdropProps={effects:boolean;reduced:boolean;ambience?:{wide:string;portrait:string};tuning?:N7BackdropTuning;activity?:GuideMood};

// MIRA CoreMatter's harmonic orbit paths projected behind the N7 figure.
// Adapted from MIRA-HUD (MIT). See N7-MIRA-HUD-LICENSE.txt.
const ORBIT_TILTS=[-.95,.65,-.35,1.12,.24,-1.34];
function paintOrbits(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,energy:number,brightness:number){
  const radius=Math.min(w*.405,h*.37),cx=w*.5,cy=h*.48;
  ctx.save();
  ctx.globalCompositeOperation="screen";
  for(const [i,tilt] of ORBIT_TILTS.entries()){
    const phase=i*1.29;
    const az=tilt+.12*Math.sin(time*.09+phase);
    const cos=Math.cos(az),sin=Math.sin(az);
    const oval=.64+(i%3)*.13;
    const warm=i%3===1;
    const gradient=ctx.createLinearGradient(cx-radius,cy-radius,cx+radius,cy+radius);
    gradient.addColorStop(0,warm?"#dd8d43":"#4bbfdf");
    gradient.addColorStop(.44,warm?"#ffe1ae":"#bcf6ff");
    gradient.addColorStop(1,warm?"#9d5f39":"#2b7fb3");
    ctx.strokeStyle=gradient;
    ctx.shadowColor=warm?"#f7af64":"#59dfff";
    ctx.shadowBlur=4+energy*8;
    ctx.globalAlpha=Math.min(.82,(.29+(i%2)*.17+energy*.24)*brightness);
    ctx.lineWidth=.65+(i%2)*.28+energy*.4;
    ctx.beginPath();
    for(let step=0;step<=96;step++){
      const a=(step%96)/96*Math.PI*2;
      const rr=radius*(.91+i*.037)*(1+.10*Math.sin(3*a+phase+time*.12)+.043*Math.sin(5*a-phase-time*.2));
      const x=Math.cos(a)*rr,y=Math.sin(a)*rr*oval;
      const px=cx+x*cos-y*sin,py=cy+(x*sin+y*cos)*1.12;
      if(step===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.closePath();ctx.stroke();
  }
  ctx.restore();
}

const N7Backdrop=forwardRef<N7BackdropHandle,BackdropProps>(function N7Backdrop({effects,reduced,ambience,tuning,activity="idle"},ref) {
  const source=ambience?.wide??N7_BACKDROP_REFERENCE;
  const portrait=ambience?.portrait;
  const hostRef=useRef<HTMLDivElement>(null);
  const imageRef=useRef<HTMLImageElement>(null);
  const layerRef=useRef<HTMLDivElement>(null);
  const flags=useRef({effects,reduced,tuning});
  const voiceLevel=useRef(0);
  const restart=useRef<()=>void>(()=>{});
  const waveRef=useRef<(x:number,y:number,radius:number,fade:number)=>void>(()=>{});
  useImperativeHandle(ref,()=>({
    wave:(x,y,r,f)=>waveRef.current(x,y,r,f),
    clear:()=>waveRef.current(0,0,-1,0),
    setVoiceLevel:level=>{voiceLevel.current=Math.max(0,level);},
  }),[]);
  useEffect(()=>{flags.current={effects,reduced,tuning};restart.current();},[effects,reduced,tuning]);

  useEffect(()=>{
    const host=hostRef.current,image=imageRef.current,layer=layerRef.current;
    if(!host||!image||!layer) return;
    let disposed=false,loadedSource="",lastEnergy="";
    const highlights:Highlight[]=[];
    let centers:{x:number;y:number}[]=[];
    const start=()=>{
      const animate=flags.current.effects&&!flags.current.reduced;
      layer.style.display=animate?"block":"none";
      if(!animate){host.style.removeProperty("--n7-voice-energy");lastEnergy="";}
    };
    restart.current=start;
    let layout=()=>{};
    const observer=new ResizeObserver(()=>layout());observer.observe(host);
    const load=()=>{
      const currentSource=image.currentSrc;
      if(disposed||!image.naturalWidth||!currentSource||loadedSource===currentSource) return;
      loadedSource=currentSource;
      for(const point of highlights)point.sprite.remove();
      highlights.length=0;
      const smoke=layer.querySelector<HTMLElement>("[data-smoke-drift]");
      if(smoke)smoke.style.backgroundImage=`url("${currentSource}")`;
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
        Object.assign(point.sprite.style,{position:"absolute",mixBlendMode:"screen",animation:"n7-ridge-light 9.6s ease-in-out infinite",animationDelay:`${-point.phase}s`,animationPlayState:"var(--n7-field-animation, running)"});
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
    let strandRaf=0,lastStrand=0,strandTime=performance.now()/1000;
    const drawStrands=(now:number)=>{
      strandRaf=requestAnimationFrame(drawStrands);
      if(!strands||!sctx2||disposed)return;
      const {effects,reduced,tuning}=flags.current;
      if(!effects||reduced||now-lastStrand<33)return;
      const motion=(tuning?.motion??100)/100;
      strandTime+=Math.min(lastStrand?now-lastStrand:0,80)*motion/1000;
      lastStrand=now;
      const level=tuning?voiceLevel.current:0;
      const energy=level.toFixed(3);
      if(tuning&&energy!==lastEnergy){host.style.setProperty("--n7-voice-energy",energy);lastEnergy=energy;}
      const w=Math.max(1,Math.round(host.clientWidth/2)),h=Math.max(1,Math.round(host.clientHeight/2));
      if(strands.width!==w||strands.height!==h){strands.width=w;strands.height=h;}
      sctx2.clearRect(0,0,w,h);const t=tuning?strandTime:now/1000;
      for(const r of ribbons){
        const start=((t*r.speed+r.phase*.13)%1.6)-.55,x0=start*w,x1=(start+r.len)*w;
        const alpha=Math.min(.65,r.alpha*(1+level*2.4)*(tuning?.brightness??100)/100);
        const amplitude=r.amp*(1+level*.32*motion);
        const g=sctx2.createLinearGradient(x0,0,x1,0);g.addColorStop(0,"rgba(170,232,248,0)");g.addColorStop(.5,`rgba(196,240,252,${alpha})`);g.addColorStop(1,"rgba(170,232,248,0)");
        sctx2.strokeStyle=g;
        for(let l=0;l<r.lines;l++){
          sctx2.lineWidth=l?.6:1;sctx2.beginPath();
          for(let s=0;s<=40;s++){const f=s/40,x=x0+(x1-x0)*f,yy=(r.y+r.tilt*(f-.5)+amplitude*Math.sin(f*5.2+t*.35+r.phase)+.012*Math.sin(f*13+t*.6+r.phase))*h+l*2.2;s?sctx2.lineTo(x,yy):sctx2.moveTo(x,yy);}
          sctx2.stroke();
        }
      }
      if(tuning)paintOrbits(sctx2,w,h,t,level,tuning.brightness/100);
    };
    strandRaf=requestAnimationFrame(drawStrands);
    image.addEventListener("load",load);
    if(image.complete&&image.naturalWidth) load();
    return()=>{disposed=true;cancelAnimationFrame(strandRaf);observer.disconnect();for(const point of highlights)point.sprite.remove();image.removeEventListener("load",load);restart.current=()=>{};waveRef.current=()=>{};};
  },[source,portrait]);

  const appearance=tuning&&{
    "--n7-fog-opacity":.35+.65*Math.min(1,tuning.fog/100),
    "--n7-smoke-opacity":.32*tuning.fog/100,
    "--n7-field-brightness":tuning.brightness/100,
    "--n7-smoke-duration":`${4800/Math.max(1,tuning.motion)}s`,
    "--n7-field-animation":tuning.motion===0?"paused":"running",
  };
  return <div ref={hostRef} className={ambience?"n7-ambient-field":undefined} aria-hidden={ambience?true:undefined}
    aria-label={ambience?undefined:"N7 Step 6 living backdrop"} data-effects={effects&&!reduced?"on":"off"}
    style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none",overflow:"hidden",...appearance} as CSSProperties}>
    <picture>
      {portrait&&<source media="(max-width: 720px) and (orientation: portrait)" srcSet={portrait}/>}
      <img ref={imageRef} src={source} alt={ambience?"":"Cinematic mountain landscape"} style={{position:"absolute",width:"100%",height:"100%",objectFit:"cover"}} />
    </picture>
    {ambience&&tuning&&effects&&!reduced&&<N7MiraField tuning={tuning} activity={activity} voiceLevel={voiceLevel}/>}
    <style>{`@keyframes n7-ridge-light {0%,100% {opacity:.08} 50% {opacity:.78}}@keyframes n7-smoke-drift {0% {transform:scale(1.10) translate(-1.8%,.8%)} 100% {transform:scale(1.14) translate(1.8%,-1.2%)}}`}</style>
    <div ref={layerRef} data-ridge-layer="" aria-label="Existing ridge illumination" style={{position:"absolute",inset:0}}>
      {/* Slow smoke drift: a soft, faint copy of the same raster moving very slowly. */}
      <div aria-hidden="true" data-smoke-drift="" style={{position:"absolute",inset:0,backgroundSize:"cover",backgroundPosition:"center",
        opacity:"var(--n7-smoke-opacity, .32)",mixBlendMode:"screen",filter:tuning?"blur(6px) brightness(var(--n7-field-brightness, 1))":"blur(6px)",
        animation:"n7-smoke-drift var(--n7-smoke-duration, 48s) ease-in-out infinite alternate",animationPlayState:"var(--n7-field-animation, running)"}}/>
      <canvas data-strands="" aria-hidden="true" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}/>
    </div>
  </div>;
});
export default N7Backdrop;
