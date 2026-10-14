// Read-only JARVIS data adapter. No fake metrics, events, routes or archival records.
export const ARCHIVE_LANES=new Set(["travellers","spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african"]);
// Layout follows the APEX original symmetrical wiring; positions have reserved lanes
// for legible labels, not historical/geographic coordinates.
export const NETWORK_POSITIONS={
  // Upper left to lower left: primary archive lanes
  french:[196,75], venetian:[160,128], spanish_simancas:[134,186],
  travellers:[150,254], north_african:[176,324], ottoman:[245,399],
  // Upper right to lower right: complementary archive lanes
  british:[473,73], dutch:[516,137], german:[544,207],
  italian_states:[522,324],
  // Specialist subnetwork, slightly closer to core but outside its halo
  source_genealogy:[423,121], identity_resolution:[226,222],
  contradiction:[209,286], relationship_network:[461,249],
  timeline:[424,389], pirate_base:[360,407]
};
export const NETWORK_SHORT_LABELS={
  french:"French", venetian:"Venetian", spanish_simancas:"Simancas",
  travellers:"Travellers", north_african:"North African", ottoman:"Ottoman",
  british:"British", dutch:"Dutch", german:"German", italian_states:"Italian States",
  source_genealogy:"Source Genealogy", identity_resolution:"Identity",
  contradiction:"Contradictions", relationship_network:"Relationships",
  timeline:"Timeline", pirate_base:"Pirate Bases"
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
return [x.id,NETWORK_SHORT_LABELS[x.id]||x.label||x.id,category,pos[0],pos[1],true,0,category==="consultant"?8.2:6.6];
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
