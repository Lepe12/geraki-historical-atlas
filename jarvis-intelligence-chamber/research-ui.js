import {connectResearchFeed,missionState} from './live-bridge.js';
const $=id=>document.getElementById(id);
const activity=$('activityLines'),mission=$('missionState'),toggle=$('resultsToggle'),drawer=$('resultsDrawer'),close=$('closeResults'),count=$('resultsCount'),list=$('resultsList'),runEl=$('resultsRun'),meta=$('resultsMeta');
let snapshot=null,events=[],resultFilter='all';
const map={'Spanish / Simancas':'spanish_simancas','Venetian Archives':'venetian','French Archives':'french','British Archives':'british','Dutch Archives':'dutch','German Archives':'german','Italian States':'italian_states','Greek Archives':'greek','Ottoman Archives':'ottoman','North African Sources':'north_african','Travellers / Narratives':'travellers','Source Genealogy':'source_genealogy','Identity Resolution':'identity_resolution','Contradictions':'contradiction','Relationship Networks':'relationship_network','Chronology':'timeline','Pirate Bases':'pirate_base'};
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function sourceLink(record){try{const u=new URL(record.url);return ['http:','https:'].includes(u.protocol)?'<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">SOURCE ↗</a>':'';}catch(_){return '';}}
function renderActivity(){const src=events.slice(-3).reverse();activity.innerHTML=src.length?src.map(e=>'<div><b>'+esc(e.agent_id||'JARVIS')+'</b> → '+esc(e.detail||e.phase||e.status||e.event_type)+'</div>').join(''):'<div>No recorded activity for this run.</div>';}
function renderResults(){
 const claims=snapshot?.claims||[],blockers=snapshot?.blockers||[],contradictions=snapshot?.contradictions?.records||[];
 count.textContent=claims.length;runEl.textContent=snapshot?.run_id?'RUN '+snapshot.run_id:'NO RUN';meta.textContent=claims.length+' claims · '+blockers.length+' blockers · '+contradictions.length+' contradictions';
 const groups=resultFilter==='contradictions'?[[contradictions,'CONTRADICTION']]:resultFilter==='claims'?[[claims,'CLAIM']]:resultFilter==='blockers'?[[blockers,'BLOCKER']]:[[claims,'CLAIM'],[blockers,'BLOCKER']];
 const items=[];for(const [records,kind] of groups)for(const r of records){items.push('<div class="result-item"><b>'+esc(kind+' · '+(r.evidence_state||r.status||'UNREVIEWED'))+'</b><span>'+esc(r.claim||r.text||r.statement||r.title||r.description||r.note||r.repository||r.identifier||'Recorded item')+'</span><small>'+esc(r.agent_id||r.lane||'')+'</small>'+sourceLink(r)+'</div>');}
 list.innerHTML=items.join('')||'<div class="result-empty">'+(resultFilter==='contradictions'?'No recorded contradictions. Access blockers are listed separately.':'No recorded items for this run and filter.')+'</div>';
}
function updateDetail(){
 const id=map[$('detailTitle')?.textContent?.trim()],a=snapshot?.agents?.find(x=>x.id===id);let box=$('detailLive');
 if(!a){if(box)box.remove();if($('detailTitle')?.textContent==='JARVIS'){$('detailDescription').textContent='Research orchestration and recorded evidence. Connection status is independent of historical verification.';$('detailState').textContent=document.body.dataset.researchUi||'RECORDED';}return;}
 const latest=[...events].reverse().find(e=>e.agent_id===id),bs=(snapshot.blockers||[]).filter(b=>b.agent_id===id);if(!box){box=document.createElement('div');box.id='detailLive';box.className='detail-live agent-overview';$('detailPanel').insertBefore(box,$('focusButton'));}
 $('detailState').textContent=(document.body.dataset.researchUi||'RECORDED')+' · '+(a.status||'UNKNOWN');
 box.innerHTML='<div class="agent-overview-head"><span>RECORDED AGENT</span><strong>'+esc(a.status||'UNKNOWN')+'</strong></div>'+[['RUN',snapshot.run_id],['CURRENT TASK',latest?.detail||a.phase||snapshot.mission?.purpose||'—'],['SOURCE',bs[0]?.repository||'—'],['PHASE',a.phase||'—'],['PROGRESS',(a.percent??'—')+'%'],['VERIFIED',a.verified_events??'—'],['CANDIDATES',a.candidate_events??'—'],['BLOCKERS',bs.length]].map(([k,v])=>'<div><span>'+k+'</span><strong>'+esc(v)+'</strong></div>').join('');
}
window.addEventListener('jarvis:mission-state',e=>{if(e.detail?.state)mission.textContent=e.detail.state;});
window.addEventListener('jarvis:results-filter',e=>{resultFilter=['all','claims','blockers','contradictions'].includes(e.detail?.filter)?e.detail.filter:'all';renderResults();});
window.addEventListener('jarvis:results-open',()=>drawer.classList.remove('hidden'));window.addEventListener('jarvis:results-close',()=>drawer.classList.add('hidden'));
toggle.onclick=()=>drawer.classList.toggle('hidden');close.onclick=()=>drawer.classList.add('hidden');
new MutationObserver(updateDetail).observe($('detailTitle'),{childList:true,subtree:true,characterData:true});
connectResearchFeed({onSnapshot:(s,origin)=>{document.body.dataset.currentResearchRun=String(s.run_id);document.body.dataset.evidenceRun=String(s.run_id);document.body.dataset.evidenceSource=origin==='LIVE'?'LIVE BOOTSTRAP':'DURABLE SNAPSHOT';snapshot=s;events=[...(s.events||[])];renderResults();renderActivity();updateDetail();mission.textContent=missionState(s);window.dispatchEvent(new CustomEvent('jarvis:research-state',{detail:{run_id:s.run_id,state:missionState(s)}}));},onEvent:e=>{if(String(e.run_id)!==String(snapshot?.run_id))return;if(!events.some(x=>x.event_id===e.event_id))events.push(e);events=events.slice(-1000);renderActivity();updateDetail();window.dispatchEvent(new CustomEvent('jarvis:research-state',{detail:{run_id:e.run_id,request_id:e.request_id,state:missionState(snapshot)}}));},onState:m=>{document.body.dataset.researchUi=m;updateDetail();}});
renderActivity();renderResults();
