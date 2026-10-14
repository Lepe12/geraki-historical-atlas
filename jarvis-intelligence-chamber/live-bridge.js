// JARVIS V5 read-only production transport. Never infers historical verification.
export function connectResearchFeed({onSnapshot,onEvent,onState,WebSocketImpl=globalThis.WebSocket,fetchImpl=globalThis.fetch,endpoint="https://pct-live.piratecartography.com/pct-api/live",retryMs=12000}){
 let closed=false,socket=null,retry=null,connected=false;
 const status=(mode,detail="")=>onState?.(mode,detail);
 const isSnapshot=d=>d?.schema==="pct-command-center-live-v1"&&Array.isArray(d.agents)&&Array.isArray(d.blockers)&&Array.isArray(d.claims)&&d.safety?.automatic_verified===false;
 const ingest=(payload,origin)=>{
  if(payload?.schema==="pct-command-center-bootstrap-v1"){
   if(isSnapshot(payload.snapshot))onSnapshot?.(payload.snapshot,origin);
   for(const e of payload.events||[])if(e?.schema==="pct-jarvis-event-v1")onEvent?.(e);
  }else if(payload?.schema==="pct-jarvis-event-v1")onEvent?.(payload);
 };
 async function fallback(){
  try{
   const r=await fetchImpl("../command-center/live/latest.json",{cache:"no-store"});
   if(!r.ok)throw Error("snapshot_http_"+r.status);
   const s=await r.json();
   if(!isSnapshot(s))throw Error("invalid_snapshot");
   onSnapshot?.(s,"SNAPSHOT");
   if(!connected)status("SNAPSHOT","Durable run "+String(s.run_id||"unknown"));
  }catch(e){if(!connected)status("OFFLINE",String(e.message||e));}
 }
 function open(){
  if(closed||!WebSocketImpl){fallback();return;}
  try{
   const url=new URL(endpoint);
   if(url.protocol!=="https:")throw Error("secure_endpoint_required");
   const wsUrl="wss://"+url.host+url.pathname.replace(/\/$/,"")+"/ws/piratecartography/latest";
   socket=new WebSocketImpl(wsUrl);
   socket.onopen=()=>{connected=true;status("LIVE","WebSocket connected");};
   socket.onmessage=event=>{try{ingest(JSON.parse(event.data),"LIVE");}catch(e){status("LIVE","Invalid event ignored");}};
   socket.onerror=()=>{};
   socket.onclose=()=>{connected=false;if(!closed){status("RECONNECTING","Socket disconnected");fallback();retry=setTimeout(open,retryMs);}};
  }catch(e){connected=false;fallback();if(!closed)retry=setTimeout(open,retryMs);}
 }
 fallback().finally(()=>{if(!closed)open();});
 return ()=>{closed=true;clearTimeout(retry);socket?.close();};
}
