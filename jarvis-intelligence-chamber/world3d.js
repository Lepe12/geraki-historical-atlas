import * as THREE from "https://esm.sh/three@0.184.0";

/**
 * JARVIS / EVE-inspired spatial intelligence map.
 * Schematic research topology, NOT geographic coordinates or historical assertions.
 * Independent world renderer: no V5 dependencies, menus or fixed radial solar-system layout.
 */
const canvas=document.getElementById("universe");
const labels=document.getElementById("nodeLabels");
const $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.75;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x03080e);
scene.fog=new THREE.FogExp2(0x03080e,0.00024);
const camera=new THREE.PerspectiveCamera(53,1,2,12000);
const clock=new THREE.Clock();
const world=new THREE.Group();scene.add(world);
const GOLD=0xdcb96c,CYAN=0x35c6cb,DIM=0x3b737c;
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
 const node=addNode(p,region,true,name);agentNodes.push(node);
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
const starNodes=new THREE.Points(nodeGeometry,new THREE.PointsMaterial({size:7.5,vertexColors:true,transparent:true,opacity:.92,sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending}));
world.add(starNodes);
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
const faintLines=makeLines(false,.38,0x64d4d4);
const routeLines=makeLines(true,.95,0x55fff2);
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
 const material=new THREE.MeshBasicMaterial({color:node.name==="JARVIS"?GOLD:CYAN,transparent:true,opacity:.94});
 const center=new THREE.Mesh(new THREE.SphereGeometry(5*scale,16,12),material);
 const selectable=new THREE.Mesh(new THREE.SphereGeometry(22*scale,12,8),new THREE.MeshBasicMaterial({visible:false}));
 selectable.userData.node=node;group.add(center,selectable);
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:node.name==="JARVIS"?GOLD:0x3cefe5,transparent:true,opacity:node.name==="JARVIS"?.92:.62,depthWrite:false,blending:THREE.AdditiveBlending}));
 sprite.scale.setScalar((node.name==="JARVIS"?240:85)*scale);group.add(sprite);
 if(node.name==="JARVIS"){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(54,1.55,5,110),new THREE.MeshBasicMaterial({color:GOLD,transparent:true,opacity:.85,depthWrite:false}));
  ring.rotation.x=.3;group.add(ring);
  const inner=new THREE.Mesh(new THREE.TorusGeometry(42,1.15,5,100),new THREE.MeshBasicMaterial({color:0x48f2ee,transparent:true,opacity:.82,depthWrite:false,blending:THREE.AdditiveBlending}));
  inner.rotation.set(.4,.4,-.15);group.add(inner);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:0xf5af29,transparent:true,opacity:.31,depthWrite:false,blending:THREE.AdditiveBlending}));
  halo.scale.set(155,155,1);group.add(halo);
  const energy=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:0x0bb8df,transparent:true,opacity:.62,depthWrite:false,blending:THREE.AdditiveBlending}));
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
const allLabels=[];
regions.forEach((r,i)=>allLabels.push({position:new THREE.Vector3(...r.center),el:label(null,r.name,true),region:true}));
agentNodes.forEach(n=>allLabels.push({position:n.position,el:label(n,n.name,false),region:false}));
const focus=new THREE.Vector3(),goal=new THREE.Vector3();
let targetDistance=1640,distance=1640,panX=0,panY=0,yaw=.05,pitch=.22,targetYaw=yaw,targetPitch=pitch;
let selected=null,dragging=false,dragged=false,lastX=0,lastY=0;
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
function projectToMouse(e){const b=canvas.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1)}
function select(n){
 selected=n;
 const panel=$("detailPanel");if(panel)panel.classList.remove("hidden");
 const write=(id,text)=>{if($(id))$(id).textContent=text};
 write("detail-number",n.name==="JARVIS"?"NEXUS":"RESEARCH NODE");
 write("detailType","SPATIAL RESEARCH TOPOLOGY");
 write("detailTitle",n.name);
 write("detailDescription","Research sector in an illustrative network. Connections do not represent verified historical relationships.");
 write("detailRole",n.name==="JARVIS"?"ORCHESTRATION":"RESEARCH");
 write("detailState","VISUAL ONLY");
}
function reset(){goal.set(0,0,0);targetDistance=1640;targetYaw=.05;targetPitch=.22;selected=null;$("detailPanel")?.classList.add("hidden")}
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
canvas.addEventListener("pointerup",e=>{if(!dragged){const node=pick(e);if(node)select(node)}dragging=false});
canvas.addEventListener("pointercancel",()=>dragging=false);
canvas.addEventListener("wheel",e=>{e.preventDefault();targetDistance=THREE.MathUtils.clamp(targetDistance*Math.exp(e.deltaY*.001),95,4500)},{passive:false});
$("zoomIn")?.addEventListener("click",()=>targetDistance=Math.max(95,targetDistance*.78));
$("zoomOut")?.addEventListener("click",()=>targetDistance=Math.min(4500,targetDistance*1.27));
$("resetView")?.addEventListener("click",reset);
$("closeDetail")?.addEventListener("click",()=>{$("detailPanel")?.classList.add("hidden");selected=null});
$("focusButton")?.addEventListener("click",()=>{if(selected){goal.copy(selected.position);targetDistance=360}});
function frame(){
 requestAnimationFrame(frame);
 const dt=Math.min(clock.getDelta(),.05),time=clock.elapsedTime,k=Math.min(dt*4,1);
 distance=THREE.MathUtils.lerp(distance,targetDistance,k);
 yaw=THREE.MathUtils.lerp(yaw,targetYaw,k);pitch=THREE.MathUtils.lerp(pitch,targetPitch,k);focus.lerp(goal,k);
 camera.position.set(focus.x+distance*Math.sin(yaw)*Math.cos(pitch),focus.y+distance*Math.sin(pitch),focus.z+distance*Math.cos(yaw)*Math.cos(pitch));
 camera.lookAt(focus);
 const w=canvas.clientWidth,h=canvas.clientHeight;
 if(w&&h&&(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))){
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
 }
 if(!reduced){
  for(const n of agentNodes.concat(nexus)){if(n.group)n.sprite.material.opacity=(n===nexus?.75:.52)+.09*Math.sin(time*.5+n.index)}
  nexus.rings[0].rotation.y=time*.06;nexus.rings[1].rotation.z=-time*.12;
  nexus.energy.material.opacity=.56+.12*Math.sin(time*1.25);
  const positions=pulseGeometry.attributes.position;
  for(let i=0;i<routeEdges.length;i++){
    const e=routeEdges[i],a=nodes[e.a].position,b=nodes[e.b].position,t=(time*.09+i*.337)%1;
    positions.setXYZ(i,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);
  }
  positions.needsUpdate=true;
 }
 for(const item of allLabels){
  const p=item.position.clone().project(camera),visible=p.z>-1&&p.z<1&&Math.abs(p.x)<.91&&Math.abs(p.y)<.85;
  item.el.style.left=((p.x+1)*w/2)+"px";item.el.style.top=((1-p.y)*h/2)+"px";
  const show=visible&&(item.region?distance>550:distance<1700);
  item.el.style.opacity=show?(item.region?".73":".82"):"0";
  item.el.style.fontSize=item.region?"11px":"9px";item.el.style.letterSpacing=item.region?".27em":".07em";
 }
 if($("zoomLevel"))$("zoomLevel").textContent=distance>1450?"01 / REGIONS":distance>550?"02 / CONSTELLATIONS":"03 / SYSTEMS";
 if($("coordinates"))$("coordinates").textContent="X "+focus.x.toFixed(0)+" / Y "+focus.y.toFixed(0);
 if($("fps")&&Math.floor(time*2)%2===0)$("fps").textContent=Math.round(1/Math.max(.001,dt))+" FPS";
 if($("clock"))$("clock").textContent=new Date().toISOString().slice(11,19)+" UTC";
 renderer.render(scene,camera);
}
$("detailPanel")?.classList.add("hidden");
frame();
