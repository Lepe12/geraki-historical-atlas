// One read-only production feed shared by all interface subscribers.
export const isTerminal=status=>/^(COMPLETED|FAILED|ERROR|CANCELLED|CANCELED|BLOCKED|SKIPPED|DONE|IDLE|UNAVAILABLE)$/.test(String(status||'').toUpperCase());
export function missionState(snapshot){
 const status=String(snapshot?.mission?.status||'').toUpperCase();
 if(['FAILED','ERROR','CANCELLED','CANCELED','BLOCKED'].includes(status))return status;
 if((snapshot?.agents||[]).some(a=>a.status&&!isTerminal(a.status)))return 'RESEARCH ACTIVE';
 if(status==='COMPLETED')return 'COMPLETED';
 return status||'READY';
}
const validSnapshot=d=>d?.schema==='pct-command-center-live-v1'&&/^\d+$/.test(String(d.run_id))&&Array.isArray(d.agents)&&Array.isArray(d.blockers)&&Array.isArray(d.claims)&&d.safety?.automatic_verified===false;
const eventSchema=e=>['pct-jarvis-event-v1','pct-command-center-derived-event-v1'].includes(e?.schema);
const olderRun=(a,b)=>/^\d+$/.test(String(a))&&/^\d+$/.test(String(b))&&BigInt(a)<BigInt(b);
export function applyResearchEvent(snapshot,event){
 if(!eventSchema(event)||!event.run_id||olderRun(event.run_id,snapshot?.run_id))return snapshot;
 const changed=String(snapshot?.run_id)!==String(event.run_id);
 const next=changed?{schema:'pct-command-center-live-v1',project:'piratecartography',run_id:String(event.run_id),mission:{status:'RUNNING'},agents:[],claims:[],blockers:[],contradictions:{records:[]},events:[],safety:{automatic_verified:false,human_review_required:true}}:{...snapshot,agents:[...snapshot.agents],events:[...(snapshot.events||[])]};
 if(event.event_id&&next.events.some(e=>e.event_id===event.event_id))return snapshot;
 if(event.agent_id){const i=next.agents.findIndex(a=>a.id===event.agent_id),agent={...(i<0?{id:event.agent_id}:next.agents[i]),status:event.status||event.event_type,phase:event.phase,percent:event.percent};if(i<0)next.agents.push(agent);else next.agents[i]=agent;}
 if(event.request_id)next.request_id=event.request_id;
 next.events=[...next.events,event].slice(-1000);
 // Lane completion is not mission completion; the durable snapshot owns that gate.
 next.generated_utc=event.created_utc||next.generated_utc;
 return next;
}
function createFeed({onSnapshot,onEvent,onState,WebSocketImpl=globalThis.WebSocket,fetchImpl=globalThis.fetch,endpoint='https://pct-live.piratecartography.com/pct-api/live',retryMs=12000,pollMs=15000,runId}){
 let closed=false,socket=null,retry=null,poll=null,connected=false,snapshot=null,liveSeen=false,polling=false,revision='';
 let waitingRequest='';
 let selectedRun=runId||new URLSearchParams(globalThis.location?.search||'').get('run')||'latest';if(!/^\d+$/.test(selectedRun))selectedRun='latest';
 const seen=new Set(),status=(m,d='')=>{if(!closed)onState?.(m,d);};
 function acceptSnapshot(data,origin){
  if(closed||!validSnapshot(data)||(selectedRun!=='latest'&&String(data.run_id)!==selectedRun)||olderRun(data.run_id,snapshot?.run_id))return;
  if(waitingRequest){const id=data.request_id||(data.events||[]).find(e=>e.request_id)?.request_id;if(id!==waitingRequest)return;waitingRequest='';selectedRun=String(data.run_id);}
  const same=String(data.run_id)===String(snapshot?.run_id);
  if(same&&snapshot?.generated_utc&&data.generated_utc&&data.generated_utc<snapshot.generated_utc)return;
  const sig=JSON.stringify(data);if(sig===revision)return;
  revision=sig;snapshot=data;if(origin==='LIVE')liveSeen=true;
  onSnapshot?.(snapshot,origin);
 }
 function ingest(payload){
  if(payload?.schema==='pct-command-center-bootstrap-v1'){
   acceptSnapshot(payload.snapshot,'LIVE');
   for(const e of payload.events||[])acceptEvent(e,true);
  }else acceptEvent(payload,false);
 }
 function acceptEvent(e,replayed){
  if(!eventSchema(e)||!/^\d+$/.test(String(e.run_id))||(selectedRun!=='latest'&&String(e.run_id)!==selectedRun)||olderRun(e.run_id,snapshot?.run_id))return;
  if(waitingRequest){if(e.request_id!==waitingRequest)return;waitingRequest='';selectedRun=String(e.run_id);}
  if(e.event_id&&seen.has(e.event_id))return;
  if(e.event_id){seen.add(e.event_id);if(seen.size>2000)seen.delete(seen.values().next().value);}
  if(!replayed){const next=applyResearchEvent(snapshot,e);if(next!==snapshot){snapshot=next;liveSeen=true;onSnapshot?.(snapshot,'LIVE');}}
  onEvent?.(e);
 }
 async function fallback(){
  try{const r=await fetchImpl('https://raw.githubusercontent.com/Lepe12/geraki-historical-atlas/main/command-center/live/'+(selectedRun==='latest'?'latest':'runs/'+selectedRun)+'.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('snapshot_http_'+r.status);const s=await r.json();if(!validSnapshot(s))throw Error('invalid_snapshot');acceptSnapshot(s,'SNAPSHOT');if(!connected)status('SNAPSHOT','Recorded run '+String(s.run_id));}
  catch(e){if(!connected)status('OFFLINE',String(e.message||e));}
 }
 async function refresh(){if(closed||polling)return;polling=true;try{const r=await fetchImpl(endpoint+'/status/piratecartography/'+selectedRun,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('status_http_'+r.status);const d=await r.json();if(!closed){acceptSnapshot(d.snapshot,'LIVE');for(const e of d.events||[])acceptEvent(e,true);}}catch(_){/* Socket state remains independently visible. */}finally{polling=false;await fallback();}}
 function open(){
  if(closed||!WebSocketImpl){fallback();return;}
  try{const url=new URL(endpoint);if(url.protocol!=='https:')throw Error('secure_endpoint_required');socket=new WebSocketImpl('wss://'+url.host+url.pathname.replace(/\/$/,'')+'/ws/piratecartography/'+selectedRun);
   socket.onopen=()=>{connected=true;status('LIVE','WebSocket connected');};
   socket.onmessage=e=>{try{ingest(JSON.parse(e.data));}catch(_){status(connected?'LIVE':'SNAPSHOT','Invalid message ignored');}};
   socket.onerror=()=>{};
   socket.onclose=()=>{connected=false;if(!closed){status('RECONNECTING','Socket disconnected');fallback();retry=setTimeout(open,retryMs);}};
  }catch(_){fallback();if(!closed)retry=setTimeout(open,retryMs);}
 }
 fallback().finally(()=>{if(!closed){open();poll=setInterval(refresh,pollMs);}});
 const stop=()=>{closed=true;clearTimeout(retry);clearInterval(poll);socket?.close();};
 stop.selectRun=(run,force=false)=>{const id=/^\d+$/.test(String(run))?String(run):'latest';if(closed||(id===selectedRun&&!waitingRequest&&!force))return;waitingRequest='';selectedRun=id;snapshot=null;revision='';liveSeen=false;seen.clear();clearTimeout(retry);if(socket){socket.onclose=null;socket.onmessage=null;socket.close();}connected=false;open();refresh();};
 stop.waitForRequest=id=>{waitingRequest=String(id||'');snapshot=null;revision='';seen.clear();selectedRun='latest';status('WAITING','Waiting for request '+waitingRequest);refresh();};
 return stop;
}
let shared=null;
export function selectResearchRun(run,force=false){if(force&&shared){shared.snapshot=null;for(const x of shared.subscribers)x.onReset?.();}shared?.stop?.selectRun(run,force);}
export function waitForResearchRequest(id){if(!shared)return;shared.snapshot=null;shared.origin=null;for(const x of shared.subscribers)x.onReset?.();shared.stop.waitForRequest(id);}
export function connectResearchFeed(options={}){
 // Injected transports remain isolated for deterministic contract tests.
 if(options.WebSocketImpl||options.fetchImpl||options.endpoint)return createFeed(options);
 if(!shared){const subscribers=new Set();shared={subscribers,snapshot:null,origin:null,state:null,stop:null};shared.stop=createFeed({onSnapshot:(s,o)=>{shared.snapshot=s;shared.origin=o;for(const x of subscribers)x.onSnapshot?.(s,o);},onEvent:e=>{for(const x of subscribers)x.onEvent?.(e);},onState:(...args)=>{shared.state=args;for(const x of subscribers)x.onState?.(...args);}});}
 const feed=shared;feed.subscribers.add(options);if(feed.snapshot)options.onSnapshot?.(feed.snapshot,feed.origin);if(feed.state)options.onState?.(...feed.state);
 return()=>{feed.subscribers.delete(options);if(!feed.subscribers.size){feed.stop();if(shared===feed)shared=null;}};
}
