"use client";
import {useEffect,useRef} from "react";
import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";
import {readVoiceSignal} from "./N7VoiceSignal";
export type RealPose="front"|"profile"|"back"|"follow"|"auto"|"orbit";
type Props={pose:RealPose;closeup:boolean;blink:number;jaw:number;smile:boolean;n7:boolean;reduced:boolean;phase:string;onReady:()=>void;onError:(s:string)=>void;onProgress:(n:number)=>void};
const base=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/"));
export default function N7RealAvatarView(props:Props){
 const host=useRef<HTMLDivElement>(null),config=useRef(props);useEffect(()=>{config.current=props;},[props]);
 useEffect(()=>{
  const h=host.current;if(!h)return;
  let disposed=false,raf=0,dirty=true,last=0,headYaw=0,headPitch=0,mx=0,my=0,lastPose:RealPose|null=null,lastClose=true,lastStyle:boolean|null=null,lastSignature="";
  let model:THREE.Group|undefined,head:THREE.Object3D|undefined,headRest:THREE.Quaternion|undefined;
  const meshes:THREE.Mesh[]=[],morphs:THREE.Mesh[]=[],original=new Map<THREE.MeshStandardMaterial,{color:THREE.Color;emissive:THREE.Color;metalness:number;roughness:number;intensity:number}>();
  const controller=new AbortController();
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});}catch{config.current.onError("Ο browser δεν υποστηρίζει την προβολή 3D.");return;}
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));h.append(renderer.domElement);Object.assign(renderer.domElement.style,{width:"100%",height:"100%",display:"block"});
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,50);camera.position.set(0,1.6,.8);
  scene.add(new THREE.HemisphereLight(0xd2e8ff,0x06141e,2.0));
  for(const [color,intensity,x,y,z]of [[0xfff0dd,3.0,0,2,4],[0xffb956,3.0,-2,2,1],[0x39cfff,3.5,2,2,-1]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);}
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minPolarAngle=.2;controls.maxPolarAngle=Math.PI-.2;
  const box=new THREE.Box3(),center=new THREE.Vector3(),size=new THREE.Vector3(),delta=new THREE.Quaternion();
  const fit=()=>{if(!model||!head)return;const r=h.getBoundingClientRect();if(r.width<2||r.height<2)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
   let distance:number;
   if(config.current.closeup){head.getWorldPosition(center);center.y+=.11;distance=Math.max(.66,.50/camera.aspect);controls.minDistance=.38;controls.maxDistance=2.0;}
   else{box.setFromObject(model);box.getCenter(center);box.getSize(size);distance=Math.max(size.y,size.x/camera.aspect)/(2*Math.tan(THREE.MathUtils.degToRad(17.5)))*1.10;controls.minDistance=1;controls.maxDistance=6;}
   controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,0,distance));camera.lookAt(center);controls.update();controls.saveState();dirty=true;
  };
  const resize=()=>{const r=h.getBoundingClientRect();if(r.width<2||r.height<2)return;renderer.setSize(r.width,r.height,false);fit();dirty=true;};const observer=new ResizeObserver(resize);observer.observe(h);resize();
  const pointer=(e:PointerEvent)=>{if(config.current.pose!=="follow"||config.current.reduced)return;const r=h.getBoundingClientRect();mx=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width*.35)));my=Math.max(-1,Math.min(1,(r.top+r.height/2-e.clientY)/(r.height*.4)));};
  const leave=()=>{mx=0;my=0;};h.addEventListener("pointermove",pointer,{passive:true});h.addEventListener("pointerleave",leave);window.addEventListener("blur",leave);
  const disposeModel=(root:THREE.Object3D)=>{const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const mat of Array.isArray(o.material)?o.material:[o.material]){materials.add(mat);for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value);}}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());};
  (async()=>{try{
   const response=await fetch(base+"/n7-mpfb-v1.glb",{signal:controller.signal});if(!response.ok)throw Error("model_http");const reader=response.body!.getReader(),parts:Uint8Array[]=[];const total=Number(response.headers.get("content-length"));let loaded=0,reported=0;
   for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);loaded+=value.length;if(performance.now()-reported>200){reported=performance.now();config.current.onProgress(total?Math.min(95,Math.round(loaded/total*95)):0);}}
   const bytes=new Uint8Array(loaded);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer,base+"/");if(disposed){disposeModel(gltf.scene);return;}
   model=gltf.scene;scene.add(model);model.traverse(o=>{if(o instanceof THREE.Mesh){meshes.push(o);o.frustumCulled=false;if(o.morphTargetDictionary)morphs.push(o);for(const mat of Array.isArray(o.material)?o.material:[o.material])if(mat instanceof THREE.MeshStandardMaterial&&!original.has(mat))original.set(mat,{color:mat.color.clone(),emissive:mat.emissive.clone(),metalness:mat.metalness,roughness:mat.roughness,intensity:mat.emissiveIntensity});}});
   head=model.getObjectByName("Head");if(!head)throw Error("head_bone_missing");headRest=head.quaternion.clone();model.updateMatrixWorld(true);fit();
   let bones=0;model.traverse(o=>{if(o instanceof THREE.Bone)bones++;});box.setFromObject(model);box.getSize(size);h.dataset.bones=String(bones);h.dataset.depth=size.z.toFixed(4);h.dataset.morphs=String(new Set(morphs.flatMap(m=>Object.keys(m.morphTargetDictionary||{}))).size);h.dataset.asset="rigged-glb";h.dataset.ready="true";config.current.onProgress(100);config.current.onReady();dirty=true;
  }catch(e){if(!disposed&&(e as Error).name!=="AbortError")config.current.onError("Δεν φορτώθηκε το μοντέλο 3D. Δοκίμασε ανανέωση της σελίδας.");}})();
  const morph=(name:string,value:number)=>{for(const m of morphs){const i=m.morphTargetDictionary?.[name];if(i!==undefined&&m.morphTargetInfluences)m.morphTargetInfluences[i]=value;}};
  const draw=(now:number)=>{
   if(disposed)return;const c=config.current,dt=Math.min(100,last?now-last:16);last=now;
   if(model&&head&&headRest){
    const rootYaw=c.pose==="profile"?Math.PI/2:c.pose==="back"?Math.PI:0;model.rotation.y=rootYaw;
    if(lastPose!==c.pose||lastClose!==c.closeup){lastPose=c.pose;lastClose=c.closeup;model.updateMatrixWorld(true);fit();}
    controls.enabled=c.pose==="orbit";const cameraChanged=controls.update();
    let x=0,y=0;if(!c.reduced){if(c.pose==="follow"){x=mx;y=my;}else if(c.pose==="auto"){x=Math.sin(now/2700);y=Math.sin(now/3400)*.65;}}
    const budget=Math.max(1,Math.hypot(x,y)),follow=c.reduced?1:1-Math.exp(-dt/100);headYaw+=(x*.48/budget-headYaw)*follow;headPitch+=(y*.22/budget-headPitch)*follow;if(Math.abs(headYaw)<.00001)headYaw=0;if(Math.abs(headPitch)<.00001)headPitch=0;
    delta.setFromEuler(new THREE.Euler(-headPitch,headYaw,0,"YXZ"));head.quaternion.copy(headRest).multiply(delta);
    const cycle=now%4700;const blink=c.blink>=0?c.blink:!c.reduced&&cycle<230?Math.sin(cycle/230*Math.PI)*.97:0;
    const signal=c.phase==="speaking"&&!c.reduced?Math.max(0,readVoiceSignal(now)):0;const jaw=c.phase==="speaking"?signal*.72:c.jaw;
    morph("eyeBlinkLeft",blink);morph("eyeBlinkRight",blink);morph("jawOpen",jaw);morph("mouthSmileLeft",c.smile?.4:0);morph("mouthSmileRight",c.smile?.4:0);morph("browInnerUp",c.phase==="thinking"&&!c.reduced?.10:0);
    if(lastStyle!==c.n7){lastStyle=c.n7;original.forEach((old,mat)=>{mat.color.copy(old.color);mat.emissive.copy(old.emissive);mat.metalness=old.metalness;mat.roughness=old.roughness;mat.emissiveIntensity=old.intensity;if(c.n7){if(mat.name.includes("body")){mat.color.set("#5b8fd2");mat.metalness=.16;mat.roughness=.58;mat.emissive.set("#033247");mat.emissiveIntensity=.08;}else if(mat.name.includes("ponytail")){mat.color.set("#b5dbff");mat.emissive.set("#07374b");mat.emissiveIntensity=.10;}else if(mat.name.includes("casualsuit")){mat.color.set("#244e63");}}});dirty=true;}
    const signature=[rootYaw,headYaw,headPitch,blink,jaw,c.smile?1:0,c.phase==="thinking"?1:0].map(n=>n.toFixed(4)).join(",");
    if(dirty||cameraChanged||signature!==lastSignature){model.updateMatrixWorld(true);renderer.render(scene,camera);lastSignature=signature;dirty=false;}
    h.dataset.rootYaw=rootYaw.toFixed(4);h.dataset.headYaw=headYaw.toFixed(4);h.dataset.headPitch=headPitch.toFixed(4);h.dataset.blink=blink.toFixed(4);h.dataset.jaw=jaw.toFixed(4);h.dataset.phase=c.phase;h.dataset.view=c.closeup?"head":"body";
   }
   raf=requestAnimationFrame(draw);
  };raf=requestAnimationFrame(draw);
  return()=>{disposed=true;controller.abort();cancelAnimationFrame(raf);observer.disconnect();controls.dispose();h.removeEventListener("pointermove",pointer);h.removeEventListener("pointerleave",leave);window.removeEventListener("blur",leave);if(model)disposeModel(model);renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div ref={host} role="img" aria-label="N7 πραγματικό 3D avatar" style={{width:"100%",height:"100%",minHeight:0,touchAction:"none"}}/>;
}
