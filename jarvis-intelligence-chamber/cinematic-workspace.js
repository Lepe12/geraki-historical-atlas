(()=>{"use strict";
const $=id=>document.getElementById(id),app=$("app");if(!app||!$("universe"))return;
document.querySelector(".nabou-rail")?.remove();
const host=document.createElement("div");host.className="nx-ui";
host.innerHTML='<nav class="nx-dock" aria-label="NABOU//X navigation"></nav><section class="nx-drawer" id="nxDrawer" aria-label="Agent selection" aria-hidden="true"><header><small>NABOU//X / RESEARCH NETWORK</small><button id="nxClose" type="button" aria-label="Close">×</button></header><h2>AGENT NETWORK</h2><p>Επιλογή ερευνητικού τομέα</p><div class="nx-agent-grid" id="nxAgentGrid"></div></section>';
app.appendChild(host);
const nav=host.querySelector("nav"),drawer=$("nxDrawer"),grid=$("nxAgentGrid");
const actions=[["map","◈","ΧΑΡΤΗΣ"],["agents","⌘","AGENTS"],["sources","▤","ΠΗΓΕΣ"],["findings","⌕","ΕΥΡΗΜΑΤΑ"],["learning","◇","PDF"],["history","◷","ΙΣΤΟΡΙΚΟ"],["activity","≋","ΠΟΡΕΙΑ"]];
const agents=[["greek","Ελλάδα"],["spanish_simancas","Ισπανία"],["venetian","Βενετία"],["french","Γαλλία"],["british","Βρετανία"],["dutch","Ολλανδία"],["german","Γερμανικά κράτη"],["italian_states","Ιταλικά κράτη"],["ottoman","Οθωμανική αυτοκρατορία"],["north_african","Βόρεια Αφρική"],["travellers","Περιηγητές"],["source_genealogy","Γενεαλογία πηγών"],["identity_resolution","Ταυτοποίηση"],["contradiction","Αντιφάσεις"],["relationship_network","Δίκτυα σχέσεων"],["timeline","Χρονολόγιο"],["pirate_base","Πειρατικές βάσεις"]];
const nodes=new Map();
for(const [id,glyph,label] of actions){const b=document.createElement("button");b.type="button";b.dataset.nx=id;b.title=label;b.setAttribute("aria-label",label);const symbol=document.createElement("span");symbol.textContent=glyph;const sub=document.createElement("small");sub.textContent=label;b.append(symbol,sub);nav.appendChild(b);nodes.set(id,b);}
for(const [id,name] of agents){const b=document.createElement("button");b.type="button";b.className="nx-agent";b.dataset.agent=id;b.textContent=name;grid.appendChild(b);}
function drawerState(open){drawer.classList.toggle("nx-open",open);drawer.setAttribute("aria-hidden",String(!open));drawer.inert=!open;}
function closePanels(){if(!$("resultsDrawer").classList.contains("hidden"))$("closeResults")?.click();if(!$("learningPanel").classList.contains("hidden"))$("closeLearning")?.click();}
function results(){drawerState(false);if($("resultsDrawer").classList.contains("hidden"))$("resultsToggle")?.click();}
nav.addEventListener("click",e=>{const b=e.target.closest("[data-nx]");if(!b)return;const id=b.dataset.nx;for(const [key,el] of nodes)el.setAttribute("aria-current",key===id?"page":"false");switch(id){
case "map":closePanels();drawerState(false);$("resetView")?.click();break;
case "agents":closePanels();drawerState(!drawer.classList.contains("nx-open"));break;
case "sources":results();$("resultsDrawer")?.querySelector(".result-options")?.setAttribute("open","");break;
case "findings":results();break;
case "learning":drawerState(false);if($("learningPanel").classList.contains("hidden"))$("learningToggle")?.click();break;
case "history":results();$("resultsDrawer")?.querySelector(".result-options")?.setAttribute("open","");$("researchRunId")?.focus({preventScroll:true});break;
case "activity":drawerState(false);$("deckActivity")?.click();break;
}});
grid.addEventListener("click",e=>{const b=e.target.closest("[data-agent]");if(!b)return;const order=["spanish_simancas","venetian","french","british","dutch","german","italian_states","greek","ottoman","north_african","travellers","source_genealogy","identity_resolution","contradiction","relationship_network","timeline","pirate_base"];const i=order.indexOf(b.dataset.agent),labels=document.querySelectorAll("#nodeLabels .node-label"),label=labels[i],canvas=$("universe");if(label&&canvas){const x=parseFloat(label.style.left),y=parseFloat(label.style.top),rect=canvas.getBoundingClientRect();if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<rect.width&&y<rect.height){canvas.dispatchEvent(new PointerEvent("pointerup",{clientX:rect.left+x,clientY:rect.top+y,bubbles:true}));$("focusButton")?.click();}}drawerState(false);});
$("nxClose").onclick=()=>drawerState(false);
document.addEventListener("keydown",e=>{if(e.key==="Escape")drawerState(false);});
document.body.classList.add("nx-workspace");nodes.get("map").setAttribute("aria-current","page");drawerState(false);
})();