import * as THREE from "three";

// APEX Stage 5: the approved artwork is projected once, from the front, onto
// a rounded head volume (face, skull/hair and neck depth). That volume is then
// moved only by a real two-joint chain -- neck base and skull base -- with
// linear-blend skinning along the neck. No per-pixel image warping: every head
// point is carried by rigid joint rotations (yaw, pitch, roll); the shoulders
// are not skinned at all. Orthographic projection, so the head never grows.
// The approved image is untouched at rest. No eyes or facial features exist.
export type GuideFrame={turn:number;pitch?:number;roll?:number;breath?:number;assembly?:number;baseMood?:number;states?:number[];ages?:number[];ignition?:number;time?:number;voiceLevel?:number};
export function createHeadSurface(image:HTMLCanvasElement) {
  const renderer=new THREE.WebGLRenderer({alpha:false,antialias:false,depth:false,preserveDrawingBuffer:true});
  renderer.setSize(320,480,false);renderer.setPixelRatio(1);
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
    uniforms:{turn:{value:0},pitch:{value:0},neckMatrix:{value:new THREE.Matrix4()},headMatrix:{value:new THREE.Matrix4()},artwork:{value:texture},breath:{value:0},opacity:{value:1},
      baseMood:{value:0},states:{value:[0,0,0,0]},ages:{value:[0,0,0,0]},count:{value:0},ignition:{value:0},time:{value:0},voiceLevel:{value:-1}},
    depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,transparent:true,
    vertexShader:`
    attribute vec2 source;
    uniform float turn;
    uniform float pitch;
    uniform float breath;
    uniform mat4 neckMatrix;
    uniform mat4 headMatrix;
    varying vec2 texUV;
    varying float shade;
    varying float rim;
    float dome(vec2 p,vec2 c,vec2 r,float d){
      float rho=min(1.,length((p-c)/r));
      return d*cos(rho*1.5707963);
    }
    float smax(float a,float b){return .5*(a+b+sqrt((a-b)*(a-b)+36.));}
    void main(){
      vec2 tile=source;
      // Rounded rest volume measured on the approved 320x480 artwork:
      // face oval, skull with hair, and the neck column under the chin.
      float face=dome(tile,vec2(160.,138.),vec2(66.,92.),64.);
      float skull=dome(tile,vec2(160.,105.),vec2(96.,102.),46.);
      float neck=28.*cos(min(1.,abs(tile.x-160.)/30.)*1.5707963)*smoothstep(170.,200.,tile.y);
      float depth=smax(smax(face,skull),neck)-6.;
      vec4 rest=vec4(tile.x,tile.y,depth,1.);

      // Skin weights. The skull, face, jaw and loose hair are fully bound to
      // the head joint. The neck column blends head -> neck -> fixed shoulders.
      float lateral=smoothstep(30.,46.,abs(tile.x-160.));
      float wHead=1.-smoothstep(mix(200.,210.,lateral),mix(226.,232.,lateral),tile.y);
      float wNeck=1.-smoothstep(mix(222.,210.,lateral),mix(256.,232.,lateral),tile.y);
      wNeck=max(wNeck,wHead);
      vec3 skinned=rest.xyz*(1.-wNeck)+(neckMatrix*rest).xyz*(wNeck-wHead)+(headMatrix*rest).xyz*wHead;
      vec2 p=skinned.xy;

      // The APEX breathing effect operates below the neck only.
      float chest=exp(-pow((tile.y-320.)/94.,2.))*smoothstep(208.,252.,tile.y)*(1.-smoothstep(420.,470.,tile.y));
      p.x=160.+(p.x-160.)*(1.+breath*.006*chest);
      p.y-=breath*.9*chest;

      // Same-artwork surface; the side turning away falls into shadow, the
      // near outer edge picks up a restrained profile line. Light only:
      // no alpha suppression, no cutouts, no added features.
      float normalizedX=clamp((tile.x-160.)/92.,-1.,1.);
      float farSide=max(0., sign(turn)*normalizedX);
      float nearSide=max(0.,-sign(turn)*normalizedX);
      float angle=clamp(abs(turn),0.,1.);
      shade=1.-wHead*angle*(.02+.22*farSide);
      float lowered=clamp(-pitch,0.,1.)*smoothstep(150.,205.,tile.y)*wHead;
      shade*=1.-.18*lowered;
      float edge=smoothstep(.55,.98,abs(normalizedX));
      rim=wHead*angle*nearSide*edge*.16;
      texUV=tile/vec2(320.,480.);
      gl_Position=vec4(p.x/160.-1.,1.-p.y/240.,0.,1.);
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
    vec3 palette(vec3 c,float mood){
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
      // Shadow changes light, never coverage. Glow only modulates source color.
      gl_FragColor=vec4(color*shade+color*vec3(.55,.94,1.)*rim,c.a*opacity);
      #include <colorspace_fragment>
    }
  `
  });
  const scene=new THREE.Scene();
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  const particleGeometry=new THREE.BufferGeometry();
  const anchors:number[]=[],delays:number[]=[],jitter:number[]=[];
  const px=image.getContext("2d")!.getImageData(0,0,320,480).data;
  for(let y=0;y<480;y+=2)for(let x=0;x<320;x+=2){
    const i=(y*320+x)*4;
    if(px[i]+px[i+1]+px[i+2]<21||px[i+3]<8)continue;
    const hash=((x*73856093)^(y*19349663))>>>0;
    anchors.push(x+1,y+1,0);
    delays.push(Math.min(.76,x/320*.60+(y<168?.08:0)+(y<168&&x>105&&x<215?.10:0)));
    jitter.push((hash%2001-1000)/1000);
  }
  particleGeometry.setAttribute("position",new THREE.Float32BufferAttribute(anchors,3));
  particleGeometry.setAttribute("delay",new THREE.Float32BufferAttribute(delays,1));
  particleGeometry.setAttribute("jitter",new THREE.Float32BufferAttribute(jitter,1));
  const particleMaterial=new THREE.ShaderMaterial({
    uniforms:{artwork:{value:texture},progress:{value:0},opacity:{value:1}},
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
    vertexShader:`
      attribute float delay;attribute float jitter;
      uniform float progress;varying vec2 sampleUV;varying float alpha;
      void main(){
        float local=clamp((progress-delay)/.20,0.,1.);
        float e=local*local*(3.-2.*local),inv=1.-e;
        vec2 control=vec2(105.+position.x*.28+jitter*10.,38.-max(0.,160.-position.y)*.04-abs(jitter)*8.);
        vec2 p=inv*inv*vec2(15.,415.)+2.*inv*e*control+e*e*position.xy;
        gl_Position=vec4(p.x/160.-1.,1.-p.y/240.,0.,1.);
        gl_PointSize=2.;alpha=min(1.,local*3.);
        sampleUV=position.xy/vec2(320.,480.);
      }`,
    fragmentShader:`
      uniform sampler2D artwork;uniform float opacity;
      varying vec2 sampleUV;varying float alpha;
      void main(){
        if(alpha<.01)discard;
        vec2 tileUVOffset=(vec2(gl_PointCoord.x,1.-gl_PointCoord.y)-.5)*2./vec2(320.,480.);
        vec4 c=texture2D(artwork,sampleUV+tileUVOffset);
        gl_FragColor=vec4(c.rgb,c.a*alpha*opacity);
        #include <colorspace_fragment>
      }`
  });
  const particles=new THREE.Points(particleGeometry,particleMaterial);particles.frustumCulled=false;scene.add(particles);
  const glowGeometry=new THREE.BufferGeometry();glowGeometry.setAttribute("position",new THREE.Float32BufferAttribute([15,415,0],3));
  const glowMaterial=new THREE.ShaderMaterial({uniforms:{strength:{value:1}},transparent:true,depthTest:false,depthWrite:false,
    vertexShader:`void main(){gl_Position=vec4(position.x/160.-1.,1.-position.y/240.,0.,1.);gl_PointSize=30.;}`,
    fragmentShader:`uniform float strength;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(1.,.55,.06,max(0.,1.-d)*max(0.,1.-d)*strength);}`});
  const glow=new THREE.Points(glowGeometry,glowMaterial);glow.frustumCulled=false;scene.add(glow);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
  // Real joint hierarchy: shoulders (fixed) -> neck base -> skull base.
  // Angles are radians; the neck carries 30% and the skull joint 70%.
  const NECK_BASE=new THREE.Vector3(160,252,-4),SKULL_BASE=new THREE.Vector3(160,168,0);
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
    material.uniforms.ignition.value=frame.ignition||0;material.uniforms.time.value=frame.time||0;
    particleMaterial.uniforms.progress.value=p;particleMaterial.uniforms.opacity.value=1-blend;glowMaterial.uniforms.strength.value=1-blend;
    renderer.render(scene,camera);
  };
  return {
    canvas:renderer.domElement,vertices:sources.length/2,particles:anchors.length/3,
    render,draw(turn:number){render({turn});},limits:{yaw:MAX_YAW,pitch:MAX_PITCH,roll:MAX_ROLL},
    dispose(){geometry.dispose();material.dispose();particleGeometry.dispose();particleMaterial.dispose();glowGeometry.dispose();glowMaterial.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}
