"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";
const base=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"));
export default function N7HeadTest(){
 const host=useRef<HTMLDivElement>(null),input=useRef({x:0,y:0,mode:"mouse",reduced:false,body:true});
 const [mode,setMode]=useState("mouse"),[error,setError]=useState(""),[reduced,setReduced]=useState(false),[body,setBody]=useState(true);
 const choose=useCallback((next:string,x=0,y=0)=>{input.current={...input.current,mode:next,x,y};setMode(next);},[]);
 useEffect(()=>{
  const h=host.current;if(!h)return;let disposed=false,raf=0,last=0,yaw=0,nod=0,dirty=true;
  const query=matchMedia("(prefers-reduced-motion: reduce)");
  const preference=()=>{input.current.reduced=query.matches;setReduced(query.matches);if(query.matches&&input.current.mode==="auto")choose("manual");dirty=true;};preference();query.addEventListener("change",preference);
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});}catch{setError("Δεν υποστηρίζονται τα γραφικά σε αυτόν τον browser.");query.removeEventListener("change",preference);return;}
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));h.append(renderer.domElement);
  Object.assign(renderer.domElement.style,{width:"100%",height:"100%",display:"block"});
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,1.4,-1.4,.1,30);camera.position.z=6;
  const group=new THREE.Group();scene.add(group);
  const height=2*1402/1122,geometry=new THREE.PlaneGeometry(2,height,96,120),positions=geometry.attributes.position;
  // One gently curved, continuously textured surface. The ENTIRE head uses
  // one rigid pose; there are no independent cheek/jaw warping weights.
  for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i);const dome=.15*Math.exp(-((x/.85)**2+((y-.20)/1.05)**2));const nose=.045*Math.exp(-((x/.16)**2+((y+.28)/.24)**2));positions.setZ(i,dome+nose);}
  geometry.translate(0,height*.30,0);group.position.y=-height*.30;
  const texture=new THREE.TextureLoader().load(base+"/n7-head-h01.webp",()=>{if(!disposed){h.dataset.ready="true";dirty=true;}},undefined,()=>{if(!disposed)setError("Δεν φορτώθηκε η εικόνα του κεφαλιού.");});texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  // Only the existing N7 shoulders/chest below the old head are present.
  // The old face is cropped out, so it cannot ghost underneath H01.
  const unit=12/1122,sourceCenter=17+1402/12;
  const bodyGeometry=new THREE.PlaneGeometry(320*unit,(480-208)*unit);
  const uv=bodyGeometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,uv.getY(i)*(480-208)/480);
  const bodyTexture=new THREE.TextureLoader().load(N7_HUMANOID_REFERENCE,()=>{if(!disposed)dirty=true;});bodyTexture.colorSpace=THREE.SRGBColorSpace;
  const bodyMaterial=new THREE.MeshBasicMaterial({map:bodyTexture,toneMapped:false,depthWrite:false,depthTest:false});
  const torso=new THREE.Mesh(bodyGeometry,bodyMaterial);torso.position.y=(sourceCenter-(208+480)/2)*unit;scene.add(torso);
  let lastBody=input.current.body;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.035,side:THREE.DoubleSide,toneMapped:false});const neckBlend={value:input.current.body?1:0};
  material.onBeforeCompile=shader=>{shader.uniforms.h01NeckBlend=neckBlend;shader.fragmentShader="uniform float h01NeckBlend;\n"+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace("#include <alphatest_fragment>","diffuseColor.a *= mix(1.0,smoothstep(0.015,0.13,vMapUv.y),h01NeckBlend);\n#include <alphatest_fragment>");};
  group.add(new THREE.Mesh(geometry,material));
  const resize=()=>{const r=h.getBoundingClientRect();renderer.setSize(r.width,r.height,false);const aspect=r.width/r.height,withBody=input.current.body,viewHeight=withBody?Math.max(480*unit*1.08,320*unit*1.12/aspect):Math.max(height*1.10,2.22/aspect),center=withBody?(sourceCenter-240)*unit:0;camera.top=center+viewHeight/2;camera.bottom=center-viewHeight/2;camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.updateProjectionMatrix();dirty=true;};const observer=new ResizeObserver(resize);observer.observe(h);resize();
  const pointer=(e:PointerEvent)=>{if(input.current.mode!=="mouse"||input.current.reduced)return;const r=h.getBoundingClientRect();input.current.x=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width*.4)));input.current.y=Math.max(-1,Math.min(1,(r.top+r.height/2-e.clientY)/(r.height*.4)));};
  const neutral=()=>{if(input.current.mode==="mouse"){input.current.x=0;input.current.y=0;}};h.addEventListener("pointermove",pointer,{passive:true});h.addEventListener("pointerleave",neutral);window.addEventListener("blur",neutral);
  const draw=(now:number)=>{if(disposed)return;const c=input.current;if(lastBody!==c.body){lastBody=c.body;resize();}torso.visible=c.body;neckBlend.value=c.body?1:0;h.dataset.body=String(c.body);const dt=Math.min(100,last?now-last:16);last=now;let x=c.x,y=c.y;if(c.mode==="auto"&&!c.reduced){x=Math.sin(now/2200);y=Math.sin(now/3100)*.65;}const length=Math.max(1,Math.hypot(x,y)),targetYaw=x*.20/length,targetNod=y*.12/length;const follow=c.reduced?1:1-Math.exp(-dt/100);yaw+=(targetYaw-yaw)*follow;nod+=(targetNod-nod)*follow;if(Math.abs(targetYaw-yaw)<.00001)yaw=targetYaw;if(Math.abs(targetNod-nod)<.00001)nod=targetNod;group.rotation.set(-nod,yaw,0,"YXZ");if(dirty||h.dataset.yaw!==yaw.toFixed(5)||h.dataset.pitch!==nod.toFixed(5)){renderer.render(scene,camera);dirty=false;h.dataset.yaw=yaw.toFixed(5);h.dataset.pitch=nod.toFixed(5);}h.dataset.mode=c.mode;raf=requestAnimationFrame(draw);};raf=requestAnimationFrame(draw);
  return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();query.removeEventListener("change",preference);h.removeEventListener("pointermove",pointer);h.removeEventListener("pointerleave",neutral);window.removeEventListener("blur",neutral);geometry.dispose();material.dispose();texture.dispose();bodyGeometry.dispose();bodyMaterial.dispose();bodyTexture.dispose();renderer.dispose();renderer.domElement.remove();};
 },[choose]);
 return <main style={{height:"100dvh",minHeight:360,display:"flex",flexDirection:"column",color:"#dbf7ff",fontFamily:"system-ui",background:"#000"}}>
  <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px",gap:12}}><strong>N7 · Δοκιμή κεφαλιού H01</strong><a style={{color:"#9befff"}} href={base+"/"}>Επιστροφή στο N7</a></header>
  <div ref={host} aria-label="N7 H01 head motion" style={{flex:1,minHeight:0,overflow:"hidden",touchAction:"none"}}/>
  {error&&<p role="alert">{error}</p>}
  <footer style={{padding:"10px 16px",textAlign:"center",background:"#030c13"}}><p style={{margin:"0 0 8px",fontSize:13}}>Κίνησε το ποντίκι πάνω στην εικόνα ή δοκίμασε τις κατευθύνσεις.</p><div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
   {[["Αριστερά",-1,0],["Δεξιά",1,0],["Πάνω",0,1],["Κάτω",0,-1],["Κέντρο",0,0]].map(([label,x,y])=><button key={label} onClick={()=>choose("manual",Number(x),Number(y))}>{label}</button>)}
   <button aria-pressed={body} onClick={()=>{input.current.body=!input.current.body;setBody(input.current.body);}}>{body?"Μόνο κεφάλι":"Με σώμα N7"}</button><button aria-pressed={mode==="mouse"} onClick={()=>choose("mouse")}>Ποντίκι</button><button disabled={reduced} aria-pressed={mode==="auto"} onClick={()=>choose(mode==="auto"?"manual":"auto")}>{mode==="auto"?"Παύση":"Αυτόματη κίνηση"}</button>
  </div></footer><style>{`body{margin:0}button{cursor:pointer;background:#0c2530;color:#d2f7ff;border:1px solid #286779;padding:8px 12px;border-radius:7px}button[aria-pressed=true]{background:#15516a}button:focus-visible,a:focus-visible{outline:2px solid #ffcf88;outline-offset:3px}`}</style>
 </main>;
}
