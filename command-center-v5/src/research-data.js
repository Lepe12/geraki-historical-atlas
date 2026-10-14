// Read-only JARVIS data adapter. No fake metrics, events, routes or archival records.
export const ARCHIVE_LANES=new Set(["travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]);
export const NETWORK_POSITIONS={
travellers:[160,340], spanish_simancas:[120,215], venetian:[220,116], french:[337,72],
british:[453,100], dutch:[562,161], german:[588,278], italian_states:[519,354],
ottoman:[417,410], north_african:[285,410], contradiction:[197,277],
identity_resolution:[240,235], pirate_base:[170,390],relationship_network:[440,289],
source_genealogy:[467,222],timeline:[345,378]
};
export function verifySnapshot(s){
if(!s||s.schema!=="pct-command-center-live-v1"||!Array.isArray(s.agents)||!Array.isArray(s.events)||!Array.isArray(s.blockers)||!Array.isArray(s.claims))throw Error("Not a compatible JARVIS snapshot");
return s;
}
export function agentRoster(s){
const a=s?.agents||[];
return a.map((x,i)=>{
const pos=NETWORK_POSITIONS[x.id]||[100+(i%6)*80,120+Math.floor(i/6)*100];
const category=ARCHIVE_LANES.has(x.id)?"doer":x.id==="contradiction"||x.id==="source_genealogy"?"consultant":"tool";
const running=x.status==="RUNNING";
return [x.id,x.label||x.id,category,pos[0],pos[1],true,0,category==="consultant"?8.2:6.6];
});
}
export function countByAgent(items,id){return items.filter(x=>x.agent_id===id).length;}
export const displayValue=x=>x===null||x===undefined||x===""?"—":String(x);
export function metric(s,key){const v=s?.metrics?.[key];return typeof v==="number"&&Number.isFinite(v)?String(v):"—";}
export function timeLabel(v){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString("el-GR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit"});}
export async function getSnapshot(signal){
const p=new URLSearchParams(location.search),base=(p.get("api")||"https://www.piratecartography.com/pct-api/live").replace(/\/$/,"");
const project=p.get("project")||"piratecartography",run=p.get("run")||"latest";
const controlled=new AbortController();const limit=setTimeout(()=>controlled.abort(),6500);
const abort=()=>controlled.abort();signal?.addEventListener("abort",abort,{once:true});
try{
const r=await fetch(base+"/status/"+encodeURIComponent(project)+"/"+encodeURIComponent(run),{signal:controlled.signal,cache:"no-store"});
if(!r.ok)throw Error("API HTTP "+r.status);
const body=await r.json();return {snapshot:verifySnapshot(body.snapshot||body),source:"LIVE API",sourceKind:"live"};
}catch(e){
if(signal?.aborted)throw e;
const r=await fetch("../command-center/live/latest.json",{cache:"no-store",signal});
if(!r.ok)throw Error("Live API unavailable and durable snapshot HTTP "+r.status);
return {snapshot:verifySnapshot(await r.json()),source:"DURABLE SNAPSHOT",sourceKind:"snapshot"};
}finally{clearTimeout(limit);signal?.removeEventListener("abort",abort);}
}
