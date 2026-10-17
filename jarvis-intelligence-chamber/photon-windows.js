/* Photon-inspired workspace interactions, preserving existing functional research panels. */
(()=>{"use strict";
const $=id=>document.getElementById(id),app=$("app"),dock=document.querySelector(".nx-dock");if(!app||!dock)return;
const windows=[["agents","nxDrawer","AGENT OVERVIEW"],["findings","resultsDrawer","RESEARCH OVERVIEW"],["learning","learningPanel","DOCUMENT REVIEW"],["inspector","detailPanel","SECTOR INSPECTOR"]];
const registry=new Map();let topZ=30;
for(const [kind,id,name] of windows){
 const win=$(id);if(!win)continue;
 win.classList.add("photon-window");win.dataset.photon=kind;
 const bar=document.createElement("div");bar.className="photon-titlebar";
 const title=document.createElement("span");title.className="photon-name";title.textContent=name;
 const control=document.createElement("div");control.className="photon-window-controls";
 const compact=document.createElement("button");compact.type="button";compact.title="Compact Mode";compact.textContent="▤";compact.setAttribute("aria-label","Compact mode");
 const more=document.createElement("button");more.type="button";more.textContent="⋮";more.title="Window options";more.setAttribute("aria-label","Window options");more.setAttribute("aria-expanded","false");
 const options=document.createElement("div");options.className="photon-options";options.hidden=true;
 const compactOpt=document.createElement("button");compactOpt.type="button";compactOpt.textContent="Compact Mode";
 const resetOpt=document.createElement("button");resetOpt.type="button";resetOpt.textContent="Reset window position";
 const transparency=document.createElement("label");transparency.textContent="Window opacity";
 const range=document.createElement("input");range.type="range";range.min="60";range.max="100";range.value="94";range.setAttribute("aria-label","Window opacity");transparency.append(range);
 options.append(compactOpt,resetOpt,transparency);
 control.append(compact,more,options);bar.append(title,control);win.prepend(bar);
 let offsetX=0,offsetY=0;
 function resetPosition(){offsetX=0;offsetY=0;win.style.setProperty("--ph-x","0px");win.style.setProperty("--ph-y","0px");}
 function compactMode(){const active=win.classList.toggle("photon-compact");compact.setAttribute("aria-pressed",String(active));compactOpt.setAttribute("aria-pressed",String(active));}
 compact.onclick=compactMode;compactOpt.onclick=()=>{compactMode();options.hidden=true;more.setAttribute("aria-expanded","false");};
 resetOpt.onclick=()=>{resetPosition();options.hidden=true;more.setAttribute("aria-expanded","false");};
 more.onclick=()=>{options.hidden=!options.hidden;more.setAttribute("aria-expanded",String(!options.hidden));};
 range.oninput=()=>win.style.setProperty("--ph-opacity",String(Number(range.value)/100));
 bar.addEventListener("pointerdown",e=>{if(e.target.closest("button,input,label"))return;if(e.button!==0)return;
  const originX=e.clientX,originY=e.clientY,startX=offsetX,startY=offsetY;
  bar.setPointerCapture(e.pointerId);win.style.zIndex=String(++topZ);
  function move(ev){offsetX=Math.max(-innerWidth*.3,Math.min(innerWidth*.3,startX+ev.clientX-originX));offsetY=Math.max(-innerHeight*.35,Math.min(innerHeight*.35,startY+ev.clientY-originY));win.style.setProperty("--ph-x",offsetX+"px");win.style.setProperty("--ph-y",offsetY+"px");}
  function end(){bar.removeEventListener("pointermove",move);bar.removeEventListener("pointerup",end);bar.removeEventListener("pointercancel",end);}
  bar.addEventListener("pointermove",move);bar.addEventListener("pointerup",end);bar.addEventListener("pointercancel",end);
 });
 win.addEventListener("pointerdown",()=>{win.style.zIndex=String(++topZ);});
 registry.set(kind,{win,resetPosition});
}
const labels={"map":"MEDITERRANEAN MAP","agents":"AGENT OVERVIEW","sources":"SOURCE DISCOVERY","findings":"RESEARCH RESULTS","learning":"PDF LEARNING","history":"RESEARCH HISTORY","activity":"LIVE ACTIVITY"};
const tooltip=document.createElement("div");tooltip.className="photon-tooltip";tooltip.setAttribute("aria-hidden","true");app.append(tooltip);
dock.querySelectorAll("[data-nx]").forEach(b=>{b.title=labels[b.dataset.nx]||b.title;b.addEventListener("mouseenter",()=>{tooltip.textContent=labels[b.dataset.nx]||"";const r=b.getBoundingClientRect();tooltip.style.top=Math.max(6,Math.min(innerHeight-35,r.top+r.height/2-14))+"px";tooltip.classList.add("is-visible");});b.addEventListener("mouseleave",()=>tooltip.classList.remove("is-visible"));});
const drawer=$("nxDrawer"),grid=$("nxAgentGrid");
if(drawer&&grid){
 const tabs=document.createElement("div");tabs.className="photon-tabs";tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","Agent categories");
 for(const [name,label] of [["all","ALL SECTORS"],["archive","ARCHIVES"],["science","ANALYSIS"]]){
  const button=document.createElement("button");button.type="button";button.dataset.photonTab=name;button.textContent=label;button.setAttribute("role","tab");button.setAttribute("aria-selected",String(name==="all"));
  button.onclick=()=>{tabs.querySelectorAll("button").forEach(b=>b.setAttribute("aria-selected",String(b===button)));grid.querySelectorAll(".nx-agent").forEach((b,i)=>{b.hidden=name!=="all"&&(name==="archive"?i>10:i<=10);});};
  tabs.append(button);
 }
 grid.before(tabs);
}
const results=$("resultsDrawer");
if(results){
 const tabs=document.createElement("div");tabs.className="photon-tabs";tabs.setAttribute("role","tablist");tabs.setAttribute("aria-label","Research window tabs");
 for(const [filter,label] of [["all","OVERVIEW"],["claims","CLAIMS"],["contradictions","CONTRADICTIONS"],["blockers","BLOCKERS"]]){
  const b=document.createElement("button");b.type="button";b.textContent=label;b.dataset.photonFilter=filter;b.setAttribute("role","tab");b.setAttribute("aria-selected",String(filter==="all"));b.onclick=()=>{tabs.querySelectorAll("button").forEach(x=>x.setAttribute("aria-selected",String(x===b)));window.dispatchEvent(new CustomEvent("jarvis:results-filter",{detail:{filter}}));};tabs.append(b);
 }
 const head=results.querySelector(".results-head");(head||results.firstElementChild)?.after(tabs);
}
document.addEventListener("pointerdown",e=>{for(const {win} of registry.values())if(!win.contains(e.target)){const opt=win.querySelector(".photon-options"),more=win.querySelector('[aria-label="Window options"]');if(opt)opt.hidden=true;if(more)more.setAttribute("aria-expanded","false");}});
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".photon-options").forEach(x=>x.hidden=true);});
})();