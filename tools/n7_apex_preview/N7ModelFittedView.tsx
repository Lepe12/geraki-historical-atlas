"use client";
import {useEffect,useRef} from "react";
import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";
import {readVoiceSignal} from "./N7VoiceSignal";

// The owner's 3D model adapted to the approved N7 (prepare_model_fitted.py):
// its front outline is fitted to the approved figure and its depth to the
// approved profile; the approved front, profile and back pictures are
// projected onto the real geometry from their own directions. A
// chest -> neck -> skull bone chain is added here so the whole head turns and
// nods in true 3D. Separate test page; the Humanoid renderer is unchanged.
export type FittedView="front"|"three-quarter"|"profile"|"back"|"follow"|"auto";
export type FittedMood="idle"|"listening"|"thinking"|"speaking";
type Props={view:FittedView;mood:FittedMood;reduced:boolean;onReady:()=>void;onError:(s:string)=>void;onProgress:(n:number)=>void};
const folder=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/")+1);
export const FITTED_URL=folder+"n7-model-fitted-v2.glb";
// The owner's approved profile and back pictures, aligned to the front frame
// (prepare_side_back_art.py). PROFILE_CENTRE: profile column of depth 0.
const SIDE_URL=folder+"n7-art-profile-v1.webp",BACK_URL=folder+"n7-art-back-v1.webp",PROFILE_CENTRE=143.5;
const ART=[N7_HUMANOID_REFERENCE,folder+"n7-mood-listening-v1.webp",folder+"n7-mood-thinking-v1.webp",folder+"n7-mood-speaking-v1.webp"];
const MOODS:FittedMood[]=["idle","listening","thinking","speaking"];
// Picture units (1 = 1 pixel of the approved 320x480 figure), y up = -row.
const CHEST=new THREE.Vector3(0,-300,0),NECK=new THREE.Vector3(0,-252,0),SKULL=new THREE.Vector3(0,-168,0);
const MAX_YAW=.55,MAX_PITCH=.28;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

export default function N7ModelFittedView(props:Props){
 const host=useRef<HTMLDivElement>(null),config=useRef(props);useEffect(()=>{config.current=props;},[props]);
 useEffect(()=>{
  const h=host.current;if(!h)return;
  let disposed=false,raf=0,last=0,yaw=0,pitch=0,vy=0,vp=0,mx=0,my=0,root:THREE.Group|undefined,neck:THREE.Bone|undefined,head:THREE.Bone|undefined;
  let mood=0,from=0,moodStart=-1e9,frames=0,frameSum=0,lastStats=0,turnY=0,turnV=0;
  const textures:THREE.Texture[]=[];
  const controller=new AbortController();
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});}catch{config.current.onError("Ο browser δεν υποστηρίζει προβολή 3D (WebGL).");return;}
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.setClearColor(0x000000,1);
  const pixelRatio=Math.min(devicePixelRatio,1.5);renderer.setPixelRatio(pixelRatio);h.append(renderer.domElement);
  // Like the Humanoid: an opaque black frame screen-blended over the scene.
  Object.assign(renderer.domElement.style,{width:"100%",height:"100%",display:"block",mixBlendMode:"screen"});
  const scene=new THREE.Scene();
  // Orthographic, so the front view is the approved picture's own geometry.
  const camera=new THREE.OrthographicCamera(-160,160,0,-480,-2000,2000);camera.position.set(0,0,1000);camera.lookAt(0,0,0);
  const fit=()=>{const r=h.getBoundingClientRect();if(r.width<2||r.height<2)return;renderer.setSize(r.width,r.height,false);
   const aspect=r.width/r.height,frameW=320,frameH=480,cy=-240;
   let w=frameW,hh=frameH;if(aspect>frameW/frameH)w=frameH*aspect;else hh=frameW/aspect;
   camera.left=-w/2;camera.right=w/2;camera.top=cy+hh/2;camera.bottom=cy-hh/2;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(fit);observer.observe(h);fit();
  const pointer=(e:PointerEvent)=>{const r=h.getBoundingClientRect();mx=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width*.35)));my=Math.max(-1,Math.min(1,(r.top+r.height*.30-e.clientY)/(r.height*.35)));};
  const leave=()=>{mx=0;my=0;};h.addEventListener("pointermove",pointer,{passive:true});h.addEventListener("pointerleave",leave);window.addEventListener("blur",leave);
  const uniforms={art:{value:[null,null,null,null] as (THREE.Texture|null)[]},side:{value:null as THREE.Texture|null},back:{value:null as THREE.Texture|null},mood:{value:0},from:{value:0},age:{value:1},level:{value:0},speaking:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,
   vertexShader:`
    #include <common>
    #include <skinning_pars_vertex>
    attribute vec3 rest;attribute vec3 restNormal;
    varying vec2 artUV;varying vec2 sideUV;varying vec2 backUV;varying vec3 wts;varying float rimV;
    void main(){
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      // The approved picture is pinned to the surface at rest, so it turns with the head.
      // Three of the owner's pictures, each pinned to the surface at rest from
      // its own direction: front (z), sides (x, from the profile), back (-z).
      artUV=vec2((rest.x+160.)/320.,(-rest.y)/480.);
      sideUV=vec2((${PROFILE_CENTRE.toFixed(1)}+rest.z)/320.,(-rest.y)/480.);
      backUV=vec2((160.-rest.x)/320.,(-rest.y)/480.);
      vec3 n=normalize(restNormal);
      // Each picture owns its side; the front dominates wherever the surface
      // still faces the viewer, so no profile or back lines double the front.
      vec3 w=vec3(2.5*pow(max(n.z,0.),4.),pow(abs(n.x),4.),pow(max(-n.z,0.),4.));
      // The face and front of the head always show the approved front picture.
      float faceZone=1.-smoothstep(.85,1.05,length(vec2((rest.x)/62.,(-rest.y-140.)/92.)));
      w.x=mix(w.x*1.6,1.,faceZone*step(.05,n.z));w.y*=1.-faceZone*step(.05,n.z);
      wts=w/max(1e-4,w.x+w.y+w.z);
      vec4 mv=modelViewMatrix*vec4(transformed,1.);
      vec3 vn=normalize(normalMatrix*objectNormal);
      rimV=1.-abs(vn.z);
      gl_Position=projectionMatrix*mv;
    }`,
   fragmentShader:`
    uniform sampler2D art[4];uniform sampler2D side;uniform sampler2D back;uniform float mood;uniform float from;uniform float age;uniform float level;uniform float speaking;
    varying vec2 artUV;varying vec2 sideUV;varying vec2 backUV;varying vec3 wts;varying float rimV;
    vec3 pick(float m){vec2 q=clamp(artUV,0.,1.);
      if(m<.5)return texture2D(art[0],q).rgb;if(m<1.5)return texture2D(art[1],q).rgb;if(m<2.5)return texture2D(art[2],q).rgb;
      return mix(texture2D(art[0],q).rgb,texture2D(art[3],q).rgb,.32+.68*level);}
    void main(){
      // Mood change blooms out of the face, as in the Humanoid.
      float d=distance(artUV*vec2(320.,480.),vec2(160.,150.));
      float b=smoothstep(d-28.,d+28.,age*430.);
      vec3 front=mix(pick(from),pick(mood),b);
      vec3 sideCol=texture2D(side,clamp(sideUV,0.,1.)).rgb;
      // The profile's gold face curve belongs to the face only, not to the hair or neck.
      float sideFace=smoothstep(186.,200.,sideUV.x*320.)*(1.-smoothstep(205.,225.,sideUV.y*480.));
      sideCol=mix(sideCol,vec3(dot(sideCol,vec3(.10,.45,.45)))*vec3(.4,.9,1.1),(1.-sideFace)*step(sideCol.b*1.15,sideCol.r));
      vec3 backCol=texture2D(back,clamp(backUV,0.,1.)).rgb;
      vec3 col=front*wts.x+sideCol*wts.y+backCol*wts.z;
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }`});
  (async()=>{try{
   const t0=performance.now();
   const loader=new THREE.TextureLoader();
   const artTex=await Promise.all(ART.map(url=>loader.loadAsync(url)));
   for(const tex of artTex){tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;tex.minFilter=THREE.LinearFilter;tex.generateMipmaps=false;textures.push(tex);}
   uniforms.art.value=artTex;
   const response=await fetch(FITTED_URL,{signal:controller.signal});if(!response.ok)throw Error("model_http");
   const total=Number(response.headers.get("content-length")),reader=response.body!.getReader(),parts:Uint8Array[]=[];let loaded=0,reported=0;
   for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);loaded+=value.length;if(performance.now()-reported>150){reported=performance.now();config.current.onProgress(total?Math.min(95,Math.round(loaded/total*95)):0);}}
   const bytes=new Uint8Array(loaded);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer,folder);if(disposed)return;
   let source:THREE.Mesh|undefined;gltf.scene.traverse(o=>{if(!source&&o instanceof THREE.Mesh)source=o;});if(!source)throw Error("mesh_missing");
   const [sideTex,backTex]=await Promise.all([SIDE_URL,BACK_URL].map(url=>loader.loadAsync(url)));
   for(const tex of [sideTex,backTex]){tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;tex.minFilter=THREE.LinearFilter;tex.generateMipmaps=false;textures.push(tex);}
   uniforms.side.value=sideTex;uniforms.back.value=backTex;
   (source.material as THREE.MeshStandardMaterial).map?.dispose();
   const geometry=source.geometry.clone();geometry.computeVertexNormals();
   geometry.setAttribute("rest",geometry.attributes.position.clone());geometry.setAttribute("restNormal",geometry.attributes.normal.clone());
   const pos=geometry.attributes.position,count=pos.count,skinIndex=new Uint16Array(count*4),skinWeight=new Float32Array(count*4);
   for(let i=0;i<count;i++){const row=-pos.getY(i),wHead=1-smooth(200,228,row),wNeck=Math.max(wHead,1-smooth(228,258,row));skinIndex.set([0,1,2,0],i*4);skinWeight.set([1-wNeck,wNeck-wHead,wHead,0],i*4);}
   geometry.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skinIndex,4));geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skinWeight,4));
   const chest=new THREE.Bone();chest.position.copy(CHEST);neck=new THREE.Bone();neck.position.copy(NECK).sub(CHEST);head=new THREE.Bone();head.position.copy(SKULL).sub(NECK);
   chest.add(neck);neck.add(head);neck.rotation.order="YXZ";head.rotation.order="YXZ";
   const mesh=new THREE.SkinnedMesh(geometry,material);mesh.frustumCulled=false;mesh.add(chest);mesh.bind(new THREE.Skeleton([chest,neck,head]));
   root=new THREE.Group();root.add(mesh);scene.add(root);
   (source.material as THREE.Material).dispose();
   Object.assign(h.dataset,{ready:"true",asset:"n7-model-fitted-v2",rig:"added-chest-neck-skull",style:"approved-front-profile-back",triangles:String((geometry.index?geometry.index.count:count)/3),loadMs:(performance.now()-t0).toFixed(0)});
   config.current.onProgress(100);config.current.onReady();
  }catch(e){if(!disposed&&(e as Error).name!=="AbortError")config.current.onError("Δεν φορτώθηκε το μοντέλο 3D. Δοκίμασε ανανέωση της σελίδας.");}})();
  const draw=(now:number)=>{
   if(disposed)return;raf=requestAnimationFrame(draw);
   const c=config.current,dt=Math.min(100,last?now-last:16);last=now;
   if(!root||!neck||!head)return;
   // Whole-body view angle (to inspect the real 3D sides), eased.
   const wantTurn=c.view==="three-quarter"?.70:c.view==="profile"?Math.PI/2:c.view==="back"?Math.PI:0;
   const tw=1/160;for(let left=dt;left>0;left-=8){const s=Math.min(8,left);turnV+=(tw*tw*(wantTurn-turnY)-2*tw*turnV)*s;turnY+=turnV*s;}
   if(c.reduced){turnY=wantTurn;turnV=0;}root.rotation.y=turnY;
   let tx=0,ty=0;if(!c.reduced){if(c.view==="follow"){tx=mx;ty=my;}else if(c.view==="auto"){tx=Math.sin(now/2600);ty=Math.sin(now/3300)*.7;}}
   const budget=Math.max(1,Math.hypot(tx,ty)),wantYaw=tx/budget*MAX_YAW,wantPitch=-ty/budget*MAX_PITCH;
   const w=1/110;for(let left=dt;left>0;left-=8){const s=Math.min(8,left);vy+=(w*w*(wantYaw-yaw)-2*w*vy)*s;yaw+=vy*s;vp+=(w*w*(wantPitch-pitch)-2*w*vp)*s;pitch+=vp*s;}
   if(c.reduced){yaw=wantYaw;pitch=wantPitch;vy=vp=0;}
   neck.rotation.set(pitch*.35,yaw*.35,0);head.rotation.set(pitch*.65,yaw*.65,0);
   const want=MOODS.indexOf(c.mood);if(want!==mood){from=mood;mood=want;moodStart=now;}
   uniforms.mood.value=mood;uniforms.from.value=from;uniforms.age.value=c.reduced?1:Math.min(1,(now-moodStart)/1000);
   // Speaking follows the real voice level; without playback (preview button) a gentle pulse.
   const signal=readVoiceSignal(now);
   uniforms.level.value=c.mood!=="speaking"?0:c.reduced?.6:signal<0?.78+.22*Math.sin(now/115):signal;
   const t=performance.now();renderer.render(scene,camera);const cost=performance.now()-t;frames++;frameSum+=dt;
   if(now-lastStats>400){lastStats=now;Object.assign(h.dataset,{headYaw:yaw.toFixed(4),headPitch:pitch.toFixed(4),bodyTurn:turnY.toFixed(3),mood:c.mood,submitMs:cost.toFixed(2),frameMs:(frameSum/frames).toFixed(1)});frames=0;frameSum=0;}
  };raf=requestAnimationFrame(draw);
  return()=>{disposed=true;controller.abort();cancelAnimationFrame(raf);observer.disconnect();h.removeEventListener("pointermove",pointer);h.removeEventListener("pointerleave",leave);window.removeEventListener("blur",leave);
   root?.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});material.dispose();textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div ref={host} role="img" aria-label="N7 3D προσαρμοσμένο" style={{width:"100%",height:"100%",minHeight:0,touchAction:"none"}}/>;
}
