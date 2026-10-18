import {connectResearchFeed,isTerminal} from "./live-bridge.js";

const $=id=>document.getElementById(id);
const body=document.body;
const nav=[...document.querySelectorAll("[data-nxs-view]")];
const agentsPage=$("nxsAgentsPage");
const agentGroups=$("nxsAgentGroups");
const agentTabs=$("nxsAgentTabs");
const results=$("resultsDrawer");
const learning=$("learningPanel");
const activity=$("activityStrip");
const detail=$("detailPanel");

if(!nav.length||!agentsPage||!results||!learning||!activity){
  throw new Error("NABOU shell markup incomplete");
}

body.classList.add("nxs-active");

const agentDefs=[
["greek","Ελλάδα","archive"],["spanish_simancas","Ισπανία / Simancas","archive"],["venetian","Βενετία","archive"],
["french","Γαλλία","archive"],["british","Βρετανία","archive"],["dutch","Ολλανδία","archive"],
["german","Γερμανικά κράτη","archive"],["italian_states","Ιταλικά κράτη","archive"],["ottoman","Οθωμανική αυτοκρατορία","archive"],
["north_african","Βόρεια Αφρική","archive"],["travellers","Περιηγητές & αφηγήσεις","archive"],
["source_genealogy","Γενεαλογία πηγών","analysis"],["identity_resolution","Ταυτοποίηση","analysis"],
["contradiction","Αντιφάσεις","analysis"],["relationship_network","Δίκτυα σχέσεων","analysis"],
["timeline","Χρονολόγιο","analysis"],["pirate_base","Πειρατικές βάσεις","analysis"]
];

for(const group of ["archive","analysis"]){
  const section=document.createElement("section");
  section.className="nxs-agent-group";
  section.dataset.group=group;
  const members=agentDefs.filter(x=>x[2]===group);
  section.innerHTML='<header><strong>'+(group==="archive"?"Αρχειακοί ερευνητές":"Ερευνητές ανάλυσης")+'</strong><span>'+members.length+' μέλη</span></header><div class="nxs-agent-list"></div>';
  const list=section.querySelector(".nxs-agent-list");
  for(const [id,name] of members){
    const row=document.createElement("button");
    row.type="button";
    row.addEventListener("click",()=>{openUniverse();window.dispatchEvent(new CustomEvent("jarvis:focus-agent",{detail:{agent_id:id}}));});
    row.className="nxs-agent nx-agent";
    row.dataset.agent=id;
    row.dataset.activity="idle";
    row.innerHTML='<span class="nxs-agent-signal"></span><span class="nxs-agent-name"></span><small class="nxs-agent-state">Σε αναμονή</small>';
    row.querySelector(".nxs-agent-name").textContent=name;
    row.setAttribute("aria-label","Προβολή ερευνητή: "+name);
    list.append(row);
  }
  agentGroups.append(section);
}

const titles={
  universe:"Επισκόπηση",
  agents:"Ερευνητές",
  sources:"Sources",
  findings:"Η έρευνά μου",
  pdf:"PDF Review",
  history:"History",
  activity:"Activity"
};

function activeNav(view){
  nav.forEach(button=>button.setAttribute("aria-current",button.dataset.nxsView===view?"page":"false"));
  document.body.dataset.nxsView=view;
}

function hideAgents(){agentsPage.classList.add("hidden");agentsPage.setAttribute("aria-hidden","true")}
function hideActivity(){activity.classList.add("hidden")}
function hideResults(){results.classList.add("hidden")}
function hideLearning(){learning.classList.add("hidden")}
function hideDetail(){if(detail&&!detail.classList.contains("hidden"))$("closeDetail")?.click()}

function closeAll(except=""){
  if(except!=="agents")hideAgents();
  if(except!=="results")hideResults();
  if(except!=="pdf")hideLearning();
  if(except!=="activity")hideActivity();
  hideDetail();
}

function openAgents(){
  closeAll("agents");
  agentsPage.classList.remove("hidden");
  agentsPage.setAttribute("aria-hidden","false");
  activeNav("agents");
}

function configureResults(mode){
  const head=results.querySelector(".results-head span");
  const summary=results.querySelector(".results-summary");
  results.dataset.nxsMode=mode;
  results.scrollTop=0;
  $("discoveryDetail").hidden=true;
  if(head)head.textContent=titles[mode]||"Findings";
  if(summary)summary.dataset.mode=mode;
  if(mode==="history"){
    const options=results.querySelector(".result-options");
    if(options)options.open=true;
    requestAnimationFrame(()=>$("researchRunId")?.focus({preventScroll:true}));
  }
  if(mode==="sources"){
    window.dispatchEvent(new CustomEvent("jarvis:results-filter",{detail:{filter:"all"}}));
    requestAnimationFrame(()=>$("resultSearch")?.focus({preventScroll:true}));
  }
  if(mode==="findings"){
    window.dispatchEvent(new CustomEvent("jarvis:results-filter",{detail:{filter:"all"}}));
  }
}

function openResults(mode){
  closeAll("results");
  if(results.classList.contains("hidden"))$("resultsToggle")?.click();
  configureResults(mode);
  activeNav(mode);
}

function openPdf(){
  closeAll("pdf");
  if(learning.classList.contains("hidden"))$("learningToggle")?.click();
  activeNav("pdf");
}

function openActivity(){
  closeAll("activity");
  activity.classList.remove("hidden");
  activeNav("activity");
}

function openUniverse(){
  closeAll();
  activeNav("universe");
}

for(const button of nav){
  button.addEventListener("click",()=>{
    const view=button.dataset.nxsView;
    if(view==="universe")return openUniverse();
    if(view==="agents")return openAgents();
    if(view==="sources"||view==="findings"||view==="history")return openResults(view);
    if(view==="pdf")return openPdf();
    if(view==="activity")return openActivity();
  });
}

$("nxsCloseAgents")?.addEventListener("click",openUniverse);
$("nxsCloseActivity")?.addEventListener("click",openUniverse);

agentTabs?.addEventListener("click",event=>{
  const button=event.target.closest("[data-agent-filter]");
  if(!button)return;
  agentTabs.querySelectorAll("[data-agent-filter]").forEach(tab=>tab.classList.toggle("active",tab===button));
  const filter=button.dataset.agentFilter;
  agentGroups.querySelectorAll(".nxs-agent-group").forEach(group=>{
    group.hidden=filter!=="all"&&group.dataset.group!==filter;
  });
});

new MutationObserver(()=>{
  if(!results.classList.contains("hidden")){
    hideAgents();hideActivity();hideLearning();
    const mode=results.dataset.nxsMode||"findings";
    activeNav(["sources","history"].includes(mode)?mode:"findings");
  }else if(["sources","findings","history"].includes(body.dataset.nxsView||"")){
    activeNav("universe");
  }
}).observe(results,{attributes:true,attributeFilter:["class"]});

new MutationObserver(()=>{
  if(!learning.classList.contains("hidden")){
    hideAgents();hideActivity();hideResults();activeNav("pdf");
  }else if(body.dataset.nxsView==="pdf")activeNav("universe");
}).observe(learning,{attributes:true,attributeFilter:["class"]});

document.addEventListener("keydown",event=>{
  if(event.key==="Escape"){openUniverse();nav.find(button=>button.dataset.nxsView==="universe")?.focus();}
});

connectResearchFeed({
  onState:mode=>{const el=document.querySelector(".nxs-status small");if(el)el.textContent=({LIVE:"Ζωντανή σύνδεση",SNAPSHOT:"Αποθηκευμένα δεδομένα",OFFLINE:"Χωρίς σύνδεση",CONNECTING:"Σύνδεση…"})[mode]||"Σύνδεση: "+mode;},
  onSnapshot:snapshot=>{
    const agents=snapshot?.agents||[];
    document.querySelectorAll(".nxs-agent").forEach(row=>{
      const agent=agents.find(a=>a.id===row.dataset.agent||a.agent_id===row.dataset.agent);
      const status=String(agent?.status||agent?.phase||"STANDBY").toUpperCase();
      const active=!!agent?.status&&!isTerminal(agent.status);
      row.dataset.activity=active?"active":"idle";
      row.querySelector(".nxs-agent-state").textContent=({STANDBY:"Σε αναμονή",IDLE:"Ανενεργός",RUNNING:"Σε εξέλιξη",COMPLETED:"Ολοκληρώθηκε",BLOCKED:"Εμπόδιο",FAILED:"Αποτυχία"})[status]||status;
    });
  },
  onReset:()=>{
    document.querySelectorAll(".nxs-agent").forEach(row=>{
      row.dataset.activity="idle";
      row.querySelector(".nxs-agent-state").textContent="Σε αναμονή";
    });
  }
});

if(!results.classList.contains("hidden"))activeNav("findings");else activeNav("universe");
hideAgents();
hideActivity();
