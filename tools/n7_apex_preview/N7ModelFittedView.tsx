"use client";
import {useEffect,useRef} from "react";
import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {N7_HUMANOID_REFERENCE} from "./N7HumanoidReference";
import {readVoiceSignal} from "./N7VoiceSignal";

// The owner's 3D model adapted to the approved N7 (prepare_model_fitted.py):
// its outline is fitted to the approved figure, the approved picture is
// projected onto the front of the real geometry, and the sides and back
// continue in the same light-line style from the model's own texture. A
// chest -> neck -> skull bone chain is added here so the whole head turns and
// nods in true 3D. Separate test page; the Humanoid renderer is unchanged.
export type FittedView="front"|"three-quarter"|"profile"|"back"|"follow"|"auto";
export type FittedMood="idle"|"listening"|"thinking"|"speaking";
type Props={view:FittedView;mood:FittedMood;reduced:boolean;onReady:()=>void;onError:(s:string)=>void;onProgress:(n:number)=>void};
const folder=N7_HUMANOID_REFERENCE.slice(0,N7_HUMANOID_REFERENCE.lastIndexOf("/")+1);
export const FITTED_URL=folder+"n7-model-fitted-v1.glb";
const ART=[N7_HUMANOID_REFERENCE,folder+"n7-mood-listening-v1.webp",folder+"n7-mood-thinking-v1.webp",folder+"n7-mood-speaking-v1.webp"];
const MOODS:FittedMood[]=["idle","listening","thinking","speaking"];
// Picture units (1 = 1 pixel of the approved 320x480 figure), y up = -row.
const CHEST=new THREE.Vector3(0,-300,-10),NECK=new THREE.Vector3(0,-252,-8),SKULL=new THREE.Vector3(0,-168,-6);
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
  const uniforms={art:{value:[null,null,null,null] as (THREE.Texture|null)[]},own:{value:null as THREE.Texture|null},mood:{value:0},from:{value:0},age:{value:1},level:{value:0},speaking:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,
   vertexShader:`
    #include <common>
    #include <skinning_pars_vertex>
    attribute vec3 rest;attribute vec3 restNormal;
    varying vec2 artUV;varying vec2 ownUV;varying float facing;varying float rimV;
    void main(){
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      // The approved picture is pinned to the surface at rest, so it turns with the head.
      artUV=vec2((rest.x+160.)/320.,(-rest.y)/480.);
      ownUV=uv;
      facing=restNormal.z;
      vec4 mv=modelViewMatrix*vec4(transformed,1.);
      vec3 n=normalize(normalMatrix*objectNormal);
      rimV=1.-abs(n.z);
      gl_Position=projectionMatrix*mv;
    }`,
   fragmentShader:`
    uniform sampler2D art[4];uniform sampler2D own;uniform float mood;uniform float from;uniform float age;uniform float level;uniform float speaking;
    varying vec2 artUV;varying vec2 ownUV;varying float facing;varying float rimV;
    vec3 pick(float m){vec2 q=clamp(artUV,0.,1.);
      if(m<.5)return texture2D(art[0],q).rgb;if(m<1.5)return texture2D(art[1],q).rgb;if(m<2.5)return texture2D(art[2],q).rgb;
      return mix(texture2D(art[0],q).rgb,texture2D(art[3],q).rgb,.32+.68*level);}
    void main(){
      // Mood change blooms out of the face, as in the Humanoid.
      float d=distance(artUV*vec2(320.,480.),vec2(160.,150.));
      float b=smoothstep(d-28.,d+28.,age*430.);
      vec3 front=mix(pick(from),pick(mood),b);
      // Sides and back: the model's own bright streaks become thin N7 lines.
      // Only the crest of each streak is kept (its edges are cut by the local
      // texture slope), so the lines stay thin; a faint glow keeps the volume.
      vec3 t=texture2D(own,ownUV).rgb;float l=max(max(t.r,t.g),t.b);
      vec2 px=vec2(1./2048.);
      float ln=max(max(texture2D(own,ownUV+vec2(px.x,0.)).r,texture2D(own,ownUV+vec2(px.x,0.)).b),texture2D(own,ownUV+vec2(px.x,0.)).g);
      float lu=max(max(texture2D(own,ownUV+vec2(0.,px.y)).r,texture2D(own,ownUV+vec2(0.,px.y)).b),texture2D(own,ownUV+vec2(0.,px.y)).g);
      float slope=length(vec2(ln-l,lu-l))*40.;
      float line=smoothstep(.84,.97,l)*(1.-smoothstep(.35,1.,slope)*.75);
      bool warm=t.r>t.b*1.2&&t.r>.25;
      vec3 side=(warm?vec3(1.,.60,.14):vec3(.20,.78,1.))*line*.85+vec3(.02,.09,.13)*smoothstep(.2,.8,l);
      float w=smoothstep(.18,.55,facing);
      vec3 col=mix(side,front,w);
      // A thin cyan contour where the surface turns away, like the drawn outline.
      col+=vec3(.25,.80,1.)*pow(rimV,5.)*.55*(1.-w*.6);
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
   const own=(source.material as THREE.MeshStandardMaterial).map;if(own){textures.push(own);uniforms.own.value=own;}
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
   Object.assign(h.dataset,{ready:"true",asset:"n7-model-fitted-v1",rig:"added-chest-neck-skull",style:"approved-art-projected",triangles:String((geometry.index?geometry.index.count:count)/3),loadMs:(performance.now()-t0).toFixed(0)});
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
