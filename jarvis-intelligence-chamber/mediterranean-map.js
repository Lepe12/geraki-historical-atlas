/* Geographic Mediterranean projection rendered independently of the locked 3D core.
   Natural Earth world-atlas topology is loaded at runtime and not fabricated. */
(()=>{"use strict";
const root=document.getElementById("app"),base=document.getElementById("universe"),mapButton=document.querySelector('.nx-dock [data-nx="map"]');
if(!root||!base||!mapButton)return;
const canvas=document.createElement("canvas");canvas.id="nxMediterranean";canvas.setAttribute("aria-label","3D Mediterranean geographical research map");canvas.setAttribute("role","img");base.insertAdjacentElement("afterend",canvas);
const ctx=canvas.getContext("2d");if(!ctx)return;
const W=()=>innerWidth,H=()=>innerHeight;let lines=[],yaw=-0.16,pitch=0.48,zoom=1,drag=false,mx=0,my=0,enabled=false,loaded=false;
const sectors=[["Spain",-3,39],["Venice",12.3,45.4],["France",5,43],["Britain",-8,45],["Netherlands",4,47],["German States",12,47],["Italian States",14,41],["Greece",24,37],["Ottoman Empire",30,40],["North Africa",10,34],["Travellers",18,34]];
function inflateArc(arc,transform){let x=0,y=0;return arc.map(([dx,dy])=>{x+=dx;y+=dy;return [x*transform.scale[0]+transform.translate[0],y*transform.scale[1]+transform.translate[1]];});}
async function load(){try{
 const res=await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json",{mode:"cors",cache:"force-cache"});if(!res.ok)throw Error("Map "+res.status);
 const topo=await res.json(),arcs=topo.arcs.map(a=>inflateArc(a,topo.transform));
 const geometry=topo.objects.land.geometries;
 function getArc(n){const a=arcs[n<0?~n:n];return n<0?[...a].reverse():a;}
 function ring(ids){let pts=[];for(const i of ids)pts.push(...getArc(i));return pts.filter(p=>p[0]>=-22&&p[0]<=56&&p[1]>=22&&p[1]<=53);}
 function collect(g){if(g.type==="Polygon")g.arcs.forEach(a=>{const p=ring(a);if(p.length>1)lines.push(p)});else if(g.type==="MultiPolygon")g.arcs.forEach(x=>x.forEach(a=>{const p=ring(a);if(p.length>1)lines.push(p)}));else if(g.type==="GeometryCollection")g.geometries.forEach(collect);}
 collect(topo.objects.land);loaded=true;
 }catch(e){canvas.dataset.mapError="Geographic map unavailable";enable(false);mapButton.title="Geographic map data unavailable — 3D network retained";console.warn("[NABOU//X] Natural Earth data unavailable",e);}
}
function enable(v){enabled=v;document.body.classList.toggle("nx-map-active",v);canvas.style.pointerEvents=v?"auto":"none";}
mapButton.addEventListener("click",()=>enable(true));
document.querySelectorAll(".nx-dock [data-nx]").forEach(b=>{if(b!==mapButton)b.addEventListener("click",()=>enable(false));});
function project(lon,lat,height=0){const x=(lon-16)*13,z=(37-lat)*15;
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const xx=x*cy-z*sy,zz=x*sy+z*cy;
 const yy=-zz*sp-height*cp,depth=zz*cp-height*sp;
 const persp=850/(850+depth*.37);
 return [W()/2+xx*zoom*persp,H()*.47+yy*zoom*persp,depth];}
function paint(now){requestAnimationFrame(paint);if(!enabled)return;
 const dpr=Math.min(devicePixelRatio||1,2),ww=W(),hh=H();
 if(canvas.width!==Math.round(ww*dpr)||canvas.height!==Math.round(hh*dpr)){canvas.width=Math.round(ww*dpr);canvas.height=Math.round(hh*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,ww,hh);
 const g=ctx.createRadialGradient(ww*.53,hh*.48,35,ww*.53,hh*.48,ww*.55);
 g.addColorStop(0,"rgba(7,31,49,.98)");g.addColorStop(1,"rgba(2,6,14,.99)");ctx.fillStyle=g;ctx.fillRect(0,0,ww,hh);
 if(!loaded){ctx.fillStyle="#51e0ed";ctx.font="12px monospace";ctx.fillText(canvas.dataset.mapError||"LOADING GEOGRAPHIC BASIN...",110,hh*.45);return;}
 // Perspective geographic grid, intentionally schematic coordinate guides.
 for(let lon=-15;lon<=45;lon+=5){ctx.beginPath();for(let lat=26;lat<=48;lat+=1){const [x,y]=project(lon,lat);if(lat===26)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.strokeStyle="rgba(81,224,237,.07)";ctx.stroke();}
 for(let lat=28;lat<=46;lat+=4){ctx.beginPath();for(let lon=-16;lon<=46;lon+=1){const [x,y]=project(lon,lat);if(lon===-16)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.strokeStyle="rgba(81,224,237,.07)";ctx.stroke();}
 for(const pts of lines){ctx.beginPath();let begun=false;for(const [lon,lat] of pts){const [x,y]=project(lon,lat);if(!begun){ctx.moveTo(x,y);begun=true}else ctx.lineTo(x,y)}ctx.strokeStyle="rgba(81,224,237,.34)";ctx.lineWidth=1.1;ctx.shadowColor="#51e0ed";ctx.shadowBlur=9;ctx.stroke();ctx.shadowBlur=0;}
 for(const [name,lon,lat] of sectors){if(lat>46||lon<-12)continue;const [x,y]=project(lon,lat,11);const pulse=4+Math.sin(now*.003)*1.4;ctx.beginPath();ctx.arc(x,y,pulse,0,Math.PI*2);ctx.strokeStyle="rgba(81,224,237,.6)";ctx.stroke();ctx.fillStyle="#51e0ed";ctx.fillRect(x-1,y-1,2,2);ctx.font="10px monospace";ctx.fillStyle="#b7e2ec";ctx.fillText(name,x+9,y-7);}
 ctx.font="10px monospace";ctx.fillStyle="#6e9db2";ctx.fillText("MEDITERRANEAN / NATURAL EARTH · 3D PROJECTED",Math.max(90,ww*.1),hh*.16);
 ctx.fillText("RESEARCH SECTORS ARE SCHEMATIC · NOT HISTORICAL LOCATIONS",Math.max(90,ww*.1),hh*.16+18);
}
canvas.addEventListener("pointerdown",e=>{drag=true;mx=e.clientX;my=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener("pointermove",e=>{if(!drag)return;yaw+=(e.clientX-mx)*.004;pitch=Math.max(.12,Math.min(1.15,pitch+(e.clientY-my)*.003));mx=e.clientX;my=e.clientY;});
canvas.addEventListener("pointerup",()=>drag=false);canvas.addEventListener("pointercancel",()=>drag=false);
canvas.addEventListener("wheel",e=>{e.preventDefault();zoom=Math.max(.45,Math.min(3.5,zoom*Math.exp(-e.deltaY*.001)))},{passive:false});
document.getElementById("zoomIn")?.addEventListener("click",()=>{if(enabled)zoom=Math.min(3.5,zoom*1.25)});
document.getElementById("zoomOut")?.addEventListener("click",()=>{if(enabled)zoom=Math.max(.45,zoom/1.25)});
document.getElementById("resetView")?.addEventListener("click",()=>{yaw=-.16;pitch=.48;zoom=1});
load();requestAnimationFrame(paint);enable(true);
})();