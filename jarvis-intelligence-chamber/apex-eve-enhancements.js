import {connectResearchFeed,isTerminal} from "./live-bridge.js";
const panel=document.getElementById("detailPanel");
const title=document.getElementById("detailTitle");
if(panel&&title){
 const ops=document.createElement("section");ops.className="nx-ops";
 ops.innerHTML='<div class="nx-ops-title">LIVE SECTOR TELEMETRY <i class="nx-status-light"></i></div><div class="nx-ops-line"><span>AGENT</span><b id="nxAgentStatus">SELECT SECTOR</b></div><div class="nx-ops-line"><span>PHASE</span><b id="nxAgentPhase">—</b></div><div class="nx-ops-line"><span>PROGRESS</span><b id="nxAgentProgress">—</b></div><div class="nx-ops-line"><span>RESEARCH RUN</span><b id="nxAgentRun">—</b></div>';
 panel.appendChild(ops);
 const mapping={"Spain":"spanish_simancas","Venice":"venetian","France":"french","Britain":"british","Netherlands":"dutch","German States":"german","Italian States":"italian_states","Greece":"greek","Ottoman Empire":"ottoman","North Africa":"north_african","Travellers & Narratives":"travellers","Source Genealogy":"source_genealogy","Identity Resolution":"identity_resolution","Contradictions":"contradiction","Relationship Networks":"relationship_network","Chronology":"timeline","Pirate Bases":"pirate_base"};
 let snapshot=null,runEvents=[];
 const el=id=>document.getElementById(id);
 function render(){
  const id=mapping[title.textContent.trim()];
  const agent=snapshot?.agents?.find(a=>a.id===id||a.agent_id===id);
  const event=runEvents.find(e=>e.agent_id===id);
  el("nxAgentStatus").textContent=agent?.status||event?.status||"NO LIVE RECORD";
  el("nxAgentPhase").textContent=agent?.phase||event?.phase||"—";
  const p=Number(agent?.percent??event?.percent);
  el("nxAgentProgress").textContent=Number.isFinite(p)?Math.max(0,Math.min(100,Math.round(p)))+"%":"—";
  el("nxAgentRun").textContent=snapshot?.run_id||"—";
  document.querySelectorAll(".nx-agent").forEach(b=>{
   const a=snapshot?.agents?.find(x=>x.id===b.dataset.agent||x.agent_id===b.dataset.agent);
   b.dataset.activity=a?.status&&!isTerminal(a.status)?"active":"idle";
   b.title=a?.status?b.textContent+" · "+a.status:b.textContent;
  });
 }
 new MutationObserver(render).observe(title,{childList:true,characterData:true,subtree:true});
 connectResearchFeed({onSnapshot:s=>{snapshot=s;runEvents=[...(s.events||[])].reverse();render();},onEvent:e=>{runEvents.unshift(e);runEvents=runEvents.slice(0,100);render();},onReset:()=>{snapshot=null;runEvents=[];render();}});
 render();
}
