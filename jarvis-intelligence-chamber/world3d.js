import { connectResearchFeed } from "./live-bridge.js";
import * as THREE from "https://esm.sh/three@0.184.0";
import { EffectComposer } from "https://esm.sh/three@0.184.0/examples/jsm/postprocessing/EffectComposer.js?external=three";
import { RenderPass } from "https://esm.sh/three@0.184.0/examples/jsm/postprocessing/RenderPass.js?external=three";
import { UnrealBloomPass } from "https://esm.sh/three@0.184.0/examples/jsm/postprocessing/UnrealBloomPass.js?external=three";
import { OutputPass } from "https://esm.sh/three@0.184.0/examples/jsm/postprocessing/OutputPass.js?external=three";

/**
 * JARVIS / EVE-inspired spatial intelligence map.
 * Schematic research topology, NOT geographic coordinates or historical assertions.
 * Independent world renderer: no V5 dependencies, menus or fixed radial solar-system layout.
 */
// Import-map aliases keep Three's postprocessing modules on the same Three instance.
const canvas=document.getElementById("universe");
const labels=document.getElementById("nodeLabels");
const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.28;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x03080e);
scene.fog=new THREE.FogExp2(0x03080e,0.00037);
const camera=new THREE.PerspectiveCamera(53,1,2,12000);
const clock=new THREE.Clock();
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),0.92,.43,.42);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const world=new THREE.Group();scene.add(world);
const GOLD=0xf5b83d,CYAN=0x35c6cb,DIM=0x3b737c;
const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let seed=19102026;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
function randomNormal(){return (rand()+rand()+rand()+rand()-2)*1.73}
const regions=[
  {name:"WESTERN ARCHIVES",kind:"archive",center:[-890,100,-170],spread:[340,190,120],count:110},
  {name:"MEDITERRANEAN ARCHIVES",kind:"archive",center:[-280,-90,80],spread:[290,210,160],count:135},
  {name:"NORTHERN COLLECTIONS",kind:"archive",center:[150,440,-190],spread:[270,165,120],count:115},
  {name:"EASTERN ARCHIVES",kind:"archive",center:[820,170,30],spread:[340,195,130],count:120},
  {name:"SOURCE CRITICISM",kind:"science",center:[280,-280,110],spread:[210,165,100],count:100},
  {name:"HISTORICAL RELATIONSHIPS",kind:"science",center:[970,-390,-90],spread:[275,170,125],count:105},
  {name:"JARVIS INTELLIGENCE",kind:"core",center:[50,90,-20],spread:[170,140,90],count:65}
];
// Agent identifiers map to actual command-center snapshot lanes.
const agentIds=["spanish_simancas","venetian","french","british","dutch","german","italian_states","ottoman","north_african","travellers","source_genealogy","identity_resolution","contradiction","relationship_network","timeline","pirate_base"];
const agents=[
["Spanish / Simancas",0],["Venetian Archives",1],["French Archives",0],
["British Archives",2],["Dutch Archives",2],["German Archives",2],
["Italian States",1],["Ottoman Archives",3],["North African Sources",1],
["Travellers / Narratives",0],["Source Genealogy",4],["Identity Resolution",4],
["Contradictions",4],["Relationship Networks",5],["Chronology",5],["Pirate Bases",5]
];
const nodes=[],edges=[],agentNodes=[];
function addNode(position,regionIndex,major=false,name=""){
 const node={position,regionIndex,major,name,index:nodes.length};
 nodes.push(node);return node;
}
for(let r=0;r<regions.length;r++){
 const g=regions[r];
 for(let i=0;i<g.count;i++){
  let x=g.center[0]+randomNormal()*g.spread[0]*0.55;
  let y=g.center[1]+randomNormal()*g.spread[1]*0.55;
  let z=g.center[2]+randomNormal()*g.spread[2]*0.60;
  addNode(new THREE.Vector3(x,y,z),r);
 }
}
const nexus=addNode(new THREE.Vector3(...regions[6].center),6,true,"JARVIS");
agents.forEach(([name,region],i)=>{
 const origin=regions[region].center;
 const a=(i+1)*2.39996,radius=52+(i%5)*22;
 const p=new THREE.Vector3(origin[0]+Math.cos(a)*radius,origin[1]+Math.sin(a)*radius*.7,origin[2]+((i%4)-1.5)*19);
 const node=addNode(p,region,true,name);node.agentId=agentIds[i];agentNodes.push(node);
});
function edge(a,b,major=false){
 if(a===b)return;
 const key=Math.min(a,b)+"-"+Math.max(a,b);
 if(edge.keys.has(key))return;edge.keys.add(key);
 edges.push({a,b,major});
}
edge.keys=new Set();
// Local constellation edges only: do not connect every point to JARVIS.
for(let i=0;i<nodes.length;i++){
 const a=nodes[i],same=nodes.filter(n=>n.regionIndex===a.regionIndex&&n!==a);
 same.sort((p,q)=>a.position.distanceToSquared(p.position)-a.position.distanceToSquared(q.position));
 for(let k=0;k<Math.min(2,same.length);k++)edge(i,same[k].index,k===0&&rand()>.84);
 if(rand()>.79&&same[2])edge(i,same[2].index,false);
}
for(let r=0;r<regions.length-1;r++){
 const A=nodes.filter(n=>n.regionIndex===r),B=nodes.filter(n=>n.regionIndex===r+1);
 const a=A.reduce((p,q)=>p.position.distanceToSquared(new THREE.Vector3(...regions[r+1].center))<q.position.distanceToSquared(new THREE.Vector3(...regions[r+1].center))?p:q);
 const b=B.reduce((p,q)=>p.position.distanceToSquared(a.position)<q.position.distanceToSquared(a.position)?p:q);
 edge(a.index,b.index,true);
}
for(const n of agentNodes)edge(n.index,nexus.index,false);
const points=new Float32Array(nodes.length*3);
const pointColors=new Float32Array(nodes.length*3);
const cyan=new THREE.Color(0x4af9f2),gold=new THREE.Color(GOLD);
nodes.forEach((n,i)=>{
 n.position.toArray(points,i*3);
 const color=n.major?gold:n.regionIndex===4||n.regionIndex===5?new THREE.Color(0x6da3a0):cyan;
 const strength=n.major?1:(.72+rand()*.28);
 pointColors[i*3]=color.r*strength;pointColors[i*3+1]=color.g*strength;pointColors[i*3+2]=color.b*strength;
});
const nodeGeometry=new THREE.BufferGeometry();
nodeGeometry.setAttribute("position",new THREE.BufferAttribute(points,3));
nodeGeometry.setAttribute("color",new THREE.BufferAttribute(pointColors,3));
const starNodes=new THREE.Points(nodeGeometry,new THREE.PointsMaterial({size:9.4,vertexColors:true,transparent:true,opacity:.92,sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending}));
world.add(starNodes);
// Second-resolution constellation geometry, only unveiled upon approach.
// Procedural points are navigation scaffolding, not historical evidence.
const detailedRegions=regions.map((region,ri)=>{
 const positions=[],connections=[];
 const center=new THREE.Vector3(...region.center);
 const local=[];
 for(let i=0;i<region.count*3;i++){
  const base=nodes.filter(n=>n.regionIndex===ri)[i%region.count].position;
  const p=base.clone().add(new THREE.Vector3((rand()-.5)*62,(rand()-.5)*62,(rand()-.5)*38));
  local.push(p);positions.push(p.x,p.y,p.z);
  if(i%3!==0){connections.push(...p.toArray(),...base.toArray())}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
 const dots=new THREE.Points(geometry,new THREE.PointsMaterial({color:ri===6?0xe5b05c:0x25b4dc,size:4.7,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
 const linesGeometry=new THREE.BufferGeometry();linesGeometry.setAttribute("position",new THREE.Float32BufferAttribute(connections,3));
 const strands=new THREE.LineSegments(linesGeometry,new THREE.LineBasicMaterial({color:0x3d9eac,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
 world.add(dots,strands);return {dots,strands,alpha:0,center};
});
function makeLines(selected,opacity,color){
 const data=[];
 for(const e of edges){if(Boolean(e.major)!==selected)continue;
  data.push(...nodes[e.a].position.toArray(),...nodes[e.b].position.toArray());
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute("position",new THREE.Float32BufferAttribute(data,3));
 const lines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));
 world.add(lines);return lines;
}
const faintLines=makeLines(false,.22,0x55aab7);
const routeLines=makeLines(true,1,0x62ffe9);
const backgroundGeometry=new THREE.BufferGeometry();
const bg=[];for(let i=0;i<2100;i++)bg.push((rand()-.5)*6500,(rand()-.5)*4200,(rand()-.5)*3500);
backgroundGeometry.setAttribute("position",new THREE.Float32BufferAttribute(bg,3));
const backgroundStars=new THREE.Points(backgroundGeometry,new THREE.PointsMaterial({color:0x698b9e,size:2.1,transparent:true,opacity:.25,sizeAttenuation:true,depthWrite:false}));
scene.add(backgroundStars);
function glowTexture(){
 const c=document.createElement("canvas");c.width=c.height=128;
 const x=c.getContext("2d"),g=x.createRadialGradient(64,64,0,64,64,64);
 g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(.16,"rgba(255,255,255,.65)");g.addColorStop(.45,"rgba(255,255,255,.13)");g.addColorStop(1,"rgba(255,255,255,0)");
 x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
const glow=glowTexture();
// Rich reactor atmosphere while keeping the cartographic constellations spatially dominant.
const reactor=new THREE.Group();
reactor.position.copy(nexus.position);world.add(reactor);

// MEDITERRANEAN CORE LAB — the original NABOU reactor language, reshaped geographically.
// No terrain slab and no globe: the sea itself is a volumetric particle/network reactor.
const medGroup=new THREE.Group();reactor.add(medGroup);
const MED={minLon:-6,maxLon:37,minLat:30,maxLat:46,sx:12.2,sz:12.2};
const medPoint=(lon,lat,y=0)=>new THREE.Vector3((lon-15.5)*MED.sx,y,-(lat-38)*MED.sz);
function mediterraneanMask(lon,lat){
 if(lon<-5.8||lon>36.7||lat<30.1||lat>45.9)return false;
 if(lon<-1.3&&lat>43.7)return false;
 if(lon>30.5&&lat>42.5)return false;
 if(lon>34.7&&lat>37.4)return false;
 if(lon<0&&lat<34.2)return false;
 if(lon>27&&lat<31.15)return false;
 // carve obvious non-Mediterranean continental corners while retaining Adriatic/Aegean.
 if(lon<4&&lat>43.9)return false;
 if(lon>22&&lon<29&&lat>45.1)return false;
 return true;
}
const medPositions=[],medColors=[],medNodes=[];
for(let i=0;i<1500;i++){
 const lon=MED.minLon+rand()*(MED.maxLon-MED.minLon),lat=MED.minLat+rand()*(MED.maxLat-MED.minLat);
 if(!mediterraneanMask(lon,lat))continue;
 const y=randomNormal()*13;
 const p=medPoint(lon,lat,y);medNodes.push(p);medPositions.push(p.x,p.y,p.z);
 const c=new THREE.Color(rand()>.91?0x9effff:0x35c6cb);
 medColors.push(c.r,c.g,c.b);
}
const medGeo=new THREE.BufferGeometry();
medGeo.setAttribute("position",new THREE.Float32BufferAttribute(medPositions,3));
medGeo.setAttribute("color",new THREE.Float32BufferAttribute(medColors,3));
const medCloud=new THREE.Points(medGeo,new THREE.PointsMaterial({map:glow,size:13.5,vertexColors:true,transparent:true,opacity:.86,sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending}));
medGroup.add(medCloud);

// Dense internal intelligence lattice, using the exact additive network vocabulary of the old core.
const medLinks=[];
for(let i=0;i<medNodes.length;i++){
 let best=-1,bestD=Infinity;
 for(let k=0;k<9;k++){const j=Math.floor(rand()*medNodes.length);if(j===i)continue;const d=medNodes[i].distanceToSquared(medNodes[j]);if(d<bestD){bestD=d;best=j}}
 if(best>=0&&bestD<11500)medLinks.push(...medNodes[i].toArray(),...medNodes[best].toArray());
}
const medLinkGeo=new THREE.BufferGeometry();
medLinkGeo.setAttribute("position",new THREE.Float32BufferAttribute(medLinks,3));
medGroup.add(new THREE.LineSegments(medLinkGeo,new THREE.LineBasicMaterial({color:0x58dce8,transparent:true,opacity:.20,depthWrite:false,blending:THREE.AdditiveBlending})));

// Central radiating intelligence nexus remains, but now lives inside the Mediterranean silhouette.
const medHub=medPoint(16.2,37.9,0),hubLinks=[];
for(let i=0;i<115;i++){const p=medNodes[Math.floor(rand()*medNodes.length)];hubLinks.push(...medHub.toArray(),...p.toArray())}
const hubGeo=new THREE.BufferGeometry();hubGeo.setAttribute("position",new THREE.Float32BufferAttribute(hubLinks,3));
medGroup.add(new THREE.LineSegments(hubGeo,new THREE.LineBasicMaterial({color:0x6ef8f1,transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending})));

// Original reactor glow is preserved as layered holographic atmosphere, stretched to Mediterranean proportions.
const medHaloLayers=[
 {w:650,h:255,color:0x024477,opacity:.12},
 {w:540,h:215,color:0x087db8,opacity:.15},
 {w:420,h:170,color:0x12b8e9,opacity:.16},
 {w:600,h:235,color:0xd08318,opacity:.045}
];
for(const h of medHaloLayers){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:h.color,transparent:true,opacity:h.opacity,depthWrite:false,blending:THREE.AdditiveBlending}));sp.scale.set(h.w,h.h,1);medGroup.add(sp)}

// Orbital scientific rings remain around the geographic reactor, not as a replacement globe.
const energyBands=[];
for(let i=0;i<4;i++){
 const curve=new THREE.EllipseCurve(0,0,285+i*18,102+i*13,0,Math.PI*2,false,i*.38);
 const pts=curve.getPoints(190).map(p=>new THREE.Vector3(p.x,0,p.y));
 const geo=new THREE.BufferGeometry().setFromPoints(pts);
 const band=new THREE.LineLoop(geo,new THREE.LineBasicMaterial({color:i===1?0xf4b63c:0x20e7ff,transparent:true,opacity:i===1?.36:.25,depthWrite:false,blending:THREE.AdditiveBlending}));
 band.rotation.set(.18+i*.12,.04+i*.09,i*.07);medGroup.add(band);energyBands.push(band);
}

// Real Natural Earth coastline is overlaid asynchronously as luminous reactor particles/strands.
fetch("https://cdn.jsdelivr.net/gh/martynafford/natural-earth-geojson@master/50m/physical/ne_50m_land.json").then(r=>r.json()).then(gj=>{
 const coast=[];
 for(const f of gj.features||[]){
  const polys=f.geometry?.type==="Polygon"?[f.geometry.coordinates]:f.geometry?.type==="MultiPolygon"?f.geometry.coordinates:[];
  for(const rings of polys){const ring=rings?.[0]||[];let seg=[];
   for(let i=0;i<ring.length;i+=2){const q=ring[i];if(q[0]>=MED.minLon&&q[0]<=MED.maxLon&&q[1]>=MED.minLat&&q[1]<=MED.maxLat)seg.push(medPoint(q[0],q[1],4))}
   if(seg.length>2){const g=new THREE.BufferGeometry().setFromPoints(seg);medGroup.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0x8af8ff,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending})));coast.push(...seg)}
  }
 }
 const cg=new THREE.BufferGeometry().setFromPoints(coast);
 medGroup.add(new THREE.Points(cg,new THREE.PointsMaterial({map:glow,color:0xb8ffff,size:9,transparent:true,opacity:.88,depthWrite:false,blending:THREE.AdditiveBlending})));
 document.body.dataset.mediterraneanCore="ACTIVE";
 document.body.dataset.mediterraneanCoastParticles=String(coast.length);
}).catch(()=>{document.body.dataset.mediterraneanCore="COASTLINE_LOAD_FAILED"});

const reactorCore=new THREE.Mesh(new THREE.IcosahedronGeometry(7,2),new THREE.MeshBasicMaterial({color:0x5df8ff,transparent:true,opacity:.55}));
reactorCore.position.copy(medHub);medGroup.add(reactorCore);
const plasma={material:{uniforms:{uTime:{value:0}}}};
const bloomTestMarker="JARVIS_BLOOM_ACTIVE";
// Atmospheric depth: low-opacity cyan nebula behind the constellations.
for(let i=0;i<9;i++){
 const c=regions[i%regions.length].center;
 const veil=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:i%3===0?0x356fa0:0x126a74,opacity:.065,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
 veil.position.set(c[0]+(rand()-.5)*420,c[1]+(rand()-.5)*280,c[2]-350-rand()*400);
 veil.scale.set(1100+rand()*400,580+rand()*360,1);scene.add(veil);
}
// Bright moving signals travel along major research routes.
const routeEdges=edges.filter(e=>e.major);
const pulseGeometry=new THREE.BufferGeometry();
pulseGeometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(routeEdges.length*3),3));
const pulsePoints=new THREE.Points(pulseGeometry,new THREE.PointsMaterial({map:glow,size:34,sizeAttenuation:true,color:0x65fff2,transparent:true,opacity:.82,depthWrite:false,blending:THREE.AdditiveBlending}));
world.add(pulsePoints);
const hubMeshes=[],selectables=[];
function hub(node,scale=1){
 const group=new THREE.Group();group.position.copy(node.position);
 const material=new THREE.MeshBasicMaterial({color:node.name==="JARVIS"?0x168ec9:CYAN,transparent:true,opacity:.94});
 const center=new THREE.Mesh(new THREE.SphereGeometry(5*scale,16,12),material);
 const selectable=new THREE.Mesh(new THREE.SphereGeometry(22*scale,12,8),new THREE.MeshBasicMaterial({visible:false}));
 selectable.userData.node=node;group.add(center,selectable);
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:node.name==="JARVIS"?0x086dae:0x3cefe5,transparent:true,opacity:node.name==="JARVIS"?.32:.62,depthWrite:false,blending:THREE.AdditiveBlending}));
 sprite.scale.setScalar((node.name==="JARVIS"?180:85)*scale);group.add(sprite);
 if(node.name==="JARVIS"){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(54,1.55,5,110),new THREE.MeshBasicMaterial({color:GOLD,transparent:true,opacity:.85,depthWrite:false}));
  ring.rotation.x=.3;group.add(ring);
  const inner=new THREE.Mesh(new THREE.TorusGeometry(42,1.15,5,100),new THREE.MeshBasicMaterial({color:0x48f2ee,transparent:true,opacity:.82,depthWrite:false,blending:THREE.AdditiveBlending}));
  inner.rotation.set(.4,.4,-.15);group.add(inner);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:0xf5af29,transparent:true,opacity:.31,depthWrite:false,blending:THREE.AdditiveBlending}));
  halo.scale.set(155,155,1);group.add(halo);
  const energy=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:0x056cba,transparent:true,opacity:.27,depthWrite:false,blending:THREE.AdditiveBlending}));
  energy.scale.set(110,110,1);group.add(energy);
  node.rings=[ring,inner];node.energy=energy;
 }
 world.add(group);node.group=group;node.sprite=sprite;
 hubMeshes.push(group);selectables.push(selectable);
}
hub(nexus,1.3);agentNodes.forEach(n=>hub(n,.75));
function label(node,text,major){
 const element=document.createElement("div");element.className="node-label "+(major?"science":"archive");
 element.textContent=text;element.style.pointerEvents="none";labels.appendChild(element);return element;
}
// Read-only evidence overlay: unlike procedural map scaffolding, each evidence point
// must originate in an actual durable run record. No synthetic "claims" are made.
const evidenceLayer=new THREE.Group();world.add(evidenceLayer);
const evidenceClickables=[];
let researchSnapshot=null;
let evidenceCount=0, evidenceSource="UNAVAILABLE",evidenceRun="";
const evidenceAgentMap=new Map(agentNodes.map(n=>[n.agentId,n]));
function verifiedRecord(record,kind,index){
 const id=String(record?.id||record?.claim_id||"").slice(0,120);
 const agentId=String(record?.agent_id||"");
 const agent=evidenceAgentMap.get(agentId)||(kind==="claim"?nexus:null);
 if(!agent||!["claim","blocker","contradiction"].includes(kind))return;
 const status=String(record?.status||"UNVERIFIED").slice(0,70);
 const label=String(record?.repository||record?.description||record?.claim||record?.note||id||kind).slice(0,200);
 const angle=(index+1)*2.3999632,rad=38+(index%8)*11;
 const pos=agent.position.clone().add(new THREE.Vector3(Math.cos(angle)*rad,Math.sin(angle)*rad*.7,(index%7-3)*9));
 const node={position:pos,regionIndex:agent.regionIndex,major:true,name:label,index:-1};
 node.evidence={kind,status,agent_id:agentId,id,label};
 const hue=kind==="blocker"?0xd88a4e:kind==="contradiction"?0xe0b253:0x54dfb8;
 const spot=new THREE.Mesh(new THREE.SphereGeometry(3.8,9,6),new THREE.MeshBasicMaterial({color:hue,transparent:true,opacity:.94}));
 spot.position.copy(pos);spot.visible=false;evidenceLayer.add(spot);
 const hit=new THREE.Mesh(new THREE.SphereGeometry(13,8,6),new THREE.MeshBasicMaterial({visible:false}));
 hit.position.copy(pos);hit.userData.node=node;hit.visible=false;evidenceLayer.add(hit);
 const lineGeometry=new THREE.BufferGeometry().setFromPoints([agent.position,pos]);
 const link=new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:hue,transparent:true,opacity:.38,depthWrite:false}));
 link.visible=false;evidenceLayer.add(link);
 node.evidenceMeshes=[spot,hit,link];evidenceClickables.push(hit);selectables.push(hit);evidenceCount++;
}
let currentRun="",connectionMode="OFFLINE";
const recentEventIds=new Set();
function clearEvidence(){
 for(const hit of evidenceClickables){const n=hit.userData.node;for(const mesh of n.evidenceMeshes)evidenceLayer.remove(mesh);const i=selectables.indexOf(hit);if(i>=0)selectables.splice(i,1);}
 evidenceClickables.length=0;evidenceCount=0;
}
function setConnection(mode,detail){
 connectionMode=mode;
 document.body.dataset.feedMode=mode;
 document.body.dataset.feedDetail=detail||"";
 const el=$("linkCount");
 if(el)el.textContent=mode+" · "+(currentRun?"RUN "+currentRun:"NO RUN");
}
function receiveSnapshot(data,origin){
 if(data.schema!=="pct-command-center-live-v1"||!Array.isArray(data.agents)||!Array.isArray(data.blockers)||!Array.isArray(data.claims))return;
 // Do not let a delayed older fallback overwrite newer live state.
 if(connectionMode==="LIVE"&&origin==="SNAPSHOT")return;
 if(connectionMode==="LIVE"&&origin==="LIVE"&&evidenceSource==="LIVE EVENT")return;
 clearEvidence();recentEventIds.clear();
 currentRun=String(data.run_id||"");evidenceRun=currentRun;
 researchSnapshot=data;
 evidenceSource=origin==="LIVE"?"LIVE BOOTSTRAP":"DURABLE SNAPSHOT";
 const laneState=new Map(data.agents.map(a=>[a.id,a]));
 for(const n of agentNodes)n.liveState=laneState.get(n.agentId)||null;
 data.claims.forEach((r,i)=>verifiedRecord(r,"claim",i));
 data.blockers.forEach((r,i)=>verifiedRecord(r,"blocker",i));
 if(Array.isArray(data.contradictions?.records))data.contradictions.records.forEach((r,i)=>verifiedRecord(r,"contradiction",i));
 document.body.dataset.evidenceSource=evidenceSource;
 document.body.dataset.evidenceRecords=String(evidenceCount);
 document.body.dataset.evidenceRun=evidenceRun;
}
function receiveEvent(event){
 if(event.schema!=="pct-jarvis-event-v1"||!event.run_id)return;
 const id=String(event.event_id||"");
 if(id&&recentEventIds.has(id))return;
 if(id){recentEventIds.add(id);if(recentEventIds.size>1000)recentEventIds.delete(recentEventIds.values().next().value);}
 const run=String(event.run_id);
 if(run!==currentRun){
  currentRun=run;evidenceRun=run;researchSnapshot=null;clearEvidence();
  for(const n of agentNodes)n.liveState=null;
  document.body.dataset.evidenceRecords="0";
  document.body.dataset.evidenceRun=run;
 }
 const n=evidenceAgentMap.get(String(event.agent_id||""));
 if(n)n.liveState={...(n.liveState||{}),status:String(event.status||event.event_type||"EVENT"),phase:String(event.phase||""),percent:event.percent};
 if(n&&selected===n)select(n);
 evidenceSource="LIVE EVENT";
 document.body.dataset.evidenceSource=evidenceSource;
 document.body.dataset.lastEvent=String(event.event_type||"");
 document.body.dataset.lastEventId=id;
 setConnection("LIVE","Latest live event: "+String(event.event_type||"unknown"));
}
connectResearchFeed({onSnapshot:receiveSnapshot,onEvent:receiveEvent,onState:setConnection});

const allLabels=[];
regions.forEach((r,i)=>allLabels.push({position:new THREE.Vector3(...r.center),el:label(null,r.name,true),region:true}));
agentNodes.forEach(n=>allLabels.push({position:n.position,el:label(n,n.name,false),region:false}));
const focus=new THREE.Vector3(),goal=new THREE.Vector3();
let targetDistance=1640,distance=1640,panX=0,panY=0,yaw=.05,pitch=.22,targetYaw=yaw,targetPitch=pitch;
let selected=null,dragging=false,dragged=false,lastX=0,lastY=0;
let activeRegion=-1;
const navigationHistory=[];
function flyTo(position,zoom=510,region=-1){
 navigationHistory.push({target:goal.clone(),zoom:targetDistance,region:activeRegion});
 if(navigationHistory.length>20)navigationHistory.shift();
 goal.copy(position);targetDistance=zoom;activeRegion=region;
 document.body.dataset.activeRegion=region>=0?regions[region].name:"NODE";
}
function goBack(){
 const previous=navigationHistory.pop();
 if(previous){goal.copy(previous.target);targetDistance=previous.zoom;activeRegion=previous.region}
 else reset();
 document.body.dataset.activeRegion=activeRegion>=0?regions[activeRegion].name:"OVERVIEW";
}
function regionHit(event){
 const rect=canvas.getBoundingClientRect(),mx=event.clientX-rect.left,my=event.clientY-rect.top;
 let best=null,bestD=75;
 for(let i=0;i<regions.length;i++){
  const p=new THREE.Vector3(...regions[i].center).project(camera);
  if(p.z<-1||p.z>1)continue;
  const sx=(p.x+1)*rect.width*.5,sy=(1-p.y)*rect.height*.5;
  const d=Math.hypot(sx-mx,sy-my);
  if(d<bestD){bestD=d;best=i}
 }
 return best;
}
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
function projectToMouse(e){const b=canvas.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1)}
function select(n){
 selected=n;
 const panel=$("detailPanel");if(panel)panel.classList.remove("hidden");
 const write=(id,text)=>{if($(id))$(id).textContent=text};
 write("detail-number",n.evidence?"RECORDED "+n.evidence.kind.toUpperCase():(n.name==="JARVIS"?"NEXUS":"RESEARCH NODE"));
 write("detailType",n.evidence?"DURABLE RUN "+evidenceRun:"SPATIAL RESEARCH TOPOLOGY");
 write("detailTitle",n.name);
 const data=researchSnapshot;
 const agentBlockers=n.agentId?(data?.blockers||[]).filter(r=>r.agent_id===n.agentId).length:0;
 const agentClaims=n.agentId?(data?.claims||[]).filter(r=>r.agent_id===n.agentId).length:0;
 const stats=n.agentId?" · "+agentBlockers+" access obstacles; "+agentClaims+" candidate claims.":"";
 write("detailDescription",n.evidence?
  "Recorded "+n.evidence.kind+" · "+n.evidence.label+" · "+n.evidence.status+". Not independently verified historical evidence.":
  n.liveState?"Run "+(evidenceRun||"unknown")+" · "+String(n.liveState.status||"UNKNOWN")+" · phase "+String(n.liveState.phase||"UNKNOWN")+stats+" Nearby colored points represent recorded items, not historical routes.":
  "Schematic research sector; no verified historical relationship is asserted.");
 write("detailRole",n.name==="JARVIS"?"ORCHESTRATION":"RESEARCH");
 write("detailState",n.evidence?n.evidence.status:n.liveState?String(n.liveState.status):"VISUAL ONLY");
}
function reset(){
 goal.set(0,0,0);targetDistance=1640;targetYaw=.05;targetPitch=.22;selected=null;activeRegion=-1;
 navigationHistory.length=0;document.body.dataset.activeRegion="OVERVIEW";
 $("detailPanel")?.classList.add("hidden");
}
function pick(e){projectToMouse(e);ray.setFromCamera(pointer,camera);return ray.intersectObjects(selectables,false)[0]?.object.userData.node||null}
canvas.addEventListener("pointerdown",e=>{dragging=true;dragged=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener("pointermove",e=>{
 if(dragging){const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>1)dragged=true;
  if(e.shiftKey||e.buttons===2){const side=new THREE.Vector3().subVectors(camera.position,focus).normalize().cross(new THREE.Vector3(0,1,0)).normalize();const up=new THREE.Vector3(0,1,0);goal.addScaledVector(side,dx*distance*.001).addScaledVector(up,dy*distance*.001);}
  else{targetYaw-=dx*.003;targetPitch=Math.max(-1.3,Math.min(1.3,targetPitch+dy*.003));}
 }
 lastX=e.clientX;lastY=e.clientY;
});
canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("pointerup",e=>{
 if(!dragged){
  const node=pick(e);
  if(node){select(node);flyTo(node.position,350,node.regionIndex)}
  else{const region=regionHit(e);if(region!==null){flyTo(new THREE.Vector3(...regions[region].center),460,region)}}
 }
 dragging=false;
});
canvas.addEventListener("pointercancel",()=>dragging=false);
canvas.addEventListener("wheel",e=>{e.preventDefault();targetDistance=THREE.MathUtils.clamp(targetDistance*Math.exp(e.deltaY*.001),95,4500)},{passive:false});
$("zoomIn")?.addEventListener("click",()=>targetDistance=Math.max(95,targetDistance*.78));
$("zoomOut")?.addEventListener("click",()=>targetDistance=Math.min(4500,targetDistance*1.27));
$("resetView")?.addEventListener("click",reset);
$("closeDetail")?.addEventListener("click",()=>{$("detailPanel")?.classList.add("hidden");selected=null});
$("focusButton")?.addEventListener("click",()=>{if(selected)flyTo(selected.position,280,selected.regionIndex)});
window.addEventListener("keydown",e=>{
 if(e.key==="Escape"||e.key==="Backspace"){if(["INPUT","TEXTAREA"].includes(document.activeElement?.tagName))return;e.preventDefault();goBack()}
 if(e.key==="Home")reset();
});
canvas.addEventListener("dblclick",e=>{
 const region=regionHit(e);
 if(region!==null)flyTo(new THREE.Vector3(...regions[region].center),330,region);
});
document.body.dataset.activeRegion="OVERVIEW";
function frame(){
 requestAnimationFrame(frame);
 const dt=Math.min(clock.getDelta(),.05),time=clock.elapsedTime,k=Math.min(dt*4,1);
 // Ease closer to the active sector when a node is deliberately focused.
 const parallax=.015*Math.sin(time*.14);
 backgroundStars.rotation.y=reduced?0:parallax;
 distance=THREE.MathUtils.lerp(distance,targetDistance,k);
 yaw=THREE.MathUtils.lerp(yaw,targetYaw,k);pitch=THREE.MathUtils.lerp(pitch,targetPitch,k);focus.lerp(goal,k);
 camera.position.set(focus.x+distance*Math.sin(yaw)*Math.cos(pitch),focus.y+distance*Math.sin(pitch),focus.z+distance*Math.cos(yaw)*Math.cos(pitch));
 camera.lookAt(focus);
 // Geometric level of detail is physically unveiled at close range, never on overview.
 for(let ri=0;ri<detailedRegions.length;ri++){
   const detail=detailedRegions[ri];
   const proximity=focus.distanceTo(detail.center);
   const visible=(activeRegion===ri||proximity<260)&&distance<930;
   const target=visible?THREE.MathUtils.smoothstep(930-distance,0,610):0;
   detail.alpha=THREE.MathUtils.lerp(detail.alpha,target,Math.min(1,dt*3.5));
   detail.dots.material.opacity=detail.alpha*.70;
   detail.strands.material.opacity=detail.alpha*.23;
   detail.dots.visible=detail.alpha>.008;
   detail.strands.visible=detail.alpha>.008;
 }
 const closeRange=distance<850;
 for(const hit of evidenceClickables){
  const n=hit.userData.node;
  const shown=closeRange&&(activeRegion===n.regionIndex||focus.distanceTo(n.position)<290);
  for(const mesh of n.evidenceMeshes)mesh.visible=shown;
 }
 const w=canvas.clientWidth,h=canvas.clientHeight;
 if(w&&h&&(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))){
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);composer.setSize(w,h);
 }
 if(!reduced){
  plasma.material.uniforms.uTime.value=time;
  reactorCore.rotation.y=time*.11; medGroup.rotation.y=Math.sin(time*.12)*.018;
  for(let i=0;i<energyBands.length;i++){energyBands[i].rotation.y+=dt*(i%2?.15:-.11);energyBands[i].rotation.z+=dt*(i%2?-.09:.07)}
  for(const n of agentNodes.concat(nexus)){if(n.group)n.sprite.material.opacity=(n===nexus?.25:.52)+.09*Math.sin(time*.5+n.index)}
  nexus.rings[0].rotation.y=time*.06;nexus.rings[1].rotation.z=-time*.12;
  nexus.energy.material.opacity=.25+.06*Math.sin(time*1.25);
  const positions=pulseGeometry.attributes.position;
  for(let i=0;i<routeEdges.length;i++){
    const e=routeEdges[i],a=nodes[e.a].position,b=nodes[e.b].position,t=(time*.09+i*.337)%1;
    positions.setXYZ(i,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);
  }
  positions.needsUpdate=true;
 }
 // Depth-based labels with collision avoidance and region-to-agent focus transitions.
 const occupied=[];
 const labelsByPriority=allLabels.slice().sort((a,b)=>Number(b.region)-Number(a.region));
 for(const item of labelsByPriority){
  const p=item.position.clone().project(camera);
  const depth=item.position.distanceTo(camera.position);
  const x=(p.x+1)*w/2,y=(1-p.y)*h/2;
  item.el.style.left=x+"px";item.el.style.top=y+"px";
  const onScreen=p.z>-1&&p.z<1&&x>65&&x<w-65&&y>35&&y<h-45;
  const focused=selected&&selected.position.distanceTo(item.position)<260;
  const inside=activeRegion>=0&&item.position.distanceTo(new THREE.Vector3(...regions[activeRegion].center))<380;
  const allow=item.region?distance>420:(distance<1100||focused||inside);
  const fade=THREE.MathUtils.clamp(1-depth/4600,.25,1);
  const halfWidth=item.region?98:72;
  const overlaps=occupied.some(box=>Math.abs(box.x-x)<box.r+halfWidth+12&&Math.abs(box.y-y)<30);
  const visible=onScreen&&allow&&!overlaps;
  item.el.style.opacity=visible?String((item.region?.73:.82)*fade):"0";
  item.el.style.fontSize=item.region?"11px":"9px";
  item.el.style.letterSpacing=item.region?".27em":".07em";
  if(visible)occupied.push({x,y,r:halfWidth});
 }
 if($("zoomLevel"))$("zoomLevel").textContent=distance>1450?"01 / REGIONS":distance>550?"02 / CONSTELLATIONS":"03 / SYSTEMS";
 if($("coordinates"))$("coordinates").textContent="X "+focus.x.toFixed(0)+" / Y "+focus.y.toFixed(0);
 if($("fps")&&Math.floor(time*2)%2===0)$("fps").textContent=Math.round(1/Math.max(.001,dt))+" FPS";
 if($("clock"))$("clock").textContent=new Date().toISOString().slice(11,19)+" UTC";
 composer.render();
}
$("detailPanel")?.classList.add("hidden");
frame();
