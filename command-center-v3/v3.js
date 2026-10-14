(() => {
"use strict";
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const api=(params.get("api")||"https://www.piratecartography.com/pct-api/live").replace(/\/$/,"");
const project=params.get("project")||"piratecartography";
const run=params.get("run")||"latest";
const coords={
spanish_simancas:{label:"Simancas",place:"Simancas · Ισπανία",p:[-4.828,41.590]},
venetian:{label:"Venice",place:"Βενετία · Ιταλία",p:[12.3155,45.4408]},
french:{label:"French Archives",place:"Παρίσι · Γαλλία",p:[2.3522,48.8566]},
british:{label:"British Archives",place:"Λονδίνο · Ηνωμένο Βασίλειο",p:[-0.1276,51.5072]},
dutch:{label:"Dutch Archives",place:"Χάγη · Κάτω Χώρες",p:[4.3007,52.0705]},
german:{label:"German Archives",place:"Βερολίνο · Γερμανία",p:[13.405,52.52]},
ottoman:{label:"Ottoman Archives",place:"Κωνσταντινούπολη · Τουρκία",p:[28.9784,41.0082]},
north_african:{label:"North African",place:"Αλγέρι · Αλγερία",p:[3.0588,36.7538]},
italian_states:{label:"Italian States",place:"Ρώμη · Ιταλία (πόλη αναφοράς)",p:[12.4964,41.9028]}};
let map,loaded=false,reliefEnabled=true,archivesVisible=true,markers=[],snapshot=null,events=[],claims=[],blockers=[],feedSource="none",realApiConnected=false,selectedView="world",focusAgent=null,poll=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const time=s=>{if(!s)return "—";const d=new Date(s);return isNaN(d.getTime())?"—":d.toLocaleString("el-GR",{dateStyle:"short",timeStyle:"short"})};
const dataObject=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const localSnapshot="../command-center/live/latest.json";
function setPresence(k,msg){$("presence").className="presence "+k;$("presence").innerHTML='<span class="status-light"></span>'+esc(msg);$("core-message").textContent=k==="live"?"CONNECTED / RESEARCH CORE":k==="snapshot"?"DURABLE DATA / READ-ONLY":k==="offline"?"OFFLINE / STANDBY":"CONNECTING…";}
function enter(){const a=$("arrival");a.classList.add("closed");setTimeout(()=>a.hidden=true,750);if(map)map.resize();}
function changeView(v){selectedView=v;for(const x of ["world","evidence","timeline","review"])$("view-"+x).classList.toggle("hidden",x!==v);document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("chosen",b.dataset.view===v));$("mission-dock").hidden=true;$("context-dock").hidden=true;if(map)requestAnimationFrame(()=>map.resize());window.dispatchEvent(new CustomEvent("pct:view-change",{detail:{view:v}}));}
function showMission(){changeView("world");$("mission-dock").hidden=false;$("target").focus();}
function showContext(a,id){focusAgent=id;changeView("world");$("context-name").textContent=a.label;$("context-place").textContent=a.place;$("context-note").textContent="Πραγματική θέση πόλης αναφοράς ενός αρχειακού ή ερευνητικού πεδίου. Δεν αποτελεί τεκμήριο ότι συνέβη εδώ πειρατική επιδρομή.";$("context-agent").textContent="Agent: "+id+" · "+agentStatus(id);$("context-dock").hidden=false;if(map&&a.p)map.flyTo({center:a.p,zoom:6.1,pitch:44,bearing:-8,duration:matchMedia("(prefers-reduced-motion: reduce)").matches?0:1000});}
function agentStatus(id){const d=(snapshot?.agents||[]).find(a=>a.id===id);return d?String(d.status||"NOT REPORTED"):"NO DATA";}
let flatMap=null;
function useFlatMap(reason){
 console.warn("3D terrain not available; activating real OSM/Leaflet map:",reason);
 if(!window.L){$("map-error").hidden=false;return;}
 try{if(map?.remove){try{map.remove()}catch(_){}}$("map").replaceChildren();
 flatMap=L.map("map",{zoomControl:false,preferCanvas:true}).setView([38.8,16.5],5);
 L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{minZoom:2,maxZoom:18,attribution:"© OpenStreetMap contributors"}).addTo(flatMap);
 L.control.zoom({position:"bottomright"}).addTo(flatMap);
 map={isStyleLoaded:()=>false,getSource:()=>null,getLayer:()=>false,resize:()=>flatMap.invalidateSize(),flyTo:({center,zoom})=>flatMap.flyTo([center[1],center[0]],zoom||5),easeTo:({center,zoom})=>flatMap.flyTo([center[1],center[0]],zoom||5)};
 loaded=true;document.body.classList.add("flat-map-mode");$("map-error").hidden=true;
 addMarkers();window.dispatchEvent(new CustomEvent("pct:map-ready",{detail:{map}}));
 }catch(e){console.error("Geographic fallback failed",e);$("map-error").hidden=false;}
}
function createMap(){
 if(!window.maplibregl){useFlatMap("MapLibre unavailable");return;}
 try{map=new maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/liberty",center:[16.5,38.8],zoom:4.35,pitch:45,bearing:-12,antialias:true,maxPitch:65,attributionControl:true});
 map.on("load",()=>{loaded=true;styleMap();addMarkers();$("map-error").hidden=true;window.dispatchEvent(new CustomEvent("pct:map-ready",{detail:{map}}));});
 map.on("error",err=>{console.warn("MapLibre:",err.error||err);if(!loaded)useFlatMap(err.error?.message||"Map style unavailable");});
 }catch(e){useFlatMap(e.message||"WebGL unavailable")}
}
function styleMap(){const style=map.getStyle();for(const l of (style.layers||[])){const id=l.id.toLowerCase();try{
if(l.type==="symbol"&&/road|highway|street|poi|housenumber|transit|railway|aeroway/.test(id)){map.setLayoutProperty(l.id,"visibility","none");continue;}
if(l.type==="background"){map.setPaintProperty(l.id,"background-color","#0d202a");continue;}
if(l.type==="fill"){if(/water|ocean|sea|lake/.test(id))map.setPaintProperty(l.id,"fill-color","#092b38");else if(/land|landcover|earth/.test(id))map.setPaintProperty(l.id,"fill-color","#354946");else if(/forest|wood|grass|park/.test(id))map.setPaintProperty(l.id,"fill-color","#496653");}
if(l.type==="line"){if(/coast|shore/.test(id))map.setPaintProperty(l.id,"line-color","#d0b77e");else if(/river|water/.test(id))map.setPaintProperty(l.id,"line-color","#1d6677");}
}catch(_){}}try{map.addSource("real-relief",{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],tileSize:256,maxzoom:14,encoding:"terrarium",attribution:"Terrain: AWS Terrain Tiles"});map.addLayer({id:"real-hillshade",type:"hillshade",source:"real-relief",paint:{"hillshade-shadow-color":"#082026","hillshade-highlight-color":"#dbc995","hillshade-accent-color":"#234742","hillshade-exaggeration":0.65}});map.setTerrain({source:"real-relief",exaggeration:1.18});}catch(e){console.warn("Relief unavailable:",e)}}
function addMarkers(){
 markers.forEach(x=>{try{x.marker.remove()}catch(_){}});markers=[];
 for(const [id,a] of Object.entries(coords)){
  if(flatMap){
   const node='<button type="button" class="archive-node" aria-label="'+esc(a.label)+" "+esc(a.place)+'"></button>';
   const icon=L.divIcon({className:"pct-leaflet-node",html:node,iconSize:[21,21],iconAnchor:[10,10]});
   const marker=L.marker([a.p[1],a.p[0]],{icon,keyboard:true}).addTo(flatMap);
   marker.on("click",()=>showContext(a,id));
   marker.bindTooltip(esc(a.label)+" · "+esc(a.place)+" (πόλη αναφοράς)",{direction:"top"});
   markers.push({id,marker});continue;
  }
  const node=document.createElement("button");node.type="button";node.className="archive-node";
  node.title=a.label+" — "+a.place;node.setAttribute("aria-label",a.label+" — "+a.place);node.addEventListener("click",()=>showContext(a,id));
  const popup=new maplibregl.Popup({offset:17,closeButton:false}).setHTML("<b>"+esc(a.label)+"</b><br>"+esc(a.place)+"<br><small>Πόλη αναφοράς αρχείου — όχι ιστορικό συμβάν</small>");
  node.addEventListener("mouseenter",()=>popup.setLngLat(a.p).addTo(map));
  node.addEventListener("mouseleave",()=>popup.remove());
  let marker=new maplibregl.Marker({element:node,anchor:"center"}).setLngLat(a.p).addTo(map);markers.push({id,marker});
 }updateMarkerStatus();
}
function updateMarkerStatus(){
 for(const {id,marker} of markers){
  const root=marker.getElement(),node=root?.querySelector(".archive-node")||root;
  if(!node)continue;
  const st=agentStatus(id).toUpperCase();node.classList.toggle("active",realApiConnected&&st==="RUNNING");root.hidden=!archivesVisible;
 }
}
function renderMetrics(){const m=dataObject(snapshot?.metrics);const num=(k,fallback)=>Number.isFinite(Number(m[k]))?String(m[k]):fallback;
$("claim-count").textContent=num("candidate_claims",claims.length?String(claims.length):"—");
$("verified-count").textContent=num("verified_events","—");
$("blocker-count").textContent=num("blocker_records",blockers.length?String(blockers.length):"—");
$("mission-indicator").textContent="ΑΠΟΣΤΟΛΗ: "+String(snapshot?.mission?.target||"—");
$("run-indicator").textContent="RUN "+String(snapshot?.run_id||"—");
$("review-title").textContent=claims.length?"Υποψήφιοι ισχυρισμοί: απαιτείται ανθρώπινος έλεγχος.":"Δεν υπάρχουν διαθέσιμοι υποψήφιοι ισχυρισμοί προς έγκριση.";
$("review-message").textContent="Πηγή: "+(feedSource==="api"?"production API":"durable snapshot")+". Καμία έγκριση δεν είναι διαθέσιμη από αυτή την προεπισκόπηση. Απαιτούνται ελεγμένη πρωτογενής τεκμηρίωση, ανεξάρτητες πηγές, καταγραφή αντιφάσεων και εξουσιοδοτημένο audit.";
}
function evidenceItems(){return claims.slice(0,90).map((c,i)=>({kind:"claim",i,name:c.title||c.candidate_id||"Candidate claim",sub:[c.lane,c.source_type,c.evidence_state].filter(Boolean).join(" · "),record:c}));}
function renderEvidence(){const items=evidenceItems();const term=$("evidence-search").value.toLowerCase().trim();const matches=items.filter(x=>!term||JSON.stringify(x.record).toLowerCase().includes(term));$("evidence-count").textContent=items.length?"CANDIDATES "+items.length:"NO CANDIDATES";
$("evidence-list").innerHTML=matches.length?matches.map(x=>'<button type="button" class="source-card" data-claim="'+x.i+'"><span class="source-icon">▧</span><span><b>'+esc(x.name)+'</b><small>'+esc(x.sub||"Candidate — review required")+'</small></span></button>').join(""):'<div class="source-card"><span class="source-icon">◇</span><span><b>Δεν υπάρχουν υποψήφιοι ισχυρισμοί'+(term?" που να ταιριάζουν":"")+'</b><small>Τα καταγεγραμμένα discovery records και τα blockers δεν μετατρέπονται αυτόματα σε ιστορικά τεκμήρια.</small></span></div>';
document.querySelectorAll("[data-claim]").forEach(b=>b.addEventListener("click",()=>showClaim(Number(b.dataset.claim))));
if(!items.length){$("document-view").classList.remove("reading-details");$("document-view").innerHTML='<div class="manuscript-mark">✧</div><h3>Ο ερευνητής προηγείται του συμπεράσματος.</h3><p>Δεν έχουν καταγραφεί υποψήφιοι ισχυρισμοί σε αυτό το run. Δεν θα γεμίσουμε τη βιβλιοθήκη με επινοημένα χειρόγραφα.</p>';$("citation-strip").textContent="Αναγνωρισμένες εγγραφές ανακάλυψης: "+(Number.isFinite(Number(snapshot?.metrics?.specialist_discovery_records))?snapshot.metrics.specialist_discovery_records:"—")+" · Δεν ισοδυναμούν με αυτοψία τεκμηρίων.";}
}
function showClaim(i){const c=claims[i];if(!c)return;document.querySelectorAll("[data-claim]").forEach(b=>b.classList.toggle("active",Number(b.dataset.claim)===i));$("document-view").classList.add("reading-details");const fields=[["Κατάσταση",c.verified?"VERIFIED (backend record)":"CANDIDATE / UNVERIFIED"],["Αρχειακή ένδειξη",c.signatura||c.reference||c.archive_reference||"Δεν καταγράφηκε"],["Αυτοψία πρωτοτύπου",c.original_inspected?"Καταγεγραμμένη":"Δεν τεκμηριώνεται"],["Πηγή / τύπος",c.source_type||"Άγνωστο"],["Γεωγραφικό ή θεματικό πεδίο",c.lane||"Δεν καταγράφηκε"]];$("document-view").innerHTML='<div class="eyebrow">ACTUAL RECORDED CANDIDATE</div><h3>'+esc(c.title||c.candidate_id||"Candidate claim")+'</h3>'+fields.map(([a,b])=>'<p><b>'+esc(a)+':</b> <span class="value">'+esc(b)+'</span></p>').join("")+(typeof c.url==="string"&&/^https:\/\//.test(c.url)?'<a href="'+esc(c.url)+'" target="_blank" rel="noopener noreferrer">ΑΝΟΙΓΜΑ ΠΗΓΗΣ ↗</a>':"");$("citation-strip").textContent="Δεν υποκαθιστούμε την αυτοψία πρωτοτύπου ή τον έλεγχο ανεξαρτησίας των πηγών.";}
function renderTimeline(){const arr=events.slice(-150).reverse();$("event-count").textContent=arr.length+" ENTRIES";$("event-list").innerHTML=arr.length?arr.map(e=>'<div class="source-card"><span class="source-icon">◷</span><span><b>'+esc(e.agent_id||e.event_type||"JARVIS")+'</b><small>'+esc([e.phase,e.event_type,e.status].filter(Boolean).join(" · "))+'</small><small>'+esc(time(e.created_utc))+'</small></span></div>').join(""):'<div class="source-card">Χωρίς συμβάντα στο τρέχον run.</div>';}
function snapshotPayload(s,from){if(!s||s.schema!=="pct-command-center-live-v1")throw new Error("Invalid JARVIS snapshot schema");snapshot=s;events=Array.isArray(s.events)?s.events.slice(-600):[];claims=Array.isArray(s.claims)?s.claims:[];blockers=Array.isArray(s.blockers)?s.blockers:[];feedSource=from;$("target").value=String(s.mission?.target||"");$("dates").value=String(s.mission?.date_range||"");$("purpose").value=String(s.mission?.purpose||"");renderMetrics();renderEvidence();renderTimeline();updateMarkerStatus();window.dispatchEvent(new CustomEvent("pct:snapshot",{detail:{snapshot:s,source:from}}));}
async function connect(){setPresence("pending","ΑΝΑΚΤΗΣΗ");let ok=false;const c=new AbortController();const timer=setTimeout(()=>c.abort(),8000);try{const r=await fetch(api+"/status/"+encodeURIComponent(project)+"/"+encodeURIComponent(run),{signal:c.signal,cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);const obj=await r.json();if(obj.snapshot){snapshotPayload(obj.snapshot,"api");}else if(Array.isArray(obj.events)){events=obj.events;snapshotPayload({schema:"pct-command-center-live-v1",project,run_id:obj.run_id,events:obj.events,metrics:{},claims:[],blockers:[]},"api");}else throw new Error("Unsupported API response");realApiConnected=true;setPresence("live","API CONNECTED");ok=true;}catch(e){console.warn("API:",e.message)}finally{clearTimeout(timer)}
if(!ok){realApiConnected=false;try{const r=await fetch(localSnapshot,{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);snapshotPayload(await r.json(),"snapshot");setPresence("snapshot","DURABLE SNAPSHOT");}catch(e){setPresence("offline","NO DATA");$("mission-indicator").textContent="ΑΠΟΣΤΟΛΗ: ΚΑΜΙΑ";}}
if(ok){try{const ws=new WebSocket(api.replace(/^http/,"ws")+"/ws/"+encodeURIComponent(project)+"/"+encodeURIComponent(run));ws.onmessage=e=>{try{const data=JSON.parse(e.data);if(data.snapshot)snapshotPayload(data.snapshot,"api");else if(data.event_type){events.push(data);if(events.length>600)events.shift();renderTimeline();window.dispatchEvent(new CustomEvent("pct:event",{detail:{event:data}}));}}catch(_){}};ws.onerror=()=>{};ws.onclose=()=>{realApiConnected=false;setPresence(snapshot?"snapshot":"offline",snapshot?"LAST AVAILABLE DATA":"DISCONNECTED");updateMarkerStatus();};}catch(_){}}}
function prepare(){const target=$("target").value.trim();if(!target){$("target").focus();return;}const req={target,aliases:[],date_range:$("dates").value.trim(),purpose:$("purpose").value.trim(),source:"jarvis_v3_prepared_request",status:"DRAFT_NOT_DISPATCHED"};$("draft-json").value=JSON.stringify(req,null,2);$("copy-result").textContent="Δεν πραγματοποιήθηκε εκτέλεση.";$("draft-dialog").showModal();}
function bind(){document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{enter();changeView(b.dataset.view)}));$("enter").addEventListener("click",enter);$("skip").addEventListener("click",enter);$("start-mission").addEventListener("click",showMission);$("close-mission").addEventListener("click",()=>$("mission-dock").hidden=true);$("close-context").addEventListener("click",()=>$("context-dock").hidden=true);$("show-evidence").addEventListener("click",()=>changeView("evidence"));$("timeline-to-map").addEventListener("click",()=>changeView("world"));$("context-agents").addEventListener("click",()=>{changeView("evidence");});$("reset").addEventListener("click",()=>{if(loaded)map.flyTo({center:[16.5,38.8],zoom:4.35,pitch:45,bearing:-12,duration:matchMedia("(prefers-reduced-motion: reduce)").matches?0:950});$("context-dock").hidden=true;});$("relief").addEventListener("click",()=>{reliefEnabled=!reliefEnabled;$("relief").setAttribute("aria-pressed",String(reliefEnabled));if(loaded&&map.getSource("real-relief"))try{map.setTerrain(reliefEnabled?{source:"real-relief",exaggeration:1.18}:null);map.setLayoutProperty("real-hillshade","visibility",reliefEnabled?"visible":"none");}catch(_){}});$("archives").addEventListener("click",()=>{archivesVisible=!archivesVisible;$("archives").setAttribute("aria-pressed",String(archivesVisible));updateMarkerStatus()});$("open-operations").addEventListener("click",()=>location.href="../command-center/");$("prepare").addEventListener("click",prepare);$("close-draft").addEventListener("click",()=>$("draft-dialog").close());$("copy-draft").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("draft-json").value);$("copy-result").textContent="Το προσχέδιο αντιγράφηκε. Δεν υποβλήθηκε."}catch(_){$("draft-json").select();$("copy-result").textContent="Επίλεξε και αντέγραψε το JSON χειροκίνητα."}});$("help").addEventListener("click",()=>$("info-dialog").showModal());$("close-info").addEventListener("click",()=>$("info-dialog").close());$("evidence-search").addEventListener("input",renderEvidence);document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!(document.querySelector("dialog[open]"))){$("mission-dock").hidden=true;$("context-dock").hidden=true;}});}
window.PCT_V3={getMap:()=>map,changeView,showContext,getSnapshot:()=>snapshot,getEvents:()=>events.slice(),focusAgent:id=>{const a=coords[id];if(a)showContext(a,id)},getCoords:()=>coords,renderEvidence,renderTimeline};
bind();createMap();setPresence("pending","ΑΝΑΚΤΗΣΗ");connect();
})();