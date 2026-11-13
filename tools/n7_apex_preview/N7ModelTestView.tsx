"use client";
import {useEffect,useRef} from "react";
import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer.js";
import {RenderPass} from "three/examples/jsm/postprocessing/RenderPass.js";
import {UnrealBloomPass} from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {OutputPass} from "three/examples/jsm/postprocessing/OutputPass.js";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";
import {readVoiceSignal} from "./N7VoiceSignal";

// Isolated evaluation of the owner's N7 3D model (textured.glb). The model has
// no rig, so a three-bone chain (chest -> neck base -> skull base) is added here
// and the single mesh is skinned to it with smooth weights across the neck: the
// whole head turns and nods as one rigid volume. Nothing in the Humanoid uses this.
export type ModelView="front"|"profile"|"back"|"follow"|"auto"|"orbit";
export type ModelLook="original"|"n7";
type Props={view:ModelView;look:ModelLook;bloom:boolean;closeup:boolean;reduced:boolean;phase:string;onReady:()=>void;onError:(s:string)=>void;onProgress:(n:number)=>void};
const base=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"));
export const MODEL_URL=base+"/n7-model-textured-v1.glb";
// Measured on the model (cross-sections by height, model units after its own
// Y-up rotation): the neck is narrowest between y 0.10 and 0.20, the chin is
// near y 0.25 and the neck column is centred near z -0.06.
const NECK=new THREE.Vector3(0,.07,-.06),SKULL=new THREE.Vector3(0,.24,-.05),CHEST=new THREE.Vector3(0,-.30,-.06);
const MAX_YAW=.55,MAX_PITCH=.30;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

export default function N7ModelTestView(props:Props){
 const host=useRef<HTMLDivElement>(null),config=useRef(props);useEffect(()=>{config.current=props;},[props]);
 useEffect(()=>{
  const h=host.current;if(!h)return;
  let disposed=false,raf=0,last=0,yaw=0,pitch=0,vy=0,vp=0,mx=0,my=0,lastFit="",frames=0,frameSum=0,lastStats=0;
  let mesh:THREE.SkinnedMesh|undefined,neckBone:THREE.Bone|undefined,headBone:THREE.Bone|undefined,root:THREE.Group|undefined;
  let originalMaterial:THREE.MeshStandardMaterial|undefined,n7Material:THREE.MeshStandardMaterial|undefined;
  const shared={rim:{value:0},level:{value:0},gold:{value:0}};
  const controller=new AbortController();
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});}catch{config.current.onError("Ο browser δεν υποστηρίζει προβολή 3D (WebGL).");return;}
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.setClearColor(0x000000,1);
  const pixelRatio=Math.min(devicePixelRatio,1.5);renderer.setPixelRatio(pixelRatio);h.append(renderer.domElement);// The glow pass returns an opaque frame; screen blending lets its dark parts
  // fall away over the scene, like the Humanoid figure itself.
  Object.assign(renderer.domElement.style,{width:"100%",height:"100%",display:"block",mixBlendMode:"screen"});
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.01,50);
  scene.add(new THREE.HemisphereLight(0xcfe6ff,0x05101a,1.3));
  for(const [color,intensity,x,y,z] of [[0xffffff,2.2,0,1.5,3],[0x48d6ff,2.6,2.4,1,-1],[0xffb04a,1.6,-2.4,1,-.5]] as const){const l=new THREE.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l);}
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(256,256),.45,.35,.62);composer.addPass(bloom);composer.addPass(new OutputPass());
  const center=new THREE.Vector3();
  const fit=()=>{const r=h.getBoundingClientRect();if(r.width<2||r.height<2||!root)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
   const close=config.current.closeup;center.set(0,close?.40:.02,0);const height=close?1.35:2.15;
   const distance=Math.max(height,(close?.95:1.25)/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(15)));
   controls.target.copy(center);camera.position.set(0,center.y,distance);camera.lookAt(center);controls.update();controls.saveState();};
  const resize=()=>{const r=h.getBoundingClientRect();if(r.width<2||r.height<2)return;renderer.setSize(r.width,r.height,false);composer.setSize(r.width,r.height);composer.setPixelRatio(pixelRatio);fit();};
  const observer=new ResizeObserver(resize);observer.observe(h);resize();
  const pointer=(e:PointerEvent)=>{const r=h.getBoundingClientRect();mx=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width*.35)));my=Math.max(-1,Math.min(1,(r.top+r.height*.35-e.clientY)/(r.height*.35)));};
  const leave=()=>{mx=0;my=0;};h.addEventListener("pointermove",pointer,{passive:true});h.addEventListener("pointerleave",leave);window.addEventListener("blur",leave);
  (async()=>{try{
   const t0=performance.now();
   const response=await fetch(MODEL_URL,{signal:controller.signal});if(!response.ok)throw Error("model_http");
   const total=Number(response.headers.get("content-length")),reader=response.body!.getReader(),parts:Uint8Array[]=[];let loaded=0,reported=0;
   for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);loaded+=value.length;if(performance.now()-reported>150){reported=performance.now();config.current.onProgress(total?Math.min(95,Math.round(loaded/total*95)):0);}}
   const bytes=new Uint8Array(loaded);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
   const tDownload=performance.now();
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer,base+"/");if(disposed)return;
   let source:THREE.Mesh|undefined;gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(!source&&o instanceof THREE.Mesh)source=o;});
   if(!source)throw Error("mesh_missing");
   // Bake the file's own orientation into the vertices, then skin to the chain.
   const geometry=source.geometry.clone();geometry.applyMatrix4(source.matrixWorld);
   const pos=geometry.attributes.position,count=pos.count,skinIndex=new Uint16Array(count*4),skinWeight=new Float32Array(count*4);
   for(let i=0;i<count;i++){
    const y=pos.getY(i),wHead=smooth(.16,.27,y),wNeck=smooth(.02,.15,y);
    skinIndex.set([0,1,2,0],i*4);skinWeight.set([1-wNeck,wNeck-wHead,wHead,0],i*4);
   }
   geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skinIndex,4));geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skinWeight,4));
   const chest=new THREE.Bone();chest.position.copy(CHEST);neckBone=new THREE.Bone();neckBone.position.copy(NECK).sub(CHEST);headBone=new THREE.Bone();headBone.position.copy(SKULL).sub(NECK);
   chest.add(neckBone);neckBone.add(headBone);neckBone.rotation.order="YXZ";headBone.rotation.order="YXZ";
   originalMaterial=(source.material as THREE.MeshStandardMaterial);
   // N7 look: the texture's own lit lines become emissive cyan and gold, the
   // body falls toward deep navy, and a cyan rim follows the silhouette.
   n7Material=originalMaterial.clone();n7Material.color.set("#0e1a26");n7Material.emissive.set("#ffffff");n7Material.emissiveMap=originalMaterial.map;n7Material.emissiveIntensity=1.0;n7Material.metalness=.1;n7Material.roughness=.45;
   n7Material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,{n7Rim:shared.rim,n7Level:shared.level,n7Gold:shared.gold});
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nuniform float n7Rim;uniform float n7Level;uniform float n7Gold;")
     .replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
      { vec3 e=totalEmissiveRadiance; float l=max(max(e.r,e.g),e.b);
        // Only the texture's drawn lines light up; the dark body stays dark.
        // The texture is mostly mid-blue; only its brightest drawn lines
        // (about the top 10%) light up, the rest stays a dark body.
        float lit=smoothstep(.70,.95,l);
        bool warm=e.r>e.b*1.2&&e.r>.25;
        vec3 cyan=vec3(.20,.78,1.)*1.15;
        vec3 gold=vec3(1.,.60,.14)*1.5;
        totalEmissiveRadiance=(warm?gold:cyan)*lit*(1.+.7*n7Level);
        totalEmissiveRadiance+=vec3(1.,.60,.14)*lit*n7Gold*.35; }`)
     .replace("#include <opaque_fragment>",`float fres=pow(1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.),2.6);
      outgoingLight+=vec3(.20,.78,1.)*fres*n7Rim*.55;
      #include <opaque_fragment>`);};
   mesh=new THREE.SkinnedMesh(geometry,originalMaterial);mesh.frustumCulled=false;mesh.add(chest);mesh.bind(new THREE.Skeleton([chest,neckBone,headBone]));
   root=new THREE.Group();root.add(mesh);scene.add(root);fit();
   geometry.computeBoundingBox();const tex=originalMaterial.map?.image as {width?:number}|undefined;
   Object.assign(h.dataset,{ready:"true",asset:"n7-model-textured-v1",rig:"added-chest-neck-skull",triangles:String((geometry.index?geometry.index.count:count)/3),vertices:String(count),textureSize:String(tex?.width||0),downloadMs:(tDownload-t0).toFixed(0),parseMs:(performance.now()-tDownload).toFixed(0),bytes:String(loaded)});
   config.current.onProgress(100);config.current.onReady();
  }catch(e){if(!disposed&&(e as Error).name!=="AbortError")config.current.onError("Δεν φορτώθηκε το μοντέλο 3D. Δοκίμασε ανανέωση της σελίδας.");}})();
  const draw=(now:number)=>{
   if(disposed)return;raf=requestAnimationFrame(draw);
   const c=config.current,dt=Math.min(100,last?now-last:16);last=now;
   if(!mesh||!neckBone||!headBone||!root||!originalMaterial||!n7Material)return;
   const fitKey=c.closeup?"close":"body";if(fitKey!==lastFit){lastFit=fitKey;fit();}
   root.rotation.y=c.view==="profile"?Math.PI/2:c.view==="back"?Math.PI:0;
   controls.enabled=c.view==="orbit";if(c.view!=="orbit")controls.reset();controls.update();
   let tx=0,ty=0;if(!c.reduced){if(c.view==="follow"){tx=mx;ty=my;}else if(c.view==="auto"){tx=Math.sin(now/2600);ty=Math.sin(now/3300)*.7;}}
   const budget=Math.max(1,Math.hypot(tx,ty)),wantYaw=tx/budget*MAX_YAW,wantPitch=-ty/budget*MAX_PITCH;
   // Critically damped joint: eases out and back, no overshoot.
   const w=1/110;for(let left=dt;left>0;left-=8){const s=Math.min(8,left);vy+=(w*w*(wantYaw-yaw)-2*w*vy)*s;yaw+=vy*s;vp+=(w*w*(wantPitch-pitch)-2*w*vp)*s;pitch+=vp*s;}
   if(c.reduced){yaw=wantYaw;pitch=wantPitch;vy=vp=0;}
   neckBone.rotation.set(pitch*.35,yaw*.35,0);headBone.rotation.set(pitch*.65,yaw*.65,0);
   const n7=c.look==="n7";mesh.material=n7?n7Material:originalMaterial;
   const level=c.phase==="speaking"&&!c.reduced?Math.max(0,readVoiceSignal(now)):0;
   shared.rim.value=n7?1.1+(c.phase==="listening"?.6:0):0;shared.level.value=level;shared.gold.value=c.phase==="thinking"?1:0;
   const t=performance.now();
   if(c.bloom&&n7){bloom.strength=.45+level*.4;composer.render();}else renderer.render(scene,camera);
   const cost=performance.now()-t;frames++;frameSum+=dt;
   if(now-lastStats>500){lastStats=now;Object.assign(h.dataset,{headYaw:yaw.toFixed(4),headPitch:pitch.toFixed(4),look:c.look,bloom:String(c.bloom&&n7),submitMs:cost.toFixed(2),frameMs:(frameSum/frames).toFixed(1),view:c.view});frames=0;frameSum=0;}
  };raf=requestAnimationFrame(draw);
  return()=>{disposed=true;controller.abort();cancelAnimationFrame(raf);observer.disconnect();controls.dispose();h.removeEventListener("pointermove",pointer);h.removeEventListener("pointerleave",leave);window.removeEventListener("blur",leave);
   if(mesh){mesh.geometry.dispose();}for(const m of [originalMaterial,n7Material]){if(m){m.map?.dispose();m.metalnessMap?.dispose();m.roughnessMap?.dispose();m.dispose();}}composer.dispose();renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div ref={host} role="img" aria-label="N7 μοντέλο 3D (δοκιμή)" style={{width:"100%",height:"100%",minHeight:0,touchAction:"none"}}/>;
}
