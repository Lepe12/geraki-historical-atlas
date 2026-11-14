import * as THREE from "three";

// APEX Stage 5: the approved artwork is projected once, from the front, onto
// a rounded head volume (face, skull/hair and neck depth). That volume is then
// moved only by a real two-joint chain -- neck base and skull base -- with
// linear-blend skinning along the neck. No per-pixel image warping: every head
// point is carried by rigid joint rotations (yaw, pitch, roll); the shoulders
// are not skinned at all. Orthographic projection, so the head never grows.
// The approved image is untouched at rest. No eyes or facial features exist.
export type GuideFrame={turn:number;pitch?:number;roll?:number;talk?:number;breath?:number;assembly?:number;baseMood?:number;states?:number[];ages?:number[];ignition?:number;time?:number;voiceLevel?:number};
// `scale` only raises the raster resolution (second face option); geometry,
// joints and limits stay in the same 320x480 layout units.
// `faceRelief` 0 keeps the approved N7 volume exactly. 1 is for a realistic
// face (H01): eyes, nose and mouth sit on a nearly flat plate that turns as
// one piece, and the curvature moves out to the sides under the hair.
// `moodArt` (optional): the owner's approved Listening, Thinking and Speaking
// pictures, aligned to the idle frame. When given, each mood shows its own
// picture instead of a colour variation computed from the idle.
export function createHeadSurface(image:HTMLCanvasElement,scale=1,faceRelief=0,moodArt?:HTMLCanvasElement[]) {
  const renderer=new THREE.WebGLRenderer({alpha:false,antialias:false,depth:true,preserveDrawingBuffer:true});
  renderer.setSize(Math.round(320*scale),Math.round(480*scale),false);renderer.setPixelRatio(1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.NoToneMapping;
  const texture=new THREE.Texture(image);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.flipY=false;texture.generateMipmaps=false;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  const geometry=new THREE.BufferGeometry();
  const sources:number[]=[],positions:number[]=[],indices:number[]=[];
  // Preserve every 4px vertex that can move. Flat regions need no subdivisions:
  // they remain part of this same textured surface, not a cached body underlay.
  const xs=[0,32,...Array.from({length:65},(_,i)=>48+i*3.5),320];
  const ys=[...Array.from({length:66},(_,i)=>i*4),280,320,360,400,440,480];
  for(const y of ys) for(const x of xs){sources.push(x,y);positions.push(x,y,0);}
  for(let y=0;y<ys.length-1;y++) for(let x=0;x<xs.length-1;x++){
    const i=y*xs.length+x;indices.push(i,i+1,i+xs.length,i+1,i+xs.length+1,i+xs.length);
  }
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("source",new THREE.Float32BufferAttribute(sources,2));
  geometry.setIndex(indices);
  const material=new THREE.ShaderMaterial({
    uniforms:{turn:{value:0},pitch:{value:0},neckMatrix:{value:new THREE.Matrix4()},headMatrix:{value:new THREE.Matrix4()},faceRelief:{value:faceRelief},talk:{value:0},useArt:{value:moodArt?.length===3?1:0},artListening:{value:null as THREE.Texture|null},artThinking:{value:null as THREE.Texture|null},artSpeaking:{value:null as THREE.Texture|null},artwork:{value:texture},breath:{value:0},opacity:{value:1},
      baseMood:{value:0},states:{value:[0,0,0,0]},ages:{value:[0,0,0,0]},count:{value:0},ignition:{value:0},time:{value:0},voiceLevel:{value:-1}},
    // Depth test on the head surface only: when the deeper face turns over the
    // far cheek and hair, the nearer surface wins instead of drawing order.
    depthTest:true,depthWrite:true,side:THREE.DoubleSide,toneMapped:false,transparent:true,
    vertexShader:`
    attribute vec2 source;
    uniform float turn;
    uniform float pitch;
    uniform float breath;
    uniform mat4 neckMatrix;
    uniform mat4 headMatrix;
    uniform float faceRelief;
    varying vec2 texUV;
    varying float shade;
    varying float rim;
    float dome(vec2 p,vec2 c,vec2 r,float d){
      float rho=min(1.,length((p-c)/r));
      return d*cos(rho*1.5707963);
    }
    float smax(float a,float b){return .5*(a+b+sqrt((a-b)*(a-b)+36.));}
    // Rounded rest volume measured on the approved 320x480 artwork:
    // face oval, skull with hair, and the neck column under the chin.
    float restDepth(vec2 tile){
      float face=dome(tile,vec2(160.,138.),vec2(66.,92.),mix(96.,64.,faceRelief));
      float skull=dome(tile,vec2(160.,105.),vec2(96.,102.),mix(72.,40.,faceRelief));
      float plateRho=min(1.,length((tile-vec2(160.,140.))/vec2(72.,98.)));
      face=mix(face,58.*(1.-pow(plateRho,3.0)),faceRelief);
      float neck=28.*cos(min(1.,abs(tile.x-160.)/30.)*1.5707963)*smoothstep(170.,200.,tile.y);
      return smax(smax(face,skull),neck)-6.;
    }
    void main(){
      vec2 tile=source;
      float depth=restDepth(tile);
      // Surface normal of the volume (layout y points down). Used only for
      // light that changes with the pose, so the rest frame is untouched.
      vec3 normal=normalize(vec3(restDepth(tile-vec2(3.,0.))-restDepth(tile+vec2(3.,0.)),restDepth(tile-vec2(0.,3.))-restDepth(tile+vec2(0.,3.)),6.));
      vec4 rest=vec4(tile.x,tile.y,depth,1.);

      // Skin weights. The skull, face, jaw and loose hair are fully bound to
      // the head joint. The neck column blends head -> neck -> fixed shoulders.
      float lateral=smoothstep(mix(30.,36.,faceRelief),mix(46.,50.,faceRelief),abs(tile.x-160.));
      // With H01 the shoulder lines rise higher beside the neck, so the loose
      // hair there lets go earlier and the raised shoulders stay fixed.
      float looseFrom=mix(210.,204.,faceRelief),looseTo=mix(232.,217.,faceRelief);
      // APEX step 5: the head turns around a fixed neck. Everything above the
      // drawn jaw line is carried rigidly by the head joint; the neck column
      // under the jaw stays still, so its lines never bend or break. The jaw
      // is measured on the artwork: chin at row 203 (N7) / 199 (H01).
      float chinY=mix(203.,199.,faceRelief),jawK=mix(.0275,.0215,faceRelief);
      float jaw=chinY-jawK*(tile.x-160.)*(tile.x-160.);
      float wCentre=1.-smoothstep(jaw+2.,jaw+14.,tile.y);
      float wLoose=1.-smoothstep(looseFrom,looseTo,tile.y);
      float wHead=mix(wCentre,wLoose,lateral);
      float wNeck=wHead;
      wNeck=max(wNeck,wHead);
      vec3 skinned=rest.xyz*(1.-wNeck)+(neckMatrix*rest).xyz*(wNeck-wHead)+(headMatrix*rest).xyz*wHead;
      vec2 p=skinned.xy;

      // The APEX breathing effect operates below the neck only.
      float chest=exp(-pow((tile.y-320.)/94.,2.))*smoothstep(208.,252.,tile.y)*(1.-smoothstep(420.,470.,tile.y));
      p.x=160.+(p.x-160.)*(1.+breath*.006*chest);
      p.y-=breath*.9*chest;

      // APEX step 5: shading completes the depth illusion. The rest normal is
      // carried by the same joints; dots that turn away darken and at a hard
      // turn the far side falls into clean shadow, while the near silhouette
      // brightens into a glowing profile line. Everything is relative to the
      // rest normal, so at rest the front view is the untouched picture.
      vec3 posedNormal=normalize(normal*(1.-wNeck)+mat3(neckMatrix)*normal*(wNeck-wHead)+mat3(headMatrix)*normal*wHead);
      float angle=clamp(max(abs(turn),abs(pitch)),0.,1.);
      // A surface facing the viewer loses a little light on any turn; only the
      // extra loss beyond that marks the side truly turning away.
      vec3 front=vec3(0.,0.,1.);
      float frontZ=normalize(front*(1.-wNeck)+mat3(neckMatrix)*front*(wNeck-wHead)+mat3(headMatrix)*front*wHead).z;
      float away=max(0.,normal.z-posedNormal.z-(1.-frontZ));
      float toward=max(0.,posedNormal.z-normal.z);
      float side=clamp(abs(tile.x-160.)/96.,0.,1.);
      shade=clamp(1.-away*3.5*wNeck,.55,1.);
      float lowered=clamp(-pitch,0.,1.)*smoothstep(150.,205.,tile.y)*wHead;
      shade*=1.-.18*lowered;
      // Near-side profile line: strongest on the steep outer rim of the volume.
      float steep=1.-normal.z;
      rim=wHead*angle*smoothstep(.05,.45,steep)*smoothstep(.0,.10,toward)*(.55+.75*side);
      texUV=tile/vec2(320.,480.);
      gl_Position=vec4(p.x/160.-1.,1.-p.y/240.,-skinned.z/400.,1.);
    }
  `,
    fragmentShader:`
    precision highp float;
    uniform sampler2D artwork;
    varying vec2 texUV;
    varying float shade;
    varying float rim;
    uniform float opacity;
    uniform float baseMood;
    uniform float states[4];
    uniform float ages[4];
    uniform int count;
    uniform float ignition;
    uniform float time;
    uniform float voiceLevel;
    uniform float talk;
    uniform float faceRelief;
    uniform float useArt;
    uniform sampler2D artListening;
    uniform sampler2D artThinking;
    uniform sampler2D artSpeaking;
    vec3 palette(vec3 c,float mood){
      if(useArt>.5&&mood>.5){
        // The owner's own mood picture, sampled at this same point of the figure,
        // so the dots never move for a mood change: only what they show changes.
        if(mood<1.5)return texture2D(artListening,texUV).rgb;
        if(mood<2.5)return texture2D(artThinking,texUV).rgb;
        // Speaking follows the real playback level: the face brightens with the
        // voice and settles back toward the idle picture in quiet pauses.
        float level=voiceLevel<0.?(.78+.22*sin(time*1000./115.)):(.32+.68*voiceLevel);
        return mix(c,texture2D(artSpeaking,texUV).rgb,level);
      }
      vec3 s=linearToOutputTexel(vec4(c,1.)).rgb;
      float d=distance(texUV*vec2(320.,480.),vec2(160.,150.));
      // Soft mask: mood light follows the drawn lines and fades with them, so
      // no flat haze or hard-edged patches appear over the empty dark face.
      float visible=smoothstep(5./255.,34./255.,max(max(s.r,s.g),s.b));
      bool cyan=s.b>s.r*1.15&&s.g>s.r*1.05;
      bool amber=s.r>s.g*1.15&&s.g>s.b*1.2;
      if(mood>.5&&mood<1.5){
        if(cyan)s=vec3(s.r*.92,s.g*1.18+16./255.*visible,s.b*1.25+24./255.*visible);
        if(amber)s*=vec3(.86,.88,.92);
      }else if(mood>1.5&&mood<2.5){
        // Head-lit, body slightly dimmed, blended across the neck: no seam.
        float upper=1.-smoothstep(196.,236.,texUV.y*480.);
        float k=max(0.,1.-d/145.)*upper;
        s+=(cyan?vec3(34.,72.,92.):vec3(22.,34.,42.))*k*visible/255.;
        if(amber)s+=vec3(28.,12.,4.)*k*visible/255.;
        s*=mix(vec3(.90,.94,.97),vec3(1.),upper);
      }else if(mood>2.5){
        float k=max(0.,1.-d/92.)*(voiceLevel<0.?(.68+.32*sin(time*1000./115.)):voiceLevel);
        s+=vec3(135.,70.,-35.)*k*visible/255.;
        if(cyan)s*=vec3(1.,1.08,1.12);
      }
      s=clamp(s,0.,1.);
      return mix(s/12.92,pow((s+.055)/1.055,vec3(2.4)),step(vec3(.04045),s));
    }
    void main(){
      vec4 c=texture2D(artwork,texUV);
      vec3 color=palette(c.rgb,baseMood);
      float d=distance(texUV*vec2(320.,480.),vec2(160.,150.));
      for(int i=0;i<4;i++){
        if(i<count){
          float radius=ages[i]*430.;
          float blend=smoothstep(d-28.,d+28.,radius);
          color=mix(color,palette(c.rgb,states[i]),blend);
          float edge=max(0.,1.-abs(d-radius)/16.)*step(ages[i],.999);
          color+=c.rgb*vec3(.06,.15,.20)*edge;
        }
      }
      color+=c.rgb*vec3(.50,.25,.03)*ignition*exp(-pow(d/38.,2.));
      // Speaking (owner reference: MIRA): a soft vertical light inside the
      // dark, featureless face, carried by the real playback level. It lights
      // only the empty face; drawn lines and the outline are left as they are.
      if(talk>0.){
        vec2 q=texUV*vec2(320.,480.);
        float level=voiceLevel<0.?(.55+.45*sin(time*6.5)):voiceLevel;
        float inner=exp(-pow((q.x-160.)/7.5,2.)-pow((q.y-138.)/36.,2.));
        float veil=exp(-pow((q.x-160.)/30.,2.)-pow((q.y-138.)/52.,2.));
        float dark=1.-smoothstep(.10,.45,max(max(c.r,c.g),c.b));
        // The approved Speaking picture already carries its own face light.
        float sheen=talk*level*(1.-.8*faceRelief)*(1.-.6*useArt)*dark*(1.9*inner+.12*veil);
        color+=vec3(.72,.93,1.)*sheen;
      }
      // Shadow changes light, never coverage. Glow only modulates source color.
      gl_FragColor=vec4(color*shade+color*vec3(.55,.94,1.)*rim,c.a*opacity);
      #include <colorspace_fragment>
    }
  `
  });
  const artTextures=(moodArt?.length===3?moodArt:[]).map(canvas=>{const tex=new THREE.Texture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.flipY=false;tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;return tex;});
  if(artTextures.length===3){material.uniforms.artListening.value=artTextures[0];material.uniforms.artThinking.value=artTextures[1];material.uniforms.artSpeaking.value=artTextures[2];}
  const scene=new THREE.Scene();
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  // Galaxy assembly (owner reference: MIRA). A light core is born at the
  // heart, matter spirals out of it as a rotating two-armed galaxy, the galaxy
  // grows to the height of the figure and every grain then settles on its own
  // place in the approved artwork, leaving a dotted silhouette. The full
  // figure is revealed after the burst (see N7GuideView). Same sampled grains,
  // same colours: no new shape is drawn.
  const CORE_X=160,CORE_Y=297;
  const particleGeometry=new THREE.BufferGeometry();
  const anchors:number[]=[],seeds:number[]=[],jitter:number[]=[];
  let sample=image;
  if(image.width!==320||image.height!==480){sample=document.createElement("canvas");sample.width=320;sample.height=480;sample.getContext("2d")!.drawImage(image,0,0,320,480);}
  const px=sample.getContext("2d")!.getImageData(0,0,320,480).data;
  for(let y=0;y<480;y+=2)for(let x=0;x<320;x+=2){
    const i=(y*320+x)*4;
    if(px[i]+px[i+1]+px[i+2]<21||px[i+3]<8)continue;
    const hash=((x*73856093)^(y*19349663))>>>0;
    anchors.push(x+1,y+1,0);
    seeds.push((hash%10007)/10007,((hash>>>8)%9973)/9973);
    jitter.push((hash%2001-1000)/1000);
  }
  particleGeometry.setAttribute("position",new THREE.Float32BufferAttribute(anchors,3));
  particleGeometry.setAttribute("seed",new THREE.Float32BufferAttribute(seeds,2));
  particleGeometry.setAttribute("jitter",new THREE.Float32BufferAttribute(jitter,1));
  const particleMaterial=new THREE.ShaderMaterial({
    uniforms:{artwork:{value:texture},progress:{value:0},opacity:{value:1},pointSize:{value:2*scale}},
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
    vertexShader:`
      attribute vec2 seed;attribute float jitter;
      uniform float progress;uniform float pointSize;varying vec2 sampleUV;varying float alpha;varying float settle;
      const vec2 core=vec2(${CORE_X}.,${CORE_Y}.);
      void main(){
        float r=sqrt(seed.x);                       // place in the galaxy, inner first
        float born=.06+.30*r;                        // grains leave the core in order
        float life=clamp((progress-born)/.10,0.,1.);
        // Two arms, wound tighter toward the centre, the whole disc turning.
        float arm=step(.5,fract(seed.y*7.31))*3.14159;
        float spread=mix(8.,150.,smoothstep(.06,.56,progress));
        // Stardust, not a solid band: each grain has its own scatter around its arm.
        float scatter=fract(seed.y*31.7),drift=fract(seed.x*57.3)-.5;
        float radius=r*spread*(.72+.56*scatter);
        float angle=arm+r*5.2-progress*11.+jitter*.55+drift*1.4*(1.-r*.5);
        // The disc stands up as it grows, from a flat swirl to the height of the figure.
        float tall=mix(.55,1.55,smoothstep(.20,.60,progress));
        vec2 swirl=core+vec2(cos(angle)*radius*.78,sin(angle)*radius*tall*.62-radius*.32*smoothstep(.25,.6,progress))+vec2(drift,scatter-.5)*6.*r;
        // Then each grain settles on its own place, top of the figure last.
        float order=clamp((480.-position.y)/480.,0.,1.)*.10+fract(seed.y*13.7)*.06;
        settle=smoothstep(.52+order,.80+order,progress);
        vec2 p=mix(swirl,position.xy,settle);
        gl_Position=vec4(p.x/160.-1.,1.-p.y/240.,0.,1.);
        gl_PointSize=pointSize*(1.+.25*(1.-settle));
        // Thousands of grains add up: faint while flying, a sparse lit dot once settled.
        float twinkle=.6+.4*fract(seed.x*91.7+progress*13.);
        alpha=life*mix(.11,.42,settle)*twinkle*(1.-.45*smoothstep(.86,.95,progress));
        sampleUV=position.xy/vec2(320.,480.);
      }`,
    fragmentShader:`
      uniform sampler2D artwork;uniform float opacity;
      varying vec2 sampleUV;varying float alpha;varying float settle;
      void main(){
        if(alpha<.01)discard;
        float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
        vec2 tileUVOffset=(vec2(gl_PointCoord.x,1.-gl_PointCoord.y)-.5)*2./vec2(320.,480.);
        vec4 c=texture2D(artwork,sampleUV+tileUVOffset);
        // Star-white with a cyan cast while flying; the artwork's own colour once settled.
        vec3 star=vec3(.62,.90,1.);
        vec3 col=mix(star,max(c.rgb,star*.35),settle);
        gl_FragColor=vec4(col,alpha*opacity*(1.-d*d*.6));
        #include <colorspace_fragment>
      }`
  });
  const particles=new THREE.Points(particleGeometry,particleMaterial);particles.frustumCulled=false;scene.add(particles);
  // The core: a soft light at the heart that is born first and pulses.
  const glowGeometry=new THREE.BufferGeometry();glowGeometry.setAttribute("position",new THREE.Float32BufferAttribute([CORE_X,CORE_Y,0],3));
  const glowMaterial=new THREE.ShaderMaterial({uniforms:{strength:{value:1},size:{value:1}},transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float size;void main(){gl_Position=vec4(position.x/160.-1.,1.-position.y/240.,0.,1.);gl_PointSize=${(150*scale).toFixed(1)}*size;}`,
    fragmentShader:`uniform float strength;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float halo=pow(1.-d,3.)*.55;float ring=exp(-pow((d-.10)/.035,2.))*.9;float spark=exp(-d*d/.004);gl_FragColor=vec4(vec3(.62,.90,1.)*(halo+ring)+vec3(1.)*spark,clamp(halo+ring+spark,0.,1.)*strength);}`});
  const glow=new THREE.Points(glowGeometry,glowMaterial);glow.frustumCulled=false;scene.add(glow);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
  // Real joint hierarchy: shoulders (fixed) -> neck base -> skull base.
  // Angles are radians; the neck carries 30% and the skull joint 70%.
  // The turning axis runs inside the neck, level with the chin surface, so the
  // chin stays on the neck while the face and the hair behind it turn about it.
  const NECK_BASE=new THREE.Vector3(160,252,18),SKULL_BASE=new THREE.Vector3(160,168,18);
  const neckJoint=new THREE.Object3D(),headJoint=new THREE.Object3D();
  neckJoint.position.copy(NECK_BASE);headJoint.position.copy(SKULL_BASE).sub(NECK_BASE);neckJoint.add(headJoint);
  neckJoint.rotation.order="YXZ";headJoint.rotation.order="YXZ";
  const neckBindInverse=new THREE.Matrix4().makeTranslation(-NECK_BASE.x,-NECK_BASE.y,-NECK_BASE.z);
  const headBindInverse=new THREE.Matrix4().makeTranslation(-SKULL_BASE.x,-SKULL_BASE.y,-SKULL_BASE.z);
  // Only the front of the head exists as approved artwork, so the turn is
  // bounded: at full yaw the outline foreshortens by cos(0.34), under 6%.
  const MAX_YAW=.34,MAX_PITCH=.21,MAX_ROLL=.10;
  const pose=(turn:number,pitch:number,roll:number)=>{
    const budget=Math.max(1,Math.hypot(turn,pitch));
    const yaw=turn/budget*MAX_YAW,nod=pitch/budget*MAX_PITCH,tilt=Math.max(-1,Math.min(1,roll))*MAX_ROLL;
    neckJoint.rotation.set(nod*.3,yaw*.3,tilt*.3);headJoint.rotation.set(nod*.7,yaw*.7,tilt*.7);
    neckJoint.updateMatrixWorld(true);
    material.uniforms.neckMatrix.value.multiplyMatrices(neckJoint.matrixWorld,neckBindInverse);
    material.uniforms.headMatrix.value.multiplyMatrices(headJoint.matrixWorld,headBindInverse);
    return {yaw,nod,tilt,budget};
  };
  const render=(frame:GuideFrame)=>{
    const p=frame.assembly??1;
    const blend=Math.max(0,Math.min(1,(p-.96)/.04));
    mesh.visible=p>=.96;particles.visible=p<1;glow.visible=p<1;
    const posed=pose(frame.turn,frame.pitch||0,frame.roll||0);
    material.uniforms.turn.value=posed.yaw/MAX_YAW;
    material.uniforms.pitch.value=posed.nod/MAX_PITCH;
    material.uniforms.breath.value=frame.breath||0;
    material.uniforms.opacity.value=blend;
    material.uniforms.baseMood.value=frame.baseMood||0;
    material.uniforms.states.value=[...(frame.states||[]),0,0,0,0].slice(0,4);
    material.uniforms.ages.value=[...(frame.ages||[]),0,0,0,0].slice(0,4);
    material.uniforms.count.value=frame.states?.length||0;
    material.uniforms.voiceLevel.value=frame.voiceLevel??-1;
    material.uniforms.talk.value=frame.talk||0;
    material.uniforms.ignition.value=frame.ignition||0;material.uniforms.time.value=frame.time||0;
    particleMaterial.uniforms.progress.value=p;particleMaterial.uniforms.opacity.value=1-blend;
    const born=Math.min(1,p/.06),pulse=.85+.15*Math.sin((frame.time||0)*5.5);
    glowMaterial.uniforms.strength.value=born*(1-blend)*(p<.86?1:Math.max(0,1-(p-.86)/.10));
    glowMaterial.uniforms.size.value=(.35+.65*born)*pulse*(1+.6*Math.max(0,(p-.80)/.10));
    renderer.render(scene,camera);
  };
  return {
    canvas:renderer.domElement,vertices:sources.length/2,particles:anchors.length/3,
    render,draw(turn:number){render({turn});},limits:{yaw:MAX_YAW,pitch:MAX_PITCH,roll:MAX_ROLL},
    dispose(){artTextures.forEach(tex=>tex.dispose());geometry.dispose();material.dispose();particleGeometry.dispose();particleMaterial.dispose();glowGeometry.dispose();glowMaterial.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}
