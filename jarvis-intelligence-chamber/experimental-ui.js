import {connectResearchFeed,isTerminal} from "./live-bridge.js";
const $=id=>document.getElementById(id),body=document.body;
const layer=$("expUi"),restore=$("expRestore"),zen=$("expZen"),remove=$("expRemove"),modes=$("expModes"),filters=$("expFilters");
const core=$("expCoreState"),active=$("expActiveCount"),claims=$("expClaimsCount"),blockers=$("expBlockersCount");
const terminal=new Set(["BLOCKED_CONFIGURATION","INSUFFICIENT_EVIDENCE","COMPLETED","FAILED","ERROR","CANCELLED","CANCELED","BLOCKED","SKIPPED","DONE","IDLE","UNAVAILABLE"]);
function setHidden(v){body.classList.toggle("exp-hidden",v);localStorage.setItem("jarvis_exp_ui",v?"off":"on");}
function setMode(mode){body.classList.remove("exp-mode-active","exp-mode-evidence","exp-mode-contradictions");if(mode!=="universe")body.classList.add("exp-mode-"+mode);modes.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));if(mode==="evidence"){window.dispatchEvent(new CustomEvent("jarvis:results-filter",{detail:{filter:"claims"}}));window.dispatchEvent(new Event("jarvis:results-open"));}else if(mode==="contradictions"){window.dispatchEvent(new CustomEvent("jarvis:results-filter",{detail:{filter:"contradictions"}}));window.dispatchEvent(new Event("jarvis:results-open"));}else if(mode==="universe")window.dispatchEvent(new Event("jarvis:results-close"));}
function setFilter(filter){filters.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter));window.dispatchEvent(new CustomEvent("jarvis:results-filter",{detail:{filter}}));if(filter!=="all")window.dispatchEvent(new Event("jarvis:results-open"));}
modes.addEventListener("click",e=>{const b=e.target.closest("button[data-mode]");if(b)setMode(b.dataset.mode);});
filters.addEventListener("click",e=>{const b=e.target.closest("button[data-filter]");if(b)setFilter(b.dataset.filter);});
zen.onclick=()=>{const on=!body.classList.contains("zen-mode");body.classList.toggle("zen-mode",on);zen.textContent=on?"ΕΠΙΣΤΡΟΦΗ":"ΚΑΘΑΡΗ ΠΡΟΒΟΛΗ";};
remove.onclick=()=>setHidden(true);restore.onclick=()=>setHidden(false);
if(localStorage.getItem("jarvis_exp_ui")==="off")setHidden(true);
connectResearchFeed({onReset:()=>{active.textContent=claims.textContent=blockers.textContent="0";},onSnapshot:s=>{const agents=s.agents||[];active.textContent=agents.filter(a=>a.status&&!isTerminal(a.status)).length;claims.textContent=(s.claims||[]).length;blockers.textContent=(s.blockers||[]).length;},onState:m=>{core.textContent=m;core.parentElement?.classList.toggle("warn",m==="OFFLINE"||m==="RECONNECTING");}});


