"use client";
import {useEffect,useRef} from "react";
import type {GuideFrameInfo,GuideMode,GuideMood} from "./N7GuideScene";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";

export const N7_HACKER_IMAGE=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"))+"/n7-hacker-v1.webp";
type Props={mode:GuideMode;mood:GuideMood;effects:boolean;reduced:boolean;breathing:boolean;replay:number;onComplete:()=>void;onFrame:(x:GuideFrameInfo)=>void};
type Dot={x:number;y:number;r:number;g:number;b:number;seed:number;shift:number};
const W=320,H=480;
export default function N7HackerSkin(props:Props){
 const target=useRef<HTMLDivElement>(null),callbacks=useRef({onComplete:props.onComplete,onFrame:props.onFrame});
 callbacks.current={onComplete:props.onComplete,onFrame:props.onFrame};
 useEffect(()=>{
  const host=target.current;if(!host)return;
  const cv=document.createElement("canvas");cv.width=W;cv.height=H;cv.setAttribute("aria-label","N7 Hacker image-sampled canvas");cv.dataset.hacker="true";
  Object.assign(cv.style,{width:"100%",height:"100%",display:"block"});
  host.replaceChildren(cv);
  const cx=cv.getContext("2d",{willReadFrequently:true});if(!cx)return;
  const src=document.createElement("canvas");src.width=W;src.height=H;
  const sc=src.getContext("2d",{willReadFrequently:true});if(!sc)return;
  const im=new Image();let disposed=false,id=0,start=performance.now(),last=0,reported=0,complete=false;
  im.onload=()=>{
   if(disposed)return;
   sc.drawImage(im,0,0,W,H);
   const pixels=sc.getImageData(0,0,W,H).data,dots:Dot[]=[];
   for(let y=1;y<H;y+=2)for(let x=1;x<W;x+=2){
    const p=(y*W+x)*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2];
    if(Math.max(r,g,b)<28 || (x*37+y*73)%11>3)continue;
    const seed=((x*17+y*23)%101)/101;
    dots.push({x,y,r,g,b,seed,shift:Math.sin(x*1.5+y*.67)});
   }
   host.dataset.ready="true";host.dataset.particles=String(dots.length);
   const draw=(now:number)=>{
    if(disposed)return;const dt=last?now-last:16;last=now;
    const assembly=props.mode==="assembly"&&props.effects&&!props.reduced;
    const progress=assembly?Math.min(1,(now-start)/6000):1;
    cx.clearRect(0,0,W,H);
    const breath=props.breathing&&!props.reduced&&props.effects?Math.sin(now/1150)*.002:0;
    cx.save();cx.translate(W*.5,H*.5);cx.scale(1+breath,1+breath);cx.translate(-W*.5,-H*.5);
    if(props.mode==="original"||(!assembly&&props.mode!=="compare"))cx.drawImage(src,0,0);
    if(props.mode==="compare"){cx.globalAlpha=.40;cx.drawImage(src,0,0);cx.globalAlpha=1;}
    if(props.mode!=="original"){
     for(const p of dots){
      if(progress<1&&p.seed>progress)continue;
      const t=progress<1?1-progress:0,x=p.x-110*t+p.shift*7*t,y=p.y+230*t;
      cx.fillStyle="rgba("+p.r+","+p.g+","+p.b+","+(progress<1?.86:.26)+")";
      cx.fillRect(x,y,progress<1?1.5:1,progress<1?1.5:1);
     }
    }
    cx.restore();
    if(props.effects&&props.mood!=="idle"){
      const y=86,cx0=161;
      if(props.mood==="listening"){
       cx.strokeStyle="rgba(49,220,255,.35)";cx.lineWidth=1;
       cx.beginPath();cx.ellipse(cx0,y,51+Math.sin(now/410)*6,54+Math.sin(now/410)*6,0,0,Math.PI*2);cx.stroke();
      }
      if(props.mood==="thinking"){
       cx.fillStyle="rgba(23,177,221,.16)";cx.fillRect(70,45+(now/22)%340,180,1);
      }
      if(props.mood==="speaking"){
       const t=.45+.35*Math.sin(now/95);
       cx.fillStyle="rgba(255,165,52,"+t+")";cx.beginPath();cx.arc(161,94,2.5,0,Math.PI*2);cx.fill();
      }
    }
    if(assembly&&progress>=1&&!complete){complete=true;callbacks.current.onComplete();}
    if(now-reported>450){reported=now;callbacks.current.onFrame({turn:0,breath,progress,shock:0,ignition:progress>=.94?1:0,renderMs:dt,particles:dots.length,frameMs:dt});}
    host.dataset.assembly=String(Math.round(progress*100));host.dataset.mood=props.mood;
    id=requestAnimationFrame(draw);
   };id=requestAnimationFrame(draw);
  };
  im.onerror=()=>{host.dataset.error="hacker_skin_asset_failed";};
  im.src=N7_HACKER_IMAGE;
  return()=>{disposed=true;cancelAnimationFrame(id);im.onload=null;im.onerror=null;host.replaceChildren();};
 },[props.mode,props.mood,props.effects,props.reduced,props.breathing,props.replay]);
 return <div ref={target} role="img" aria-label="N7 Hacker visual trial" style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}/>;
}
