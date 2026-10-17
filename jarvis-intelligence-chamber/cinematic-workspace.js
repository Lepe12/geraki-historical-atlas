(()=>{"use strict";
const $=id=>document.getElementById(id),app=$("app");if(!app)return;
document.querySelector(".nx-ui")?.remove();

const results=$("resultsDrawer"),learning=$("learningPanel"),detail=$("detailPanel"),activity=$("activityStrip");
const ICONS={
 universe:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
 agents:'<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3.5 19c.6-3.4 2.1-5 4.5-5s3.9 1.6 4.5 5M11.5 19c.6-3.4 2.1-5 4.5-5s3.9 1.6 4.5 5"/></svg>',
 sources:'<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M16 4v4h4M8 11h8M8 14h8M8 17h5"/></svg>',
 findings:'<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="5"/><path d="m14 14 5 5M7.5 10h5M10 7.5v5"/></svg>',
 pdf:'<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 15h6M9 18h4"/></svg>',
 history:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2M4 5v4h4"/></svg>',
 activity:'<svg viewBox="0 0 24 24"><path d="M3 13h4l2-6 4 12 2-6h6"/></svg>'
};

const host=document.createElement("div");host.className="nx-ui";
host.innerHTML='<nav class="nx-dock" aria-label="NABOU//X Neocom navigation"></nav>'+
'<section class="nx-agent-window nx-photon-window" id="nxAgentsWindow" aria-hidden="true">'+
'<div class="nx-titlebar"><div><small>NETWORK DIRECTORY</small><strong>AGENTS</strong></div><button id="nxAgentsClose" type="button" aria-label="Close Agents">×</button></div>'+
'<div class="nx-agent-tabs" role="tablist"><button type="button" class="active" data-filter="all">ALL</button><button type="button" data-filter="archive">ARCHIVE</button><button type="button" data-filter="analysis">ANALYSIS</button></div>'+
'<div id="nxAgentGroups"></div></section>';
app.append(host);

const dock=host.querySelector(".nx-dock"),agentsWindow=$("nxAgentsWindow"),groups=$("nxAgentGroups"),nav=new Map();
[["universe","Universe"],["agents","Agents"],["sources","Sources"],["findings","Findings"],["pdf","PDF"],["history","History"],["activity","Activity"]]
.forEach(([id,label],i)=>{if(i===2||i===5){const d=document.createElement("span");d.className="nx-dock-divider";dock.append(d);}const b=document.createElement("button");b.type="button";b.dataset.nx=id;b.setAttribute("aria-label",label);b.innerHTML="<span>"+ICONS[id]+"</span>";dock.append(b);nav.set(id,b);});

const agents=[
["greek","Ελλάδα","archive"],["spanish_simancas","Ισπανία / Simancas","archive"],["venetian","Βενετία","archive"],["french","Γαλλία","archive"],["british","Βρετανία","archive"],["dutch","Ολλανδία","archive"],["german","Γερμανικά κράτη","archive"],["italian_states","Ιταλικά κράτη","archive"],["ottoman","Οθωμανική αυτοκρατορία","archive"],["north_african","Βόρεια Αφρική","archive"],["travellers","Περιηγητές","archive"],
["source_genealogy","Γενεαλογία πηγών","analysis"],["identity_resolution","Ταυτοποίηση","analysis"],["contradiction","Αντιφάσεις","analysis"],["relationship_network","Δίκτυα σχέσεων","analysis"],["timeline","Χρονολόγιο","analysis"],["pirate_base","Πειρατικές βάσεις","analysis"]];
for(const type of ["archive","analysis"]){
 const s=document.createElement("section");s.className="nx-agent-group";s.dataset.group=type;
 s.innerHTML="<header><span>"+(type==="archive"?"ARCHIVE AGENTS":"ANALYSIS AGENTS")+"</span><small></small></header><div></div>";
 const list=s.lastElementChild,m=agents.filter(a=>a[2]===type);s.querySelector("small").textContent=String(m.length).padStart(2,"0");
 m.forEach(([id,name])=>{const b=document.createElement("button");b.type="button";b.className="nx-agent";b.dataset.agent=id;b.dataset.activity="idle";b.innerHTML="<i></i><span></span><small>STANDBY</small>";b.querySelector("span").textContent=name;b.setAttribute("aria-label",name+" — STANDBY");new MutationObserver(()=>{const active=b.dataset.activity==="active";b.querySelector("small").textContent=active?"ACTIVE":"STANDBY";b.setAttribute("aria-label",name+" — "+(active?"ACTIVE":"STANDBY"));}).observe(b,{attributes:true,attributeFilter:["data-activity"]});list.append(b);});
 groups.append(s);
}

let z=40;
const isOpen=p=>!!p&&!p.classList.contains("hidden");
const choose=id=>nav.forEach((b,k)=>b.setAttribute("aria-current",k===id?"page":"false"));
const raise=p=>{if(p)p.style.zIndex=String(++z);};
function closeAgents(){agentsWindow.classList.remove("nx-open");agentsWindow.setAttribute("aria-hidden","true");agentsWindow.inert=true}
function closeActivity(){activity?.classList.remove("nx-activity-window")}
function closePanel(p,id){if(isOpen(p))$(id)?.click()}
function closeAll(except=""){if(except!=="agents")closeAgents();if(except!=="results")closePanel(results,"closeResults");if(except!=="pdf")closePanel(learning,"closeLearning");if(except!=="detail")closePanel(detail,"closeDetail");if(except!=="activity")closeActivity()}

function showResults(mode){
 closeAll("results");if(!results)return;results.dataset.nxMode=mode;
 if(!isOpen(results))$("resultsToggle")?.click();
 const t=results.querySelector(".results-head>span");if(t)t.textContent=mode==="sources"?"SOURCES / EVIDENCE":mode==="history"?"RESEARCH HISTORY":"FINDINGS";
 if(mode==="history"){const o=results.querySelector(".result-options");if(o)o.open=true;requestAnimationFrame(()=>$("researchRunId")?.focus({preventScroll:true}));}
 else if(mode==="sources")requestAnimationFrame(()=>$("resultSearch")?.focus({preventScroll:true}));
 choose(mode);raise(results);
}
function showPdf(){closeAll("pdf");if(!isOpen(learning))$("learningToggle")?.click();choose("pdf");raise(learning)}
function showActivity(){closeAll("activity");activity?.classList.add("nx-activity-window");choose("activity");raise(activity)}

dock.addEventListener("click",e=>{const b=e.target.closest("[data-nx]");if(!b)return;const id=b.dataset.nx;
 if(id==="universe"){closeAll();choose("universe");return}
 if(id==="agents"){closeAll("agents");agentsWindow.classList.add("nx-open");agentsWindow.setAttribute("aria-hidden","false");agentsWindow.inert=false;choose("agents");raise(agentsWindow);return}
 if(id==="sources")return showResults("sources");if(id==="findings")return showResults("findings");if(id==="pdf")return showPdf();if(id==="history")return showResults("history");if(id==="activity")return showActivity();
});
$("nxAgentsClose")?.addEventListener("click",()=>{closeAgents();choose("universe")});

host.querySelector(".nx-agent-tabs")?.addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;host.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));groups.querySelectorAll(".nx-agent-group").forEach(g=>g.hidden=b.dataset.filter!=="all"&&g.dataset.group!==b.dataset.filter)});

if(activity){const h=activity.querySelector(".activity-head");if(h&&!h.querySelector(".nx-activity-close")){const c=document.createElement("button");c.type="button";c.className="nx-activity-close";c.textContent="×";c.setAttribute("aria-label","Close Activity");c.onclick=e=>{e.stopPropagation();closeActivity();choose("universe")};h.append(c)}}

function draggable(panel,handle){
 if(!panel||!handle)return;let on=false,sx=0,sy=0,l=0,t=0;
 handle.addEventListener("pointerdown",e=>{if(e.button!==0||e.target.closest("button,input,select,textarea,a,summary"))return;const r=panel.getBoundingClientRect();on=true;sx=e.clientX;sy=e.clientY;l=r.left;t=r.top;panel.style.setProperty("right","auto","important");panel.style.setProperty("bottom","auto","important");handle.setPointerCapture?.(e.pointerId);raise(panel)});
 handle.addEventListener("pointermove",e=>{if(!on)return;const x=Math.max(48,Math.min(innerWidth-panel.offsetWidth-8,l+e.clientX-sx)),y=Math.max(8,Math.min(innerHeight-panel.offsetHeight-8,t+e.clientY-sy));panel.style.setProperty("left",x+"px","important");panel.style.setProperty("top",y+"px","important")});
 const stop=()=>on=false;handle.addEventListener("pointerup",stop);handle.addEventListener("pointercancel",stop);panel.addEventListener("pointerdown",()=>raise(panel),{passive:true});
}
draggable(agentsWindow,agentsWindow.querySelector(".nx-titlebar"));draggable(results,results?.querySelector(".results-head"));draggable(learning,learning?.querySelector(".learning-head"));draggable(detail,detail?.querySelector(".detail-head"));draggable(activity,activity?.querySelector(".activity-head"));

if(results)new MutationObserver(()=>{if(isOpen(results)){closeAgents();closeActivity();choose(["sources","history"].includes(results.dataset.nxMode)?results.dataset.nxMode:"findings");raise(results)}}).observe(results,{attributes:true,attributeFilter:["class"]});
if(learning)new MutationObserver(()=>{if(isOpen(learning)){closeAgents();closeActivity();choose("pdf");raise(learning)}}).observe(learning,{attributes:true,attributeFilter:["class"]});
if(detail)new MutationObserver(()=>{if(isOpen(detail))raise(detail)}).observe(detail,{attributes:true,attributeFilter:["class"]});

document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeAll();choose("universe")}});
document.body.classList.add("nx-workspace");choose("universe");closeAgents();closeActivity();
})();