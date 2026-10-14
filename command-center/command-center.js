(function(){
"use strict";
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
let mode="operations",feedMode="evidence",map,mapLoaded=false,terrainOn=true,socket=null,poller=null;
let api=(query.get("api")||"https://www.piratecartography.com/pct-api/live").replace(/\/$/,"");
let currentRun=query.get("run")||"latest",project=query.get("project")||"piratecartography",selected=null;
let events=[],claims=[],blockers=[],snapshotMeta=null,liveConnected=false;

const catalog={
 greek:{label:"Greek Research",city:"Athens, Greece (reference city)",p:[23.7275,37.9838]},
 spanish_simancas:{label:"Simancas",city:"Simancas, Spain",p:[-4.828,41.590]},
 venetian:{label:"Venice",city:"Venice, Italy",p:[12.3155,45.4408]},
 french:{label:"French",city:"Paris, France",p:[2.3522,48.8566]},
 british:{label:"British",city:"London, UK",p:[-0.1276,51.5072]},
 dutch:{label:"Dutch",city:"The Hague, Netherlands",p:[4.3007,52.0705]},
 german:{label:"German",city:"Berlin, Germany",p:[13.405,52.52]},
 ottoman:{label:"Ottoman",city:"Istanbul, Türkiye",p:[28.9784,41.0082]},
 north_african:{label:"North African",city:"Algiers, Algeria",p:[3.0588,36.7538]},
 italian_states:{label:"Italian States",city:"Rome, Italy (reference city)",p:[12.4964,41.9028]},
 travellers:{label:"Travellers",city:"No single reference city",p:null},
 pirate_base:{label:"Pirate Base",city:"No fixed archive location",p:null},
 pirate_biography:{label:"Pirate Biography",city:"No fixed archive location",p:null},
 identity_resolution:{label:"Identity Resolution",city:"Research logic",p:null},
 timeline:{label:"Timeline",city:"Research logic",p:null},
 relationship_network:{label:"Relationship Network",city:"Research logic",p:null},
 contradiction:{label:"Contradiction",city:"Research logic",p:null},
 source_genealogy:{label:"Source Genealogy",city:"Research logic",p:null}
};
let agents=[];
const agentData=new Map();
const markers=new Map();
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function ensureAgent(id,label){
 if(!id)return null;
 if(!agentData.has(id)){
   const base=catalog[id]||{label:label||id.replaceAll("_"," "),city:"Research logic",p:null};
   const a={id,label:label||base.label,city:base.city,p:base.p};
   agents.push(a);agentData.set(id,{status:"NOT REPORTED",phase:"",percent:null,record_count:null,blocker_count:0});
   if(mapLoaded&&a.p&&!markers.has(id))addOneMarker(a);
 }
 return agentData.get(id);
}
function setConnection(label,cls,detail){
 $("connection-status").className="status "+cls;$("connection-status").textContent="● "+label;
 liveConnected=cls==="online";$("connection-detail").textContent=detail;
 $("core-state").textContent=liveConnected?"RESEARCH CORE · LIVE":cls==="connecting"?"RESEARCH CORE · DURABLE SNAPSHOT":"RESEARCH CORE · STANDBY";
 $("data-integrity").textContent=liveConnected?"Πραγματικά συμβάντα μέσω production WebSocket":"Πραγματικά durable δεδομένα · κανένα αποτέλεσμα δεν προσομοιώνεται";
}
function formatTime(value){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString("el-GR",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"});}
function validStatus(s){return ["RUNNING","COMPLETED","FAILED","BLOCKED","QUEUED"].includes(s)?s:"NOT REPORTED";}
function getAgent(id){return agents.find(x=>x.id===id);}
function setMode(next){mode=next;document.body.dataset.currentMode=next;document.querySelectorAll(".mode").forEach(b=>b.classList.toggle("active",b.dataset.mode===next));$("results-heading").textContent=next==="operations"?"Evidence & Mission Log":next==="evidence"?"Evidence Explorer":"Scientific Review & Decisions";feedMode=next==="operations"?"events":"evidence";document.querySelectorAll(".feed-tab").forEach(b=>b.classList.toggle("active",b.dataset.feed===feedMode));renderFeed();if(next==="decisions")$("review-summary").scrollIntoView({behavior:"smooth",block:"nearest"});}
function selectAgent(id){selected=id;document.querySelectorAll(".agent-row").forEach(x=>x.classList.toggle("selected",x.dataset.id===id));for(const [key,m] of markers)m.getElement()?.classList.toggle("selected",key===id);const a=getAgent(id);if(a?.p&&mapLoaded){map.flyTo({center:a.p,zoom:6,pitch:38,duration:900});$("map-focus-label").textContent=a.city;}else if(a){$("map-focus-label").textContent=a.label+" (χωρίς γεωγραφική θέση)";}}
function renderAgents(){
 let running=0;
 $("agents-list").innerHTML=agents.map(a=>{const d=agentData.get(a.id)||{},status=validStatus(d.status);if(status==="RUNNING")running++;const extra=d.record_count!==null&&d.record_count!==undefined?(" · "+d.record_count+" records"):"";return '<button type="button" class="agent-row '+(selected===a.id?"selected":"")+'" data-id="'+escapeHtml(a.id)+'"><span class="agent-symbol">✧</span><span><b>'+escapeHtml(a.label)+'</b><small>'+escapeHtml((d.phase||a.city)+extra)+'</small></span><span class="agent-state '+status.toLowerCase()+'">'+escapeHtml(status==="NOT REPORTED"?"—":status)+'</span></button>';}).join("");
 $("active-count").textContent=agents.length?(running+" / "+agents.length):"—";
 document.querySelectorAll(".agent-row").forEach(b=>b.addEventListener("click",()=>selectAgent(b.dataset.id)));
 for(const a of agents){const marker=markers.get(a.id);if(marker)marker.getElement().classList.toggle("active",(agentData.get(a.id)||{}).status==="RUNNING");}
}
function addOneMarker(a){
 if(!a.p||markers.has(a.id)||!mapLoaded)return;
 const node=document.createElement("button");node.className="archive-pin";node.type="button";node.setAttribute("aria-label",a.label+" — "+a.city);node.title=a.label+" / "+a.city;
 const popup=new maplibregl.Popup({offset:18}).setHTML("<strong>"+escapeHtml(a.label)+"</strong><br>"+escapeHtml(a.city)+"<br><small>Θέση πόλης αναφοράς, όχι ιστορικό γεγονός.</small>");
 const marker=new maplibregl.Marker({element:node,anchor:"center"}).setLngLat(a.p).setPopup(popup).addTo(map);node.addEventListener("click",()=>selectAgent(a.id));markers.set(a.id,marker);
}
function addArchiveMarkers(){for(const a of agents)addOneMarker(a);}
function styleMap(){if(!map?.isStyleLoaded())return;const style=map.getStyle();for(const layer of style.layers||[]){const n=layer.id.toLowerCase();try{if(layer.type==="symbol"){if(/road|highway|street|poi|air|rail|transit|housenumber/.test(n))map.setLayoutProperty(layer.id,"visibility","none");continue;}if(layer.type==="background")map.setPaintProperty(layer.id,"background-color","#071824");if(layer.type==="fill"){if(/water|sea|ocean|lake/.test(n))map.setPaintProperty(layer.id,"fill-color","#092d3a");else if(/land|earth|landcover|natural/.test(n))map.setPaintProperty(layer.id,"fill-color","#274b4d");else if(/wood|forest|park|grass|green/.test(n))map.setPaintProperty(layer.id,"fill-color","#285357");}if(layer.type==="line"&&/water|river/.test(n))map.setPaintProperty(layer.id,"line-color","#1e6974");}catch(_){}}try{if(!map.getSource("jarvis-real-dem"))map.addSource("jarvis-real-dem",{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],tileSize:256,encoding:"terrarium",maxzoom:14,attribution:"Terrain © AWS Terrain Tiles"});map.addLayer({id:"jarvis-hillshade",type:"hillshade",source:"jarvis-real-dem",paint:{"hillshade-shadow-color":"#031119","hillshade-highlight-color":"#639b92","hillshade-accent-color":"#113b42","hillshade-exaggeration":0.6}});if(terrainOn)map.setTerrain({source:"jarvis-real-dem",exaggeration:1.2});}catch(err){console.warn("Terrain not available",err);}}
function createMap(){if(!window.maplibregl){$("map-unavailable").hidden=false;return;}try{map=new maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/liberty",center:[15.5,39.5],zoom:4.2,pitch:36,bearing:-7,antialias:true,attributionControl:true,maxPitch:65});map.addControl(new maplibregl.NavigationControl({showCompass:true}),"bottom-right");map.on("load",()=>{mapLoaded=true;styleMap();addArchiveMarkers();$("map-unavailable").hidden=true;});map.on("error",e=>{console.warn("MapLibre:",e.error?.message||e);if(!mapLoaded)$("map-unavailable").hidden=false;});}catch(e){$("map-unavailable").hidden=false;console.error(e);}}
function eventInfo(e){return [e.phase,e.detail,e.event_type,e.status].filter(Boolean).join(" · ")||"Event";}
function claimInfo(c){return [c.title||c.candidate_id,c.source_type,c.evidence_state,c.event_type].filter(Boolean).join(" · ");}
function renderFeed(){
 const q=(document.body.dataset.search||"").toLowerCase();
 if(feedMode==="events"){
  const rows=events.filter(e=>!q||JSON.stringify(e).toLowerCase().includes(q)).slice(-100).reverse();
  $("feed").innerHTML=rows.length?rows.map(e=>'<div class="feed-entry"><div><b>'+escapeHtml(e.agent_id||e.event_type||"SYSTEM")+'</b> · '+escapeHtml(eventInfo(e))+'</div><time>'+escapeHtml(formatTime(e.created_utc))+'</time></div>').join(""):'<p class="empty">Δεν υπάρχουν καταγεγραμμένα συμβάντα στο run. Δεν εμφανίζονται δοκιμαστικά δεδομένα.</p>';
  return;
 }
 const rows=claims.filter(c=>!q||JSON.stringify(c).toLowerCase().includes(q)).slice(0,150);
 const eventRows=events.filter(e=>/evidence|source|candidate|claim|contradiction|genealogy|archive|catalogue/i.test([e.event_type,e.phase,e.detail].join(" "))).slice(-50).reverse();
 let html=rows.map(c=>{const url=typeof c.url==="string"&&/^https:\/\//.test(c.url)?'<a class="link" href="'+escapeHtml(c.url)+'" target="_blank" rel="noopener noreferrer">Πηγή ↗</a>':"";return '<div class="feed-entry"><div><b>'+escapeHtml(c.lane||"CLAIM")+'</b> · '+escapeHtml(claimInfo(c))+' '+url+'</div><time>'+(c.verified?"VERIFIED":"CANDIDATE")+'</time></div>';}).join("");
 html+=eventRows.map(e=>'<div class="feed-entry"><div><b>'+escapeHtml(e.agent_id||e.event_type||"SYSTEM")+'</b> · '+escapeHtml(eventInfo(e))+'</div><time>'+escapeHtml(formatTime(e.created_utc))+'</time></div>').join("");
 $("feed").innerHTML=html||'<p class="empty">Δεν υπάρχουν candidate claims ή evidence events στο επιλεγμένο run.</p>';
}
function renderQa(){
 const inspected=claims.filter(c=>c.original_inspected).length,verified=claims.filter(c=>c.verified).length;
 $("qa-original").textContent=claims.length?(inspected+" / "+claims.length+" ΑΥΤΟΨΙΕΣ"):"ΚΑΝΕΝΑ CANDIDATE";
 const genealogy=agentData.get("source_genealogy");$("qa-genealogy").textContent=genealogy?.status==="COMPLETED"?"ΕΚΤΕΛΕΣΤΗΚΕ · ΕΛΕΓΧΟΣ":"ΕΚΚΡΕΜΕΙ";
 const contra=Number(snapshotMeta?.contradictions?.search_records||0);$("qa-contradictions").textContent=contra?(contra+" SEARCH LEADS · ΜΗ ΕΠΑΛΗΘ."):"ΚΑΝΕΝΑ LEAD";
 $("review-summary").textContent=(claims.length+" candidate claims · "+verified+" verified · "+contra+" contradiction-search records. Ανθρώπινο ACCEPT/VERIFY παραμένει υποχρεωτικό.");
}
function rebuildFromEvents(){
 for(const e of events){if(!e.agent_id)continue;const d=ensureAgent(e.agent_id);if(e.event_type==="agent_started")d.status="RUNNING";else if(e.event_type==="agent_completed")d.status="COMPLETED";else if(e.event_type==="agent_failed")d.status="FAILED";else if(e.status)d.status=String(e.status).toUpperCase();if(e.phase)d.phase=e.phase;if(e.percent!==undefined&&Number.isFinite(Number(e.percent)))d.percent=Number(e.percent);}
 renderAgents();renderFeed();renderQa();$("run-label").textContent="RUN "+currentRun;
}
function applySnapshot(snap,transport){
 if(!snap||snap.schema!=="pct-command-center-live-v1")throw Error("Invalid Command Center snapshot");
 snapshotMeta=snap;currentRun=String(snap.run_id||currentRun);claims=Array.isArray(snap.claims)?snap.claims:[];blockers=Array.isArray(snap.blockers)?snap.blockers:[];
 events=Array.isArray(snap.events)?snap.events.slice(-600):[];
 agents=[];agentData.clear();
 for(const a of snap.agents||[]){const d=ensureAgent(a.id,a.label);Object.assign(d,{status:a.status||"NOT REPORTED",phase:a.phase||"",percent:a.percent,record_count:a.record_count??null,blocker_count:a.blocker_count||0});}
 const mission=snap.mission||{};if(mission.target)$("research-target").value=mission.target;if(mission.date_range)$("research-period").value=mission.date_range;if(mission.purpose)$("research-purpose").value=mission.purpose;
 rebuildFromEvents();
 if(transport==="snapshot")setConnection("DURABLE SNAPSHOT","connecting","Πραγματικό snapshot run "+currentRun+" από GitHub Pages. WebSocket backend μη διαθέσιμο.");
}
function eventKey(x){return x.event_id||[x.created_utc,x.agent_id,x.event_type,x.phase,x.detail].join("|");}
function ingest(incoming){
 const seen=new Set(events.map(eventKey));
 for(const e of incoming||[]){if(!e||typeof e!=="object")continue;if(e.schema==="pct-command-center-bootstrap-v1"){if(e.snapshot)applySnapshot(e.snapshot,"backend");if(Array.isArray(e.events))ingest(e.events);continue;}if(!seen.has(eventKey(e))){events.push(e);seen.add(eventKey(e));if(e.run_id)currentRun=String(e.run_id);}}
 events.sort((a,b)=>String(a.created_utc||"").localeCompare(String(b.created_utc||"")));if(events.length>1000)events=events.slice(-1000);rebuildFromEvents();
}
async function loadStaticSnapshot(){
 try{const r=await fetch("./live/latest.json",{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);applySnapshot(await r.json(),"snapshot");return true;}catch(err){setConnection("ΧΩΡΙΣ DATA","offline","Δεν βρέθηκε production backend ούτε durable snapshot: "+err.message);return false;}
}
async function fetchSnapshot(){
 const controller=new AbortController();const t=setTimeout(()=>controller.abort(),8000);
 try{
  const r=await fetch(api+"/status/"+encodeURIComponent(project)+"/"+encodeURIComponent(query.get("run")||"latest"),{signal:controller.signal,cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);const data=await r.json();
  if(data.snapshot)applySnapshot(data.snapshot,"backend");
  currentRun=String(data.run_id||currentRun);if(Array.isArray(data.events))ingest(data.events);
  setConnection("PRODUCTION LIVE","online","Plesk backend + WebSocket: "+api+" · run "+currentRun);
  return true;
 }catch(err){await loadStaticSnapshot();return false;}finally{clearTimeout(t);}
}
function stopConnection(){if(socket){socket.onclose=null;try{socket.close()}catch(_){}socket=null;}if(poller){clearInterval(poller);poller=null;}}
function openSocket(){
 try{
  const ws=api.replace(/^http/,"ws")+"/ws/"+encodeURIComponent(project)+"/"+encodeURIComponent(query.get("run")||"latest");
  socket=new WebSocket(ws);
  socket.onopen=()=>setConnection("PRODUCTION LIVE","online","Production WebSocket συνδεδεμένο: "+ws);
  socket.onmessage=m=>{try{const x=JSON.parse(m.data);ingest([x]);}catch(_){}};
  socket.onclose=()=>{liveConnected=false;if(snapshotMeta)setConnection("DURABLE SNAPSHOT","connecting","WebSocket έκλεισε· συνεχίζουμε με πραγματικό snapshot.");};
  socket.onerror=()=>{};
 }catch(_){}
}
async function connect(){
 const candidate=$("api-url").value.trim().replace(/\/$/,"");if(!/^https?:\/\/[^/]+/i.test(candidate)){$("connection-detail").textContent="Χρειάζεται πλήρης διεύθυνση http(s)://server.";return;}
 api=candidate;stopConnection();setConnection("ΣΥΝΔΕΣΗ...","connecting","Έλεγχος production API…");
 const ok=await fetchSnapshot();if(ok)openSocket();poller=setInterval(fetchSnapshot,30000);
}
function prepareRequest(){const target=$("research-target").value.trim(),period=$("research-period").value.trim(),purpose=$("research-purpose").value.trim();if(!target){$("request-feedback").textContent="Συμπλήρωσε το αντικείμενο έρευνας.";return;}const payload={target,aliases:[],date_range:period,purpose,source:"jarvis_command_center_prepared_request"};$("request-json").value=JSON.stringify(payload,null,2);$("copy-feedback").textContent="Δεν έχει υποβληθεί ή εκτελεστεί.";$("request-dialog").showModal();$("request-feedback").textContent="Έτοιμο αίτημα προς αντιγραφή. Δεν ξεκίνησε έρευνα.";}

document.querySelectorAll(".mode").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
document.querySelectorAll(".feed-tab").forEach(b=>b.addEventListener("click",()=>{feedMode=b.dataset.feed;document.querySelectorAll(".feed-tab").forEach(x=>x.classList.toggle("active",x===b));renderFeed();}));
$("reset-map").addEventListener("click",()=>{if(mapLoaded)map.flyTo({center:[15.5,39.5],zoom:4.2,pitch:36,bearing:-7});$("map-focus-label").textContent="Mediterranean basin";selected=null;renderAgents();for(const m of markers.values())m.getElement()?.classList.remove("selected");});
$("toggle-terrain").addEventListener("click",()=>{terrainOn=!terrainOn;$("toggle-terrain").setAttribute("aria-pressed",String(terrainOn));if(mapLoaded&&map.getSource("jarvis-real-dem")){try{map.setTerrain(terrainOn?{source:"jarvis-real-dem",exaggeration:1.2}:null);}catch(e){console.warn(e);}}});
$("prepare-request").addEventListener("click",prepareRequest);$("close-dialog").addEventListener("click",()=>$("request-dialog").close());
$("copy-request").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("request-json").value);$("copy-feedback").textContent="Το JSON αντιγράφηκε. Δεν εκτελέστηκε έρευνα.";}catch(_){$("request-json").select();$("copy-feedback").textContent="Επίλεξε το κείμενο και αντέγραψέ το χειροκίνητα.";}});$("view-decisions").addEventListener("click",()=>setMode("decisions"));$("connect-api").addEventListener("click",connect);$("refresh").addEventListener("click",fetchSnapshot);
$("api-url").value=api;setConnection("ΣΥΝΔΕΣΗ...","connecting","Έλεγχος production backend και durable snapshot…");
createMap();renderAgents();renderFeed();connect();
})();