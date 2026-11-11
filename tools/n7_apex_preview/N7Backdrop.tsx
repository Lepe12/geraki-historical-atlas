"use client";
import { useEffect, useRef } from "react";
import { N7_BACKDROP_REFERENCE } from "./N7BackdropReference";

export default function N7Backdrop({effects,reduced}:{effects:boolean;reduced:boolean}) {
  const hostRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const host=hostRef.current;
    if(!host) return;
    let disposed=false;
    let raf=0;

    const canvas=document.createElement("canvas");
    canvas.width=1600;
    canvas.height=900;
    canvas.style.width="100%";
    canvas.style.height="100%";
    canvas.style.display="block";
    canvas.style.objectFit="cover";
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx) return;
    host.replaceChildren(canvas);

    const img=new Image();
    img.decoding="async";
    img.src=N7_BACKDROP_REFERENCE;

    img.onload=()=>{
      if(disposed) return;
      const sample=document.createElement("canvas");
      sample.width=400;
      sample.height=225;
      const sctx=sample.getContext("2d",{willReadFrequently:true});
      if(!sctx) return;
      sctx.drawImage(img,0,0,400,225);
      const px=sctx.getImageData(0,0,400,225).data;

      type H={x:number;y:number;r:number;g:number;b:number;phase:number;speed:number;radius:number};
      const candidates:H[]=[];
      for(let y=14;y<216;y+=3){
        for(let x=4;x<396;x+=3){
          const i=(y*400+x)*4;
          const r=px[i],g=px[i+1],b=px[i+2];
          const lum=.2126*r+.7152*g+.0722*b;
          const cyan=b>70&&g>60&&b>r*1.15;
          const amber=r>85&&g>45&&r>b*1.35;
          if(lum>68&&(cyan||amber)){
            const h=((x*73856093)^(y*19349663))>>>0;
            if(h%11===0){
              candidates.push({
                x:x*4,y:y*4,r,g,b,
                phase:(h%6283)/1000,
                speed:.00038+((h>>>5)%100)/500000,
                radius:8+((h>>>11)%12)
              });
            }
          }
        }
      }
      // Keep the scene calm: a small persistent set only.
      const highlights=candidates.slice(0,28);
      host.dataset.highlightCount=String(highlights.length);

      const draw=(now:number)=>{
        if(disposed) return;
        ctx.globalCompositeOperation="source-over";
        ctx.globalAlpha=1;
        ctx.drawImage(img,0,0,1600,900);

        if(effects&&!reduced){
          ctx.globalCompositeOperation="lighter";
          for(const h of highlights){
            const wave=(Math.sin(now*h.speed+h.phase)+1)/2;
            const pulse=Math.pow(wave,3.2);
            if(pulse<.08) continue;
            const grad=ctx.createRadialGradient(h.x,h.y,0,h.x,h.y,h.radius*(1.1+pulse*.7));
            grad.addColorStop(0,`rgba(${h.r},${h.g},${h.b},${.18+.34*pulse})`);
            grad.addColorStop(.38,`rgba(${h.r},${h.g},${h.b},${.08+.18*pulse})`);
            grad.addColorStop(1,`rgba(${h.r},${h.g},${h.b},0)`);
            ctx.fillStyle=grad;
            ctx.beginPath();
            ctx.arc(h.x,h.y,h.radius*(1.1+pulse*.7),0,Math.PI*2);
            ctx.fill();
          }
        }

        ctx.globalCompositeOperation="source-over";
        ctx.globalAlpha=1;
        raf=requestAnimationFrame(draw);
      };
      raf=requestAnimationFrame(draw);
    };

    return()=>{
      disposed=true;
      cancelAnimationFrame(raf);
      host.replaceChildren();
    };
  },[effects,reduced]);

  return <div
    ref={hostRef}
    aria-label="N7 Step 6 living backdrop"
    data-effects={effects&&!reduced?"on":"off"}
    style={{position:"absolute",inset:0,zIndex:0,pointerEvents:"none"}}
  />;
}
