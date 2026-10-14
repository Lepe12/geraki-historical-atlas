/* JARVIS V4: 3D research universe, source-first and read-only.
   3D geometry uses a real georeferenced Earth texture / archive-city coordinates.
   Animated arcs represent operational research connections, NOT historic voyages.
   No fictitious source, route, event, claim or verification is generated. */
(() => {
"use strict";
const $=id=>document.getElementById(id), app=$("app"), query=new URLSearchParams(location.search);
const API=(query.get("api")||"https://www.piratecartography.com/pct-api/live").replace(/\/$/,"");
const PROJECT=query.get("project")||"piratecartography", RUN=query.get("run")||"latest";
const MOTION=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches===true;
const REFS={
spanish_simancas:{name:"Archivo General de Simancas",place:"Simancas, Spain",lat:41.590,lng:-4.828},
venetian:{name:"Venetian State Archives",place:"Venice, Italy",lat:45.4408,lng:12.3155},
french:{name:"French Archives",place:"Paris, France",lat:48.8566,lng:2.3522},
british:{name:"British Archives",place:"London, United Kingdom",lat:51.5072,lng:-0.1276},
dutch:{name:"Dutch Archives",place:"The Hague, Netherlands",lat:52.0705,lng:4.3007},
german:{name:"German Archives",place:"Berlin, Germany",lat:52.52,lng:13.405},
ottoman:{name:"Ottoman Archives",place:"Istanbul, Türkiye",lat:41.0082,lng:28.9784},
north_african:{name:"North African Archives",place:"Algiers, Algeria",lat:36.7538,lng:3.0588},
italian_states:{name:"Italian States",place:"Rome, Italy (reference location)",lat:41.9028,lng:12.4964}};
const POINTS=Object.entries(REFS).map(([id,a])=>({id,name:a.name,...a,color:"#d8bb7d"}));
const SOURCE_LABEL={live:"PRODUCTION API",snapshot:"DURABLE SNAPSHOT",none:"NO DATA"};
let snapshot=null,events=[],claims=[],blockers=[],agentMap=new Map(),status="none";
let globe=null,flat=null,mode="universe",selected=null,position=0,playing=false,timer=null,facet="blockers";
const e=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const t=s=>String(s??"").replace(/\s+/g," ").trim();
const fmt=s=>{if(!s)return"—";const d=new Date(s);return isNaN(d.getTime())?"—":d.toLocaleString("el-GR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit"})};
const labelFor=id=>agentMap.get(id)?.label||REFS[id]?.name||id?.replaceAll("_"," ")||"JARVIS";
const recordedMetrics=key=>{const n=snapshot?.metrics?.[key];return Number.isFinite(Number(n))&&n!==null&&n!==undefined?String(n):"—"};
function notice(msg){const el=$("notice");el.textContent=msg;el.classList.add("visible");setTimeout(()=>el.classList.remove("visible"),4500);}
function setSource(next){status=next;app.dataset.data=next;const el=$("source-status");el.className="source-status "+next;el.innerHTML="<i></i>"+SOURCE_LABEL[next];}
function hasMilos(){return /\b(milos|melos|milo)\b|μήλος|μηλος/i.test([snapshot?.mission?.target,...(snapshot?.mission?.aliases||[])].join(" "));}
function setMode(next){mode=next;app.dataset.mode=next;for(const name of ["universe","sources","investigate","review"])$("view-"+name).classList.toggle("hidden",next!==name);document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("selected",b.dataset.mode===next));$("agent-dossier").hidden=true;document.body.scrollTop=0;document.documentElement.scrollTop=0;}
function selectAgent(id,fly=true){selected=id;const a=REFS[id];if(!a)return;const agent=agentMap.get(id),related=events.filter(x=>x.agent_id===id),block=blockers.filter(x=>x.agent_id===id);
$("dossier-title").textContent=a.name;$("dossier-region").textContent=a.place+" / modern archival reference location";
$("dossier-status").textContent=agent?.status||"NOT REPORTED";$("dossier-blockers").textContent=agent?.blocker_count??block.length;
$("dossier-events").textContent=related.length;$("dossier-trace").textContent=t(related[related.length-1]?.detail||related[related.length-1]?.phase||"No recorded trace");
$("agent-dossier").hidden=false;
if(fly)focusPoint(a);
}
function focusPoint(p){if(globe){try{globe.pointOfView({lat:p.lat,lng:p.lng,altitude:1.5},MOTION?0:1200)}catch(err){console.warn(err)}}else if(flat){flat.flyTo([p.lat,p.lng],6,{animate:!MOTION})}}
function milosFocus(){focusPoint({lat:36.716,lng:24.433});}
function resizeGlobe(){if(!globe)return;const box=$("planetarium").getBoundingClientRect();globe.width(Math.max(400,box.width));globe.height(Math.max(500,box.height));}
function createUniverse(){const stage=$("globe");const box=$("planetarium").getBoundingClientRect();
if(!window.Globe){fallbackMap("Globe.gl CDN unavailable");return;}
try{
globe=new window.Globe(stage,{rendererConfig:{alpha:true,antialias:true},waitForGlobeReady:false})
  .globeImageUrl("https://unpkg.com/three-globe@2.45.2/example/img/earth-night.jpg")
  .bumpImageUrl("https://unpkg.com/three-globe@2.45.2/example/img/earth-topology.png")
  .backgroundColor("rgba(0,0,0,0)").showAtmosphere(true).atmosphereColor("#64c6cf").atmosphereAltitude(.20)
  .pointsData(POINTS).pointLat("lat").pointLng("lng").pointColor("color").pointRadius(.38).pointAltitude(.025)
  .pointLabel(d=>'<div style="background:#071a24;color:#f2dfad;border:1px solid #d1b580;padding:9px;font:12px Manrope,sans-serif">'+e(d.name)+'<br><small>'+e(d.place)+'</small><br><small>Modern archival reference — not an event</small></div>')
  .onPointClick(d=>selectAgent(d.id)).arcColor("color").arcDashLength(.22).arcDashGap(1.4).arcDashAnimateTime(MOTION?0:2800).arcsTransitionDuration(600)
  .arcsData([]);
globe.width(Math.max(400,box.width)).height(Math.max(500,box.height));
globe.pointOfView({lat:39.2,lng:15.7,altitude:1.83},MOTION?0:2200);
try{globe.controls().autoRotate=false;globe.controls().enableDamping=true;globe.controls().minDistance=135;globe.controls().maxDistance=600;}catch(_){}
window.addEventListener("resize",resizeGlobe);
const canvas=stage.querySelector("canvas");if(!canvas)throw Error("3D render canvas absent");
stage.classList.add("loaded");
}catch(err){console.warn("3D globe rendering unavailable",err);globe=null;fallbackMap(err.message);}
}
function fallbackMap(reason){if(!window.L){$("globe").innerHTML='<div style="color:#e1c18f;padding:25px">Geographic renderer unavailable. '+e(reason)+'</div>';return;}
try{const stage=$("map2d");stage.hidden=false;$("globe").style.display="none";flat=L.map(stage,{zoomControl:false}).setView([39.5,15.4],5);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors",minZoom:2,maxZoom:18}).addTo(flat);
L.control.zoom({position:"bottomright"}).addTo(flat);
POINTS.forEach(p=>{const node=L.divIcon({className:"",html:'<span class="fallback-marker" style="display:block"></span>',iconSize:[17,17],iconAnchor:[8,8]});const m=L.marker([p.lat,p.lng],{icon:node}).addTo(flat);m.bindTooltip(p.name+" · "+p.place);m.on("click",()=>selectAgent(p.id,false));});
app.classList.add("fallback2d");}catch(err){console.warn("Flat-map fallback unavailable",err);}
}
function setFlow(agentId){if(!globe)return;const ref=REFS[agentId];if(!ref||!hasMilos()){globe.arcsData([]);return;}
globe.arcsData([{startLat:ref.lat,startLng:ref.lng,endLat:36.716,endLng:24.433,color:["#efcd8e","#68e5d4"],label:"RESEARCH OPERATIONS ONLY — NOT HISTORICAL ROUTE"}]);}
function stop(){playing=false;if(timer!==null){clearInterval(timer);timer=null;}$("play").textContent="▶";$("play").setAttribute("aria-label","Αναπαραγωγή");}
function showEvent(i,focus=false){if(!events.length)return;position=Math.max(0,Math.min(events.length-1,i));const item=events[position],id=item.agent_id;
$("scrub").value=String(position);$("playback-n").textContent=(position+1)+" / "+events.length;
$("deck-date").textContent=fmt(item.created_utc);
$("trace-agent").textContent=labelFor(id);
$("trace-detail").textContent=t(item.detail||item.phase||item.event_type||"Research event");
$("trace-time").textContent=fmt(item.created_utc);
$("trace-phase").textContent=t(item.phase||"RESEARCH").slice(0,55).toUpperCase();
$("trace-type").textContent=t(item.event_type||"EVENT").toUpperCase();
$("investigate-agent").textContent=labelFor(id);
$("investigate-detail").textContent=t(item.detail||item.event_type||"Recorded operational event.");
$("investigate-meta").innerHTML=[["EVENT TYPE",item.event_type],["PHASE",item.phase],["AGENT ID",item.agent_id],["EVENT TIME",fmt(item.created_utc)],["STATUS",item.status]].map(([k,v])=>'<span>'+e(k)+'</span><span>'+e(v??"—")+'</span>').join("");
setFlow(id);if(focus&&REFS[id])focusPoint(REFS[id]);
}
function playPause(){if(playing){stop();return;}if(!events.length){notice("Δεν υπάρχουν καταγεγραμμένα συμβάντα.");return;}if(position>=events.length-1)position=0;playing=true;$("play").textContent="Ⅱ";$("play").setAttribute("aria-label","Παύση");showEvent(position,true);timer=setInterval(()=>{if(position>=events.length-1){stop();return;}showEvent(position+1,((position+1)%9===0));},MOTION?1100:850);}
function applySnapshot(s,origin){if(!s||s.schema!=="pct-command-center-live-v1")throw Error("Unsupported JARVIS snapshot");const changed=s.run_id!==snapshot?.run_id;
snapshot=s;events=Array.isArray(s.events)?s.events.slice().sort((a,b)=>String(a.created_utc||"").localeCompare(String(b.created_utc||""))):[];
claims=Array.isArray(s.claims)?s.claims:[];blockers=Array.isArray(s.blockers)?s.blockers:[];
agentMap=new Map((Array.isArray(s.agents)?s.agents:[]).map(a=>[a.id,a]));
$("mission-name").textContent=t(s.mission?.target||"Unspecified research")||"—";$("mission-period").textContent=t(s.mission?.date_range||"Period not specified");
$("mission-state").textContent="RUN "+t(s.run_id)+" · "+t(s.mission?.status||"UNKNOWN");$("metric-discoveries").textContent=recordedMetrics("specialist_discovery_records");
$("metric-claims").textContent=recordedMetrics("candidate_claims");$("metric-verified").textContent=recordedMetrics("verified_events");
$("metric-blockers").textContent=recordedMetrics("blocker_records");
$("review-message").textContent=claims.length?claims.length+" claims require original inspection, genealogy, contradiction evaluation and human authorization.":"Το καταγεγραμμένο run περιλαμβάνει "+events.length+" ερευνητικά συμβάντα αλλά κανέναν υποψήφιο ιστορικό ισχυρισμό προς έγκριση.";
$("scrub").max=String(Math.max(events.length-1,0));$("play").disabled=events.length===0;$("forward").disabled=events.length===0;$("rewind").disabled=events.length===0;
if(changed){stop();position=0;}
if(events.length)showEvent(position);else {$("playback-n").textContent="0 / 0";$("trace-detail").textContent="Χωρίς πραγματικές καταγεγραμμένες ενέργειες.";}
renderRecords();renderActions();if(selected)selectAgent(selected,false);setSource(origin);
}
async function load(){const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),8000);let ok=false;
try{const u=API+"/status/"+encodeURIComponent(PROJECT)+"/"+encodeURIComponent(RUN);const r=await fetch(u,{cache:"no-store",signal:controller.signal});if(!r.ok)throw Error("API HTTP "+r.status);const a=await r.json();if(a.snapshot){applySnapshot(a.snapshot,"live");ok=true;}else if(a.schema==="pct-command-center-live-v1"){applySnapshot(a,"live");ok=true;}else throw Error("API has no compatible snapshot");}catch(err){console.warn("Production read failed:",err.message)}finally{clearTimeout(deadline)}
if(!ok){try{const r=await fetch("../command-center/live/latest.json",{cache:"no-store"});if(!r.ok)throw Error("snapshot HTTP "+r.status);applySnapshot(await r.json(),"snapshot");}catch(err){console.error("Snapshot unavailable",err);setSource("none");$("mission-state").textContent="Αδυναμία ανάκτησης δεδομένων";}}
}
function renderRecords(){const list=$("archive-records"),q=$("archive-search").value.trim().toLowerCase(),all=facet==="blockers"?blockers:facet==="events"?events:claims;
const values=all.map((item,i)=>({item,i})).filter(o=>!q||JSON.stringify(o.item).toLowerCase().includes(q)).slice(0,180);
$("archive-total").textContent=values.length+" / "+all.length;
list.innerHTML=values.length?values.map(({item,i})=>{const title=facet==="blockers"?item.repository||item.agent_id||"Access blocker":facet==="events"?labelFor(item.agent_id):item.title||item.candidate_id||"Candidate claim";
const sub=facet==="blockers"?[item.agent_id,item.status].filter(Boolean).join(" · "):facet==="events"?[item.event_type,item.phase,fmt(item.created_utc)].filter(Boolean).join(" · "):[item.lane,item.source_type,item.evidence_state].filter(Boolean).join(" · ");
return '<button type="button" class="record" data-record="'+i+'"><span class="record-symbol">'+(facet==="blockers"?"⌁":facet==="events"?"◷":"◇")+'</span><span><b>'+e(title)+'</b><small>'+e(sub)+'</small></span></button>'}).join(""):'<div class="record"><span class="record-symbol">◇</span><span><b>Δεν υπάρχουν σχετικές εγγραφές.</b><small>Δεν δημιουργούμε εικονικά ιστορικά τεκμήρια.</small></span></div>';
list.querySelectorAll("[data-record]").forEach(b=>b.addEventListener("click",()=>{const o=all[Number(b.dataset.record)];if(o){showRecord(o);list.querySelectorAll("[data-record]").forEach(x=>x.classList.toggle("selected",x===b));}}));
}
function showRecord(o){const title=o.repository||o.agent_id||o.title||o.candidate_id||o.event_type||"Research record";const fields=Object.entries(o).filter(([,v])=>typeof v==="string"||typeof v==="number"||typeof v==="boolean").slice(0,24);
$("reader-content").className="reader-content details";
$("reader-content").innerHTML='<span class="micro">ACTUAL '+e(facet.toUpperCase())+' RECORD · READ ONLY</span><h3>'+e(title)+'</h3>'+fields.map(([k,v])=>'<div class="record-field"><b>'+e(k.replaceAll("_"," "))+'</b><span>'+e(v)+'</span></div>').join("");
$("reader-footer").textContent=facet==="blockers"?"ACCESS BLOCKER ≠ HISTORICAL EVIDENCE":facet==="events"?"AGENT OPERATION ≠ HISTORICAL EVENT":"CLAIM CANDIDATE ≠ HUMAN VERIFIED";
if(facet==="events"){const i=events.indexOf(o);if(i>=0){stop();showEvent(i,false);}}
}
function renderActions(){const select=$("agent-filter"),val=select.value;const ids=[...new Set(events.map(a=>a.agent_id).filter(Boolean))].sort();
select.innerHTML='<option value="">Όλοι οι agents</option>'+ids.map(id=>'<option value="'+e(id)+'">'+e(labelFor(id))+'</option>').join("");if(ids.includes(val))select.value=val;
const filtered=events.map((item,i)=>({item,i})).filter(o=>!select.value||o.item.agent_id===select.value).slice(-220).reverse();
$("action-count").textContent=filtered.length+" LOG ENTRIES";
$("action-records").innerHTML=filtered.length?filtered.map(({item,i})=>'<button class="record" data-action="'+i+'"><span class="record-symbol">◷</span><span><b>'+e(labelFor(item.agent_id))+'</b><small>'+e(item.event_type||item.phase||"RESEARCH")+'</small><small>'+e(fmt(item.created_utc))+'</small></span></button>').join(""):'<div class="record">Δεν υπάρχουν καταγεγραμμένα συμβάντα.</div>';
document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>{const i=Number(b.dataset.action);stop();showEvent(i,false);document.querySelectorAll("[data-action]").forEach(x=>x.classList.toggle("selected",x===b));}));
}
function prepareMission(){const target=$("mission-target").value.trim(),dates=$("mission-dates").value.trim(),purpose=$("mission-purpose").value.trim();if(!target){$("mission-target").focus();return;}const draft={status:"DRAFT_NOT_DISPATCHED",target,date_range:dates,purpose,aliases:[],source:"jarvis_v4_preview_composer"};$("prepared-request").textContent=JSON.stringify(draft,null,2);$("prepared-request").hidden=false;$("copy-request").hidden=false;}
function bind(){document.querySelectorAll(".top-nav button").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
$("journey").addEventListener("click",()=>{if(events.length){showEvent(0,true);if(!playing)playPause();}else $("mission-editor").showModal();});
$("focus-milos").addEventListener("click",milosFocus);$("close-dossier").addEventListener("click",()=>$("agent-dossier").hidden=true);
$("inspect-agent").addEventListener("click",()=>{$("agent-filter").value=selected||"";setMode("investigate");renderActions();});
$("rewind").addEventListener("click",()=>{stop();showEvent(0,true)});
$("play").addEventListener("click",playPause);
$("forward").addEventListener("click",()=>{stop();showEvent(position+1,true)});
$("scrub").addEventListener("input",a=>{stop();showEvent(Number(a.target.value),true)});
$("go-dossier").addEventListener("click",()=>{setMode("investigate");renderActions();});
$("investigate-globe").addEventListener("click",()=>{setMode("universe");if(events[position]?.agent_id&&REFS[events[position].agent_id])focusPoint(REFS[events[position].agent_id]);});
document.querySelectorAll("[data-facet]").forEach(b=>b.addEventListener("click",()=>{facet=b.dataset.facet;document.querySelectorAll("[data-facet]").forEach(n=>n.classList.toggle("selected",n===b));renderRecords();}));
$("archive-search").addEventListener("input",renderRecords);$("agent-filter").addEventListener("change",renderActions);
$("close-editor").addEventListener("click",()=>$("mission-editor").close());$("prepare").addEventListener("click",prepareMission);
$("copy-request").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("prepared-request").textContent);notice("Αντιγράφηκε — η έρευνα δεν υποβλήθηκε.");}catch(err){notice("Αντιγραφή μη διαθέσιμη σε αυτό το πρόγραμμα περιήγησης.");}});
document.addEventListener("keydown",evt=>{if(evt.key==="Escape")$("agent-dossier").hidden=true;});
}
bind();setSource("none");createUniverse();load();
})();