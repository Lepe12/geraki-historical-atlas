import * as THREE from "https://esm.sh/three@0.184.0";
const canvas=document.getElementById("universe");
const labelLayer=document.getElementById("nodeLabels");
const $=id=>document.getElementById(id);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x020610);scene.fog=new THREE.FogExp2(0x020610,.00055);
const camera=new THREE.PerspectiveCamera(48,1,1,6500);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance"});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.7;
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
const world=new THREE.Group();scene.add(world);
const coreGroup=new THREE.Group();world.add(coreGroup);
const cyan=new THREE.Color(0x60edfa),gold=new THREE.Color(0xe3b979);
const sectors=[
["Spanish / Simancas","archive",-310,115,-150,"Spanish state records and administrative correspondence."],
["Venetian Archives","archive",-250,10,150,"Venetian diplomatic and maritime archival collections."],
["French Archives","archive",-210,-170,-100,"French archival research corridor."],
["British Archives","archive",-50,240,-265,"British manuscripts and naval sources."],
["Dutch Archives","archive",145,210,-150,"Dutch collections and maritime research."],
["German Archives","archive",280,120,-90,"German archival and scholarly discovery lane."],
["Italian States","archive",275,-120,-210,"Italian state and regional archive collections."],
["Ottoman Archives","archive",200,-210,110,"Ottoman documentary research sector."],
["North African Sources","archive",-75,-240,170,"North African histories and source collections."],
["Travellers / Narratives","archive",-315,-100,60,"Travel accounts and historical narrative witnesses."],
["Source Genealogy","science",-145,125,130,"Tracks source dependence and transmission."],
["Identity Resolution","science",60,145,150,"Disambiguates historical identities and name variants."],
["Contradictions","science",175,10,200,"Surfaces disagreements between claims and evidence."],
["Relationship Networks","science",105,-135,180,"Explores historically supported relationships."],
["Chronology","science",-135,-165,-175,"Aligns claims with dated historical events."],
["Pirate Bases","science",0,70,-260,"Investigates locations, attribution and evidence."]
].map((s,i)=>({id:i,name:s[0],kind:s[1],position:new THREE.Vector3(s[2],s[3],s[4]),desc:s[5],mesh:null,label:null}));
const links=[];sectors.forEach((s,i)=>{links.push([i,-1]);if(i<10&&i%2===0)links.push([i,(i+3)%10]);if(i>=10)links.push([i,(i+1-10)%10])});
$("linkCount").textContent=links.length;
function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}const random=seeded(89431);
function starCloud(count,extent,size,inner){const v=new Float32Array(count*3),colors=new Float32Array(count*3);for(let i=0;i<count;i++){let x,y,z,r;do{x=(random()-.5)*extent;y=(random()-.5)*extent;z=(random()-.5)*extent;r=Math.hypot(x,y,z)}while(r<inner);v.set([x,y,z],i*3);let hue=random();colors.set(hue>.90?[.8,.7,.50]:[.35+random()*.45,.68+random()*.25,1],i*3)}const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(v,3));g.setAttribute("color",new THREE.BufferAttribute(colors,3));let p=new THREE.Points(g,new THREE.PointsMaterial({size,vertexColors:true,transparent:true,opacity:.65,depthWrite:false,sizeAttenuation:true,blending:THREE.AdditiveBlending}));scene.add(p);return p}
const distant=starCloud(2600,4700,700?2.2:2.2,650),dust=starCloud(3600,940,1.5,115);
const coreParticles=(()=>{const count=5200,pos=new Float32Array(count*3),c=new Float32Array(count*3),rnd=seeded(1277);
for(let i=0;i<count;i++){const theta=i*2.39996,zz=1-2*(i+.5)/count,rr=Math.sqrt(1-zz*zz),radius=57+(rnd()-.5)*19;pos.set([Math.cos(theta)*rr*radius,zz*radius,Math.sin(theta)*rr*radius],i*3);c.set([.27+rnd()*.2,.7+rnd()*.26,.91+rnd()*.09],i*3)}
const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(pos,3));g.setAttribute("color",new THREE.BufferAttribute(c,3));const p=new THREE.Points(g,new THREE.PointsMaterial({size:2.15,vertexColors:true,transparent:true,opacity:.87,depthWrite:false,blending:THREE.AdditiveBlending}));coreGroup.add(p);return p})();
const haloMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,uniforms:{time:{value:0},tint:{value:new THREE.Color(0x238cae)}},vertexShader:`varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vPos;uniform float time;uniform vec3 tint;void main(){float r=length(vPos.xy);float wave=sin(atan(vPos.y,vPos.x)*9.+r*.2-time*.3);float a=exp(-r*r/12500.)*(.09+.055*wave);gl_FragColor=vec4(tint,a);}`});
const halo=new THREE.Mesh(new THREE.PlaneGeometry(300,300),haloMaterial);coreGroup.add(halo);
function ring(radius,tube,rot,color,opacity){const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,3,240),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.rotation.set(...rot);coreGroup.add(mesh);return mesh}
const rings=[ring(91,.6,[1.12,.17,0],cyan,.3),ring(116,.45,[.3,.4,.4],gold,.18),ring(144,.28,[1.4,.15,.3],cyan,.12),ring(72,.6,[.9,0,.3],cyan,.28)];
const connections=[];
for(const [a,b] of links){const start=sectors[a].position,end=b<0?new THREE.Vector3():sectors[b].position;const curve=new THREE.QuadraticBezierCurve3(start.clone(),start.clone().add(end).multiplyScalar(.5).add(new THREE.Vector3(0,Math.sin(a*2)*17,0)),end.clone());const pts=curve.getPoints(38);const geometry=new THREE.BufferGeometry().setFromPoints(pts);const material=new THREE.LineBasicMaterial({color:b<0?0x318ca9:0xb98a55,transparent:true,opacity:b<0?.22:.17,depthWrite:false,blending:THREE.AdditiveBlending});let line=new THREE.Line(geometry,material);world.add(line);const dot=new THREE.Mesh(new THREE.SphereGeometry(1.75,6,5),new THREE.MeshBasicMaterial({color:b<0?0x6ce5f6:0xe7ba7a,transparent:true,opacity:.7,blending:THREE.AdditiveBlending}));world.add(dot);connections.push({curve,dot,offset:random(),speed:.035+random()*.06})}
const nodeMeshes=[];
function node(s){const c=s.kind==="archive"?cyan:gold;const g=new THREE.Group();g.position.copy(s.position);
const inner=new THREE.Mesh(new THREE.IcosahedronGeometry(5.5,1),new THREE.MeshBasicMaterial({color:c}));g.add(inner);
const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(11,1),new THREE.MeshBasicMaterial({color:c,wireframe:true,transparent:true,opacity:.37}));g.add(shell);
const orbit=new THREE.Mesh(new THREE.TorusGeometry(17,.28,3,76),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.48}));orbit.rotation.x=.8;g.add(orbit);
const aura=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:c,transparent:true,opacity:.23,depthWrite:false,blending:THREE.AdditiveBlending}));aura.scale.set(72,72,1);g.add(aura);
inner.userData.sector=s.id;s.mesh=g;s.inner=inner;s.orbit=orbit;s.aura=aura;world.add(g);nodeMeshes.push(inner);
const el=document.createElement("div");el.className="node-label "+s.kind;el.textContent=s.name;const sub=document.createElement("small");sub.textContent=s.kind==="archive"?"ARCHIVAL LANE":"SCIENTIFIC NODE";el.appendChild(sub);labelLayer.appendChild(el);s.label=el}
let texture;
function glowTexture(){if(texture)return texture;const c=document.createElement("canvas");c.width=c.height=128;const x=c.getContext("2d"),gr=x.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,"rgba(255,255,255,1)");gr.addColorStop(.11,"rgba(255,255,255,.9)");gr.addColorStop(.38,"rgba(255,255,255,.20)");gr.addColorStop(1,"rgba(255,255,255,0)");x.fillStyle=gr;x.fillRect(0,0,128,128);texture=new THREE.CanvasTexture(c);return texture}
sectors.forEach(node);
const hubGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0x23c4e7,transparent:true,opacity:.21,blending:THREE.AdditiveBlending,depthWrite:false}));hubGlow.scale.set(380,380,1);coreGroup.add(hubGlow);
scene.add(new THREE.AmbientLight(0x44677f,.5));const lamp=new THREE.PointLight(0x48dfff,12000,600);lamp.position.set(30,30,30);scene.add(lamp);
let yaw=-.22,pitch=.22,targetYaw=yaw,targetPitch=pitch,radius=840,targetRadius=840,focus=new THREE.Vector3(),targetFocus=new THREE.Vector3(),selected=-1,hover=-1,held=false,moved=false,mx=0,my=0;const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
const clock=new THREE.Clock(),raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2(),point=new THREE.Vector3();let frame=0;
function select(i){selected=i;const p=$("detailPanel");p.classList.remove("hidden");if(i<0){$("detail-number").textContent="COMMAND / 00";$("detailType").textContent="CENTRAL INTELLIGENCE";$("detailTitle").textContent="JARVIS";$("detailDescription").textContent="Central intelligence concept. This scene is a visual simulation, not a live connection.";$("detailRole").textContent="ORCHESTRATOR";$("detailState").textContent="VISUAL ONLY";return}let s=sectors[i];$("detail-number").textContent="SECTOR / "+String(i+1).padStart(2,"0");$("detailType").textContent=s.kind==="archive"?"ARCHIVAL INTELLIGENCE":"SCIENTIFIC INTELLIGENCE";$("detailTitle").textContent=s.name;$("detailDescription").textContent=s.desc;$("detailRole").textContent=s.kind.toUpperCase();$("detailState").textContent="VISUAL ONLY"}
function reset(){targetFocus.set(0,0,0);targetRadius=840;targetYaw=-.22;targetPitch=.22;selected=-1;$("detailPanel").classList.add("hidden")}
function aim(i){targetFocus.copy(i<0?new THREE.Vector3():sectors[i].position);targetRadius=340}
function pointer(e){const r=canvas.getBoundingClientRect();mouse.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects(nodeMeshes,false);hover=hits.length?hits[0].object.userData.sector:-1;canvas.style.cursor=held?"grabbing":hover>=0?"pointer":"grab"}
canvas.addEventListener("pointerdown",e=>{held=true;moved=false;mx=e.clientX;my=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener("pointermove",e=>{if(held){const dx=e.clientX-mx,dy=e.clientY-my;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;targetYaw-=dx*.006;targetPitch=Math.max(-1.32,Math.min(1.32,targetPitch+dy*.004))}mx=e.clientX;my=e.clientY;pointer(e)});
canvas.addEventListener("pointerup",e=>{held=false;if(!moved){pointer(e);if(hover>=0)select(hover);else{const n=new THREE.Vector2(mouse.x,mouse.y);if(n.length()<.18)select(-1)}}});
canvas.addEventListener("pointercancel",()=>held=false);
canvas.addEventListener("wheel",e=>{e.preventDefault();targetRadius=Math.max(155,Math.min(1850,targetRadius*Math.exp(e.deltaY*.001)))},{passive:false});
$("zoomIn").onclick=()=>targetRadius=Math.max(155,targetRadius*.8);$("zoomOut").onclick=()=>targetRadius=Math.min(1850,targetRadius*1.25);$("resetView").onclick=reset;
$("closeDetail").onclick=()=>{$("detailPanel").classList.add("hidden");selected=-1};$("focusButton").onclick=()=>aim(selected);
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-view]").forEach(x=>x.classList.remove("active"));b.classList.add("active");if(b.dataset.view==="universe")reset();else{const i=b.dataset.view==="archives"?0:b.dataset.view==="analysis"?10:9;select(i);targetFocus.copy(sectors[i].position).multiplyScalar(.65);targetRadius=475}}));
function draw(){requestAnimationFrame(draw);const dt=Math.min(clock.getDelta(),.04),time=clock.elapsedTime;const damping=Math.min(1,dt*5);
yaw+=(targetYaw-yaw)*damping;pitch+=(targetPitch-pitch)*damping;radius+=(targetRadius-radius)*damping;focus.lerp(targetFocus,damping);
camera.position.set(focus.x+radius*Math.sin(yaw)*Math.cos(pitch),focus.y+radius*Math.sin(pitch),focus.z+radius*Math.cos(yaw)*Math.cos(pitch));camera.lookAt(focus);
const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h&&(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio()))){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
if(!reduced){coreParticles.rotation.y+=dt*.05;coreParticles.rotation.x+=dt*.018;rings[0].rotation.z+=dt*.055;rings[1].rotation.y+=dt*.033;dust.rotation.y+=dt*.001;for(const a of connections){const t=(time*a.speed+a.offset)%1;a.dot.position.copy(a.curve.getPoint(t))}haloMaterial.uniforms.time.value=time;}
for(const s of sectors){s.mesh.quaternion.copy(camera.quaternion);s.orbit.rotation.z+=reduced?0:dt*.11;const active=s.id===selected||s.id===hover;s.mesh.scale.lerp(new THREE.Vector3().setScalar(active?1.38:1),damping);s.aura.material.opacity=active?.5:.23;point.copy(s.position).project(camera);const visible=point.z<1&&point.z>-1&&point.x>-1.1&&point.x<.8&&point.y>-.84&&point.y<.85;const el=s.label;el.style.opacity=visible?(active?"1":".78"):"0";el.style.left=(point.x*.5+.5)*w+17+"px";el.style.top=(-point.y*.5+.5)*h+"px"}
$("coordinates").textContent="X "+yaw.toFixed(2)+" / Y "+pitch.toFixed(2)+" / DEPTH "+Math.round(radius);$("zoomLevel").textContent=radius<400?"03 / DOSSIER":radius<700?"02 / CONSTELLATION":"01 / CLUSTER";frame++;if(frame%35===0){$("fps").textContent=Math.round(1/Math.max(dt,.001))+" FPS";$("clock").textContent=new Date().toISOString().slice(11,19)+" UTC"}
renderer.render(scene,camera)}
$("detailPanel").classList.add("hidden");draw();
