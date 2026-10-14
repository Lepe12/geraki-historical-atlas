/* Piratecartography V3 — Research Theater. Data-driven operational replay.
   This visualization represents recorded research activity, NOT historical routes.
   No demo events or fabricated evidence are produced here. */
(() => {
"use strict";
const $=id=>document.getElementById(id), pct=window.PCT_V3;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const asText=s=>String(s??"").replace(/\s+/g," ").trim();
const originalView=$("document-view")?.innerHTML||"";
let data=null, events=[], position=0, playing=false, ticker=null, map=null;
let filter="claims", selectedAgent=null, originalCount=0, routeVisible=false, lastFocusedEvent=-1;
const agentsById=new Map();
const coords=pct?.getCoords?.()||{};
const isReduceMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const btn=id=>$(id);
function formatTime(iso){if(!iso)return "—";const d=new Date(iso);return Number.isNaN(d.valueOf())?"—":d.toLocaleString("el-GR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit"});}
function labelFor(id){return agentsById.get(id)?.label||coords[id]?.label||id?.replaceAll("_"," ")||"JARVIS";}
function clearTimer(){if(ticker!==null){clearInterval(ticker);ticker=null;}}
function pause(){playing=false;clearTimer();btn("theater-play").textContent="▶";btn("theater-play").setAttribute("aria-label","Αναπαραγωγή καταγεγραμμένων εργασιών");document.body.classList.remove("research-playing");}
function play(){if(!events.length)return;if(playing){pause();return;}if(position>=events.length-1)position=0;playing=true;btn("theater-play").textContent="Ⅱ";btn("theater-play").setAttribute("aria-label","Παύση αναπαραγωγής");document.body.classList.add("research-playing");ticker=setInterval(()=>{if(position>=events.length-1){pause();return;}advance(position+1);},isReduceMotion?1100:600);}
function advance(i,opts={}){if(!events.length)return;position=Math.max(0,Math.min(events.length-1,i));const e=events[position];const id=e.agent_id;
btn("theater-seek").value=String(position);
btn("theater-step").textContent=(position+1)+" / "+events.length+" REAL EVENTS";
btn("theater-time").textContent=formatTime(e.created_utc);
btn("theater-agent").textContent=labelFor(id);
btn("theater-event").textContent=asText(e.detail||e.event_type||e.phase||"Καταγεγραμμένο συμβάν έρευνας.");
btn("theater-phase").textContent=asText(e.event_type||e.phase||"LOG EVENT").toUpperCase();
btn("theater-core-phase").textContent=asText(e.phase||e.event_type||"RESEARCH TRACE").toUpperCase().slice(0,50);
btn("theater-inspect").disabled=!(id&&coords[id]);
selectedAgent=id||null;
const current=coords[id];
updateLine(current?.p||null);
updateMarkers(id);
if(opts.focus&&current?.p&&map){map.easeTo({center:current.p,zoom:5.7,pitch:50,duration:isReduceMotion?0:1250});}
}
function updateMarkers(id){document.querySelectorAll(".archive-node").forEach(el=>el.classList.remove("theater-active"));const active=(id&&coords[id])?Object.keys(coords).indexOf(id):-1;const arr=[...document.querySelectorAll(".archive-node")];if(active>=0&&arr[active])arr[active].classList.add("theater-active");}
function targetCoordinates(){const target=String(data?.mission?.target||"").toLowerCase();const variants=(data?.mission?.aliases||[]).map(s=>String(s).toLowerCase());if(/milos|melos|milo|μήλος|μηλος/.test(target)||variants.some(x=>/milos|melos|milo|μήλος|μηλος/.test(x)))return [24.433,36.716];return null;}
function setupLine(){map=pct?.getMap?.()||map;if(!map||!map.isStyleLoaded())return false;
try{if(!map.getSource("pct-research-flow"))map.addSource("pct-research-flow",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
if(!map.getLayer("pct-research-flow-glow"))map.addLayer({id:"pct-research-flow-glow",type:"line",source:"pct-research-flow",layout:{"line-cap":"round"},paint:{"line-color":"#d9b877","line-width":8,"line-blur":7,"line-opacity":0.40}});
if(!map.getLayer("pct-research-flow-line"))map.addLayer({id:"pct-research-flow-line",type:"line",source:"pct-research-flow",paint:{"line-color":"#e0c18a","line-width":2.1,"line-dasharray":[1,2],"line-opacity":0.94}});
return true;}catch(e){console.warn("Research flow layer could not be added",e);return false;}}
function updateLine(from){if(!setupLine())return;const t=targetCoordinates();const f=from&&t? [{type:"Feature",properties:{kind:"RESEARCH_WORKFLOW_NOT_HISTORICAL_ROUTE"},geometry:{type:"LineString",coordinates:[from,t]}}]:[];try{map.getSource("pct-research-flow").setData({type:"FeatureCollection",features:f});routeVisible=!!f.length;}catch(_){}}
function renderIntro(){if(!data)return;const m=data.mission||{},target=asText(m.target||"Έρευνα"),range=asText(m.date_range||"");
const isMilos=!!targetCoordinates();const headline=isMilos?"Μήλος.":"Έρευνα.";btn("theater-headline").innerHTML=esc(headline)+'<br><em>'+esc(range||"Ένα νέο ερευνητικό πεδίο.")+'</em>';
btn("theater-subhead").textContent=isMilos?"Η Μεσόγειος μετατρέπεται σε χώρο εξερεύνησης του πραγματικού αρχείου εργασιών για τη Μήλο. Άνοιξε τα τεκμήρια και δες τι τεκμηριώθηκε — και τι όχι.":"Το τελευταίο καταγεγραμμένο ερευνητικό run. Οι πράξεις των agents απεικονίζονται διακριτά από ιστορικά γεγονότα.";
btn("theater-run-label").textContent="RUN "+asText(data.run_id||"—");
btn("theater-replay-warning").textContent="REPLAY / "+events.length+" καταγεγραμμένα συμβάντα · όχι ζωντανή έρευνα";
}
function renderInfo(){if(!data||!events.length){btn("theater-step").textContent="NO RECORDED EVENTS";btn("theater-seek").disabled=true;btn("theater-play").disabled=true;btn("theater-next").disabled=true;btn("theater-rewind").disabled=true;btn("theater-event").textContent="Δεν έχουν φορτωθεί καταγεγραμμένα συμβάντα. Κανένα προσομοιωμένο εύρημα.";return;}
btn("theater-seek").disabled=false;btn("theater-play").disabled=false;btn("theater-next").disabled=false;btn("theater-rewind").disabled=false;btn("theater-seek").max=String(Math.max(0,events.length-1));advance(position);
}
function apply(s,source){if(!s||s.schema!=="pct-command-center-live-v1")return;
const changed=s.run_id!==data?.run_id||s.generated_utc!==data?.generated_utc;
data=s;agentsById.clear();for(const a of data.agents||[])agentsById.set(a.id,a);
if(changed){pause();position=0;}
events=Array.isArray(s.events)?s.events.slice().sort((a,b)=>String(a.created_utc||"").localeCompare(String(b.created_utc||""))):[];
renderIntro();renderInfo();renderExplorer();renderTimeline();
if(changed&&events.length&&!isReduceMotion){ /* Start real-event playback automatically only on initial load. */
if(originalCount===0){originalCount=events.length;play();}
}
}
function openOperationalObject(obj,type){const view=btn("document-view");view.classList.add("reading-details");const keys=Object.keys(obj).filter(k=>typeof obj[k]==="string"||typeof obj[k]==="number"||typeof obj[k]==="boolean").slice(0,24);
view.innerHTML='<span class="eyebrow">ACTUAL '+esc(type.toUpperCase())+' / METADATA ONLY</span><h3>'+esc(obj.repository||obj.agent_id||obj.event_type||"Καταγεγραμμένη πληροφορία")+'</h3>'+keys.map(k=>'<p><b>'+esc(k.replaceAll("_"," "))+':</b> <span class="value">'+esc(obj[k])+'</span></p>').join("");
btn("citation-strip").textContent=type==="blocker"?"Εμπόδιο αρχειακής πρόσβασης — ΔΕΝ είναι τεκμήριο ιστορικού γεγονότος.":"Ερευνητικό συμβάν — ΔΕΝ είναι χρονολογημένο ιστορικό γεγονός.";
}
function renderExplorer(){if(!data||filter==="claims"){pct?.renderEvidence?.();return;}
const search=String(btn("evidence-search").value||"").toLowerCase();
const arr=filter==="blockers"?(Array.isArray(data.blockers)?data.blockers:[]):events;
const filtered=arr.map((item,index)=>({item,index})).filter(o=>!search||JSON.stringify(o.item).toLowerCase().includes(search)).slice(0,150);
btn("evidence-count").textContent=filtered.length+" / "+arr.length+" "+(filter==="blockers"?"BLOCKERS":"EVENTS");
btn("evidence-list").innerHTML=filtered.length?filtered.map(({item,index})=>{
const title=filter==="blockers"?(item.repository||item.agent_id||"Access blocker"):(item.agent_id?labelFor(item.agent_id):item.event_type||"Research event");
const sub=filter==="blockers"?[item.agent_id,item.status].filter(Boolean).join(" · "):[item.event_type,item.phase,formatTime(item.created_utc)].filter(Boolean).join(" · ");
return '<button type="button" class="source-card pct-record" data-item="'+index+'"><span class="source-icon">'+(filter==="blockers"?"⚑":"◷")+'</span><span><b>'+esc(title)+'</b><small>'+esc(sub)+'</small></span></button>';
}).join(""):'<div class="source-card"><span class="source-icon">◇</span><span><b>Καμία εγγραφή</b><small>Δεν δημιουργούμε δοκιμαστικές πηγές.</small></span></div>';
document.querySelectorAll(".pct-record").forEach(b=>b.addEventListener("click",()=>{const item=arr[Number(b.dataset.item)];if(item){openOperationalObject(item,filter==="blockers"?"blocker":"event");document.querySelectorAll(".pct-record").forEach(z=>z.classList.toggle("active",z===b));}}));
}
function renderTimeline(){if(!data)return;
const ids=[...new Set(events.map(e=>e.agent_id).filter(Boolean))].sort();
const select=btn("timeline-agent-filter");
const current=select.value;select.innerHTML='<option value="">Όλοι οι agents</option>'+ids.map(id=>'<option value="'+esc(id)+'">'+esc(labelFor(id))+'</option>').join("");
if(ids.includes(current))select.value=current;
updateTimelineRows();
}
function updateTimelineRows(){if(!data)return;const id=btn("timeline-agent-filter").value;
const visible=events.map((e,i)=>({e,i})).filter(o=>!id||o.e.agent_id===id).slice(-170).reverse();
btn("event-count").textContent=visible.length+" EVENTS";
btn("event-list").innerHTML=visible.length?visible.map(({e,i})=>'<button class="source-card trace-row" data-trace="'+i+'" type="button"><span class="source-icon">◷</span><span><b>'+esc(labelFor(e.agent_id))+'</b><small>'+esc(e.event_type||e.phase||"RESEARCH")+'</small><small>'+esc(formatTime(e.created_utc))+'</small></span></button>').join(""):'<div class="source-card">Δεν υπάρχουν συμβάντα για το φίλτρο.</div>';
document.querySelectorAll(".trace-row").forEach(b=>b.addEventListener("click",()=>{const i=Number(b.dataset.trace);pause();pct?.changeView?.("world");advance(i,{focus:true});if(events[i]?.agent_id&&coords[events[i].agent_id])pct?.focusAgent?.(events[i].agent_id);}));
}
function setup(){btn("theater-play").addEventListener("click",play);
btn("theater-next").addEventListener("click",()=>{pause();advance(position+1,{focus:true});});
btn("theater-rewind").addEventListener("click",()=>{pause();advance(0,{focus:true});});
btn("theater-seek").addEventListener("input",e=>{pause();advance(Number(e.target.value),{focus:true});});
btn("theater-inspect").addEventListener("click",()=>{if(selectedAgent&&coords[selectedAgent])pct?.focusAgent?.(selectedAgent);});
btn("theater-open-trace").addEventListener("click",()=>pct?.changeView?.("timeline"));
document.querySelectorAll("[data-evidence-kind]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.evidenceKind;document.querySelectorAll("[data-evidence-kind]").forEach(n=>n.classList.toggle("selected",n===b));renderExplorer();}));
btn("evidence-search").addEventListener("input",()=>{if(filter!=="claims")renderExplorer();});
btn("timeline-agent-filter").addEventListener("change",updateTimelineRows);
window.addEventListener("pct:snapshot",e=>apply(e.detail.snapshot,e.detail.source));
window.addEventListener("pct:event",e=>{if(data&&e.detail.event){events.push(e.detail.event);if(events.length>850)events.shift();btn("theater-seek").max=String(events.length-1);renderTimeline();}});
window.addEventListener("pct:map-ready",e=>{map=e.detail.map;setupLine();if(events.length)advance(position);});
window.addEventListener("pct:view-change",e=>{if(e.detail.view==="world"&&map)map.resize();});
const existing=pct?.getSnapshot?.();if(existing)apply(existing,"snapshot");
}
setup();
})();