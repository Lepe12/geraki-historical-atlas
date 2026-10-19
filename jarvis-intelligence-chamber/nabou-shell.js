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
const knowledge=$("knowledgePanel");
const knowledgeStatus=$("knowledgeStatus");
const knowledgeList=$("knowledgeList");
const knowledgeQuery=$("knowledgeQuery");

if(!nav.length||!agentsPage||!results||!learning||!activity||!knowledge){
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
  universe:"Κέντρο ελέγχου",
  cartography:"Ιστορική χαρτογραφία",
  agents:"Επιχειρήσεις πρακτόρων",
  sources:"Αρχεία και πηγές",
  findings:"Ιστορική έρευνα",
  validation:"Έλεγχος ευρημάτων",
  pdf:"Μάθηση και PDF",
  knowledge:"Γνώση και μνήμη",
  diagnostics:"Διαγνωστικά",
  history:"Ιστορικό",
  activity:"Διαγνωστικά"
};
const RESULT_VIEWS=["sources","findings","history","validation"];
const LIVE_API="https://pct-live.piratecartography.com/pct-api/live";
let lastSnapshot=null;
let lastTransport="αναμονή";

function activeNav(view){
  nav.forEach(button=>button.setAttribute("aria-current",button.dataset.nxsView===view?"page":"false"));
  document.body.dataset.nxsView=view;
}

function hideAgents(){agentsPage.classList.add("hidden");agentsPage.setAttribute("aria-hidden","true")}
function hideActivity(){activity.classList.add("hidden")}
function hideResults(){results.classList.add("hidden")}
function hideLearning(){learning.classList.add("hidden")}
function hideKnowledge(){knowledge.classList.add("hidden")}
function hideDetail(){if(detail&&!detail.classList.contains("hidden"))$("closeDetail")?.click()}

function closeAll(except=""){
  if(except!=="agents")hideAgents();
  if(except!=="results")hideResults();
  if(except!=="pdf")hideLearning();
  if(except!=="knowledge")hideKnowledge();
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
  if(mode==="validation"){
    window.dispatchEvent(new CustomEvent("jarvis:results-filter",{detail:{filter:"claims"}}));
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

function openKnowledge(){
  closeAll("knowledge");
  knowledge.classList.remove("hidden");
  activeNav("knowledge");
  refreshKnowledge();
}

function openCartography(){
  closeAll();
  activeNav("cartography");
}

function openDiagnostics(){
  closeAll("activity");
  activity.classList.remove("hidden");
  activeNav("diagnostics");
  renderDiagnostics(lastSnapshot,lastTransport);
}

function openUniverse(){
  closeAll();
  activeNav("universe");
}

for(const button of nav){
  button.addEventListener("click",()=>{
    const view=button.dataset.nxsView;
    if(view==="universe")return openUniverse();
    if(view==="cartography")return openCartography();
    if(view==="agents")return openAgents();
    if(view==="sources"||view==="findings"||view==="history"||view==="validation")return openResults(view);
    if(view==="pdf")return openPdf();
    if(view==="knowledge")return openKnowledge();
    if(view==="diagnostics"||view==="activity")return openDiagnostics();
  });
}

$("nxsCloseAgents")?.addEventListener("click",openUniverse);
$("nxsCloseActivity")?.addEventListener("click",openUniverse);
$("closeKnowledge")?.addEventListener("click",openUniverse);

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
    hideAgents();hideActivity();hideLearning();hideKnowledge();
    const mode=results.dataset.nxsMode||"findings";
    activeNav(RESULT_VIEWS.includes(mode)?mode:"findings");
  }else if(RESULT_VIEWS.includes(body.dataset.nxsView||"")){
    activeNav("universe");
  }
}).observe(results,{attributes:true,attributeFilter:["class"]});

new MutationObserver(()=>{
  if(!learning.classList.contains("hidden")){
    hideAgents();hideActivity();hideResults();hideKnowledge();activeNav("pdf");
  }else if(body.dataset.nxsView==="pdf")activeNav("universe");
}).observe(learning,{attributes:true,attributeFilter:["class"]});

new MutationObserver(()=>{
  if(!knowledge.classList.contains("hidden")){
    hideAgents();hideActivity();hideResults();hideLearning();activeNav("knowledge");
  }else if(body.dataset.nxsView==="knowledge")activeNav("universe");
}).observe(knowledge,{attributes:true,attributeFilter:["class"]});

document.addEventListener("keydown",event=>{
  if(event.key==="Escape"){openUniverse();nav.find(button=>button.dataset.nxsView==="universe")?.focus();}
});

function renderDiagnostics(snapshot,mode){
  const transport=$("diagnosticTransport");
  const list=$("diagnosticBlockers");
  if(transport){
    const run=snapshot?.run_id?" · run "+snapshot.run_id:"";
    transport.textContent="Μεταφορά: "+(mode||"άγνωστη")+run+(snapshot?.safety?.automatic_verified===false?" · καμία αυτόματη επαλήθευση":"");
  }
  if(!list)return;
  list.replaceChildren();
  const blockers=Array.isArray(snapshot?.blockers)?snapshot.blockers:[];
  if(!blockers.length){
    const item=document.createElement("li");
    item.textContent="Δεν έχουν καταγραφεί εμπόδια σε αυτό το στιγμιότυπο.";
    list.append(item);
    return;
  }
  for(const blocker of blockers.slice(0,12)){
    const item=document.createElement("li");
    item.textContent=String(blocker.description||blocker.detail||blocker.status||"Εμπόδιο χωρίς περιγραφή");
    list.append(item);
  }
}

function knowledgeNote(text){if(knowledgeStatus)knowledgeStatus.textContent=text;}
function renderKnowledgeRows(rows,emptyText){
  knowledgeList.replaceChildren();
  if(!rows.length){
    const empty=document.createElement("p");
    empty.textContent=emptyText;
    knowledgeList.append(empty);
    return;
  }
  for(const row of rows){
    const card=document.createElement("article");
    card.className="knowledge-hit";
    const title=document.createElement("strong");
    title.textContent=String(row.original_name||row.source_id||row.type||"Καταχώριση");
    const meta=document.createElement("small");
    meta.textContent=[row.state,row.type,row.page?"σελ. "+row.page:"",row.accepted_items!=null?row.accepted_items+" εγκεκριμένα":""].filter(Boolean).join(" · ");
    card.append(title,meta);
    if(row.text){
      const body=document.createElement("p");
      body.textContent=String(row.text).slice(0,700);
      card.append(body);
    }
    knowledgeList.append(card);
  }
}
async function readKnowledge(path){
  const response=await fetch(LIVE_API+path);
  let data={};
  try{data=await response.json()}catch(_){}
  if(!response.ok){
    const error=new Error(String(data.error||("HTTP "+response.status)));
    error.status=response.status;
    throw error;
  }
  return data;
}
async function refreshKnowledge(){
  knowledgeNote("Ανάγνωση ευρετηρίου μνήμης…");
  try{
    const data=await readKnowledge("/knowledge/sources");
    const sources=Array.isArray(data.sources)?data.sources:[];
    renderKnowledgeRows(sources,"Δεν υπάρχουν εγκεκριμένες πηγές σε αυτή τη μνήμη.");
    knowledgeNote(sources.length+" καταχωρίσεις. Η έγκριση δεν είναι ιστορική επαλήθευση.");
  }catch(error){
    knowledgeList.replaceChildren();
    knowledgeNote("Αποτυχία ανάγνωσης μνήμης · "+(error.status?"HTTP "+error.status+" · ":"")+error.message);
  }
}
async function searchKnowledge(event){
  event.preventDefault();
  const query=knowledgeQuery.value.trim();
  if(query.length<2){knowledgeNote("Χρειάζονται τουλάχιστον δύο χαρακτήρες.");return;}
  knowledgeNote("Αναζήτηση στη μνήμη…");
  try{
    const data=await readKnowledge("/knowledge/search?q="+encodeURIComponent(query));
    const results=Array.isArray(data.results)?data.results:[];
    renderKnowledgeRows(results,"Καμία εγκεκριμένη καταχώριση δεν περιέχει αυτό το κείμενο.");
    knowledgeNote(results.length+" αποτελέσματα. Προέρχονται από εγκεκριμένα αποσπάσματα, όχι από επαληθευμένη ιστορία.");
  }catch(error){
    knowledgeList.replaceChildren();
    knowledgeNote("Αποτυχία αναζήτησης μνήμης · "+(error.status?"HTTP "+error.status+" · ":"")+error.message);
  }
}
$("knowledgeRefresh")?.addEventListener("click",refreshKnowledge);
$("knowledgeSearch")?.addEventListener("submit",searchKnowledge);

connectResearchFeed({
  onState:mode=>{
    lastTransport=({LIVE:"ζωντανή σύνδεση",SNAPSHOT:"αποθηκευμένο στιγμιότυπο",OFFLINE:"χωρίς σύνδεση",CONNECTING:"σύνδεση"})[mode]||mode;
    const el=document.querySelector(".nxs-status small");
    if(el)el.textContent=({LIVE:"Ζωντανή σύνδεση",SNAPSHOT:"Αποθηκευμένα δεδομένα",OFFLINE:"Χωρίς σύνδεση",CONNECTING:"Σύνδεση…"})[mode]||"Σύνδεση: "+mode;
    renderDiagnostics(lastSnapshot,lastTransport);
  },
  onSnapshot:snapshot=>{
    lastSnapshot=snapshot;
    renderDiagnostics(snapshot,lastTransport);
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

// Reserve the composer’s actual height so longer questions never cover a panel.
const queryField=$("operatorQuery"),composer=$("operatorCommand");
function sizeQuestion(){
 queryField.style.height="auto";
 queryField.style.height=Math.min(112,Math.max(44,queryField.scrollHeight))+"px";
}
queryField.addEventListener("input",sizeQuestion);
window.addEventListener("jarvis:reuse-query",sizeQuestion);
addEventListener("resize",sizeQuestion);
new ResizeObserver(()=>body.style.setProperty("--composer-height",composer.getBoundingClientRect().height+"px")).observe(composer);
sizeQuestion();
