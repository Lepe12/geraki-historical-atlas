(()=>{"use strict";
const $=id=>document.getElementById(id),app=$("app");if(!app||!$("universe"))return;

/* Never allow the retired geographic overlay to replace the core scene. */
function killGeoOverlay(){
 document.body.classList.remove("nx-map-active");
 const geo=$("nxMediterranean");if(geo)geo.remove();
}
killGeoOverlay();
new MutationObserver(killGeoOverlay).observe(app,{childList:true,subtree:false});

document.querySelector(".nabou-rail")?.remove();
document.querySelector(".deck-controls")?.remove();

const ICONS={
 map:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
 agents:'<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3.5 19c.6-3.4 2.1-5 4.5-5s3.9 1.6 4.5 5M11.5 19c.6-3.4 2.1-5 4.5-5s3.9 1.6 4.5 5"/></svg>',
 sources:'<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M16 4v4h4M8 11h8M8 14h8M8 17h5"/></svg>',
 findings:'<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="5"/><path d="m14 14 5 5M7.5 10h5M10 7.5v5"/></svg>',
 learning:'<svg viewBox="0 0 24 24"><path d="M4 5h7a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4z"/><path d="M20 5h-3a3 3 0 0 0-3 3v11a3 3 0 0 1 3-3h3z"/></svg>',
 history:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2M4 5v4h4"/></svg>',
 activity:'<svg viewBox="0 0 24 24"><path d="M3 13h4l2-6 4 12 2-6h6"/></svg>'
};

const host=document.createElement("div");host.className="nx-ui";
host.innerHTML='<nav class="nx-dock" aria-label="NABOU//X Neocom navigation"></nav><section class="nx-drawer nx-window" id="nxDrawer" aria-label="Agent network" aria-hidden="true"><div class="nx-window-title"><strong>AGENT NETWORK</strong><div class="nx-window-actions"><button id="nxClose" type="button" aria-label="Close">×</button></div></div><div class="nx-window-body"><h2>RESEARCH AGENTS</h2><p>ARCHIVAL + ANALYTICAL NETWORK</p><div class="nx-agent-tabs" id="nxAgentTabs"><button type="button" class="active" data-agent-filter="all">ALL</button><button type="button" data-agent-filter="archive">ARCHIVES</button><button type="button" data-agent-filter="analysis">ANALYSIS</button></div><div class="nx-agent-grid" id="nxAgentGrid"></div></div></section>';
app.appendChild(host);

const nav=host.querySelector(".nx-dock"),drawer=$("nxDrawer"),grid=$("nxAgentGrid"),tabs=$("nxAgentTabs");
const resultsPanel=$("resultsDrawer"),learningPanel=$("learningPanel"),detailPanel=$("detailPanel"),activity=$("activityStrip");
const actions=[
 ["map","UNIVERSE"],["agents","AGENTS"],["sources","SOURCES"],["findings","FINDINGS"],
 ["learning","PDF LEARNING"],["history","HISTORY"],["activity","LIVE ACTIVITY"]
];
const agents=[
 ["greek","Ελλάδα","archive"],["spanish_simancas","Ισπανία","archive"],["venetian","Βενετία","archive"],
 ["french","Γαλλία","archive"],["british","Βρετανία","archive"],["dutch","Ολλανδία","archive"],
 ["german","Γερμανικά κράτη","archive"],["italian_states","Ιταλικά κράτη","archive"],["ottoman","Οθωμανική αυτοκρατορία","archive"],
 ["north_african","Βόρεια Αφρική","archive"],["travellers","Περιηγητές","archive"],
 ["source_genealogy","Γενεαλογία πηγών","analysis"],["identity_resolution","Ταυτοποίηση","analysis"],
 ["contradiction","Αντιφάσεις","analysis"],["relationship_network","Δίκτυα σχέσεων","analysis"],
 ["timeline","Χρονολόγιο","analysis"],["pirate_base","Πειρατικές βάσεις","analysis"]
];
const nodes=new Map();

actions.forEach(([id,label],idx)=>{
 if(idx===2||idx===5){const line=document.createElement("div");line.className="nx-break-line";nav.append(line);}
 const b=document.createElement("button");b.type="button";b.dataset.nx=id;b.setAttribute("aria-label",label);
 const symbol=document.createElement("span");symbol.innerHTML=ICONS[id];b.append(symbol);nav.append(b);nodes.set(id,b);
});
agents.forEach(([id,name,group])=>{
 const b=document.createElement("button");b.type="button";b.className="nx-agent";b.dataset.agent=id;b.dataset.group=group;b.textContent=name;grid.append(b);
});

function choose(id){for(const [key,el] of nodes)el.setAttribute("aria-current",key===id?"page":"false");}
function panelOpen(panel){return !!panel&&!panel.classList.contains("hidden");}
function drawerState(open){drawer.classList.toggle("nx-open",open);drawer.setAttribute("aria-hidden",String(!open));drawer.inert=!open;}
function closePanel(panel,closeId){if(panelOpen(panel))$(closeId)?.click();}
function closeWork(except=""){
 if(except!=="agents")drawerState(false);
 if(except!=="results")closePanel(resultsPanel,"closeResults");
 if(except!=="learning")closePanel(learningPanel,"closeLearning");
 if(except!=="activity")activity?.classList.remove("nx-activity-window");
}
function openResults(mode){
 closeWork("results");
 if(resultsPanel?.classList.contains("hidden"))$("resultsToggle")?.click();
 const opts=resultsPanel?.querySelector(".result-options");
 if(mode==="sources"){if(opts)opts.open=true;$("resultSearch")?.focus({preventScroll:true});}
 if(mode==="history"){if(opts)opts.open=true;$("researchRunId")?.focus({preventScroll:true});}
}
function openLearning(){closeWork("learning");if(learningPanel?.classList.contains("hidden"))$("learningToggle")?.click();}
function openActivity(){closeWork("activity");activity?.classList.add("nx-activity-window");}

nav.addEventListener("click",e=>{
 const b=e.target.closest("button[data-nx]");if(!b)return;
 killGeoOverlay();
 const id=b.dataset.nx;choose(id);
 if(id==="map"){closeWork();closePanel(detailPanel,"closeDetail");$("resetView")?.click();return;}
 if(id==="agents"){closeWork("agents");drawerState(true);return;}
 if(id==="sources"){openResults("sources");return;}
 if(id==="findings"){openResults("findings");return;}
 if(id==="learning"){openLearning();return;}
 if(id==="history"){openResults("history");return;}
 if(id==="activity"){openActivity();return;}
});

tabs?.addEventListener("click",e=>{
 const b=e.target.closest("[data-agent-filter]");if(!b)return;
 tabs.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));
 const f=b.dataset.agentFilter;
 grid.querySelectorAll(".nx-agent").forEach(x=>x.hidden=f!=="all"&&x.dataset.group!==f);
});

grid.addEventListener("click",e=>{
 const b=e.target.closest("[data-agent]");if(!b)return;
 killGeoOverlay();closeWork();choose("map");
 const order=["spanish_simancas","venetian","french","british","dutch","german","italian_states","greek","ottoman","north_african","travellers","source_genealogy","identity_resolution","contradiction","relationship_network","timeline","pirate_base"];
 const i=order.indexOf(b.dataset.agent),labels=document.querySelectorAll("#nodeLabels .node-label"),label=labels[i],canvas=$("universe");
 if(label&&canvas){
   const x=parseFloat(label.style.left),y=parseFloat(label.style.top),rect=canvas.getBoundingClientRect();
   if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<rect.width&&y<rect.height){
     canvas.dispatchEvent(new PointerEvent("pointerup",{clientX:rect.left+x,clientY:rect.top+y,bubbles:true}));
     $("focusButton")?.click();
   }
 }
});

$("nxClose")?.addEventListener("click",()=>{drawerState(false);choose("map");});

function makeDraggable(panel,handle){
 if(!panel||!handle)return;
 let sx=0,sy=0,ox=0,oy=0,drag=false;
 handle.addEventListener("pointerdown",e=>{
   if(e.target.closest("button,input,select"))return;
   drag=true;sx=e.clientX;sy=e.clientY;
   const r=panel.getBoundingClientRect();ox=r.left;oy=r.top;
   panel.style.right="auto";panel.style.bottom="auto";handle.setPointerCapture(e.pointerId);
 });
 handle.addEventListener("pointermove",e=>{
   if(!drag)return;
   const w=panel.offsetWidth,h=panel.offsetHeight;
   panel.style.left=Math.max(58,Math.min(innerWidth-w-8,ox+e.clientX-sx))+"px";
   panel.style.top=Math.max(8,Math.min(innerHeight-h-8,oy+e.clientY-sy))+"px";
 });
 const end=()=>drag=false;
 handle.addEventListener("pointerup",end);handle.addEventListener("pointercancel",end);
}
makeDraggable(drawer,drawer.querySelector(".nx-window-title"));
makeDraggable(resultsPanel,resultsPanel?.querySelector(".results-head"));
makeDraggable(learningPanel,learningPanel?.querySelector(".learning-head"));
makeDraggable(detailPanel,detailPanel?.querySelector(".detail-head"));

for(const [panel,id] of [[resultsPanel,"findings"],[learningPanel,"learning"]]){
 if(!panel)continue;
 new MutationObserver(()=>{if(panelOpen(panel)){drawerState(false);activity?.classList.remove("nx-activity-window");choose(id);}}).observe(panel,{attributes:true,attributeFilter:["class"]});
}

document.addEventListener("keydown",e=>{
 if(e.key!=="Escape")return;
 closeWork();closePanel(detailPanel,"closeDetail");choose("map");killGeoOverlay();
});

document.body.classList.add("nx-workspace");
choose("map");drawerState(false);killGeoOverlay();
})();