import * as THREE from "three";

// Adjacent artwork tiles share destination edges. No luminance culling, alpha
// shadow, underlay or silhouette mask. This uses the already-installed engine.
export type GuideFrame={turn:number;breath?:number;assembly?:number;baseMood?:number;states?:number[];ages?:number[];ignition?:number;time?:number};
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
  const xs=[0,...Array.from({length:49},(_,i)=>64+i*4),320];
  const ys=[...Array.from({length:53},(_,i)=>i*4),240,280,320,360,400,440,480];
  for(const y of ys) for(const x of xs){sources.push(x,y);positions.push(x,y,0);}
  for(let y=0;y<ys.length-1;y++) for(let x=0;x<xs.length-1;x++){
    const i=y*xs.length+x;indices.push(i,i+1,i+xs.length,i+1,i+xs.length+1,i+xs.length);
  }
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("source",new THREE.Float32BufferAttribute(sources,2));
  geometry.setIndex(indices);
  const material=new THREE.ShaderMaterial({
    uniforms:{turn:{value:0},artwork:{value:texture},breath:{value:0},opacity:{value:1},
      baseMood:{value:0},states:{value:[0,0,0,0]},ages:{value:[0,0,0,0]},count:{value:0},ignition:{value:0},time:{value:0}},
    depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,transparent:true,
    vertexShader:`
    attribute vec2 source;
    uniform float turn;
    uniform float breath;
    varying vec2 texUV;
    varying float shade;
    varying float rim;
    void main(){
      vec2 n=(source-vec2(160.,108.))/vec2(86.,98.);
      float r2=dot(n,n);
      float neck=clamp((205.-source.y)/27.,0.,1.);
      float head=pow(max(0.,1.-r2/1.18),.34)*neck;
      float depth=sqrt(max(0.,1.-min(1.,r2)))*42.;
      float a=turn*.34*head;
      vec2 p=source;
      p.x=160.+(source.x-160.)*cos(a)+depth*sin(a);
      p.y+=(source.y-205.)*(1.-cos(a))*.08*head;
      float chest=exp(-pow((source.y-320.)/94.,2.))*smoothstep(205.,250.,source.y)*(1.-smoothstep(420.,470.,source.y));
      p.x=160.+(p.x-160.)*(1.+breath*.006*chest);
      p.y-=breath*.9*chest;
      float farSide=max(0.,-sign(turn)*n.x);
      float nearSide=max(0.,sign(turn)*n.x);
      float amount=abs(turn);
      shade=max(.26,1.-amount*head*(.08+.50*farSide));
      shade*=1.-max(0.,amount-.72)*1.65*farSide*head;
      float edge=max(0.,1.-abs(sqrt(r2)-.92)/.18);
      rim=edge*nearSide*amount*head*.10;
      texUV=source/vec2(320.,480.);
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
    vec3 palette(vec3 c,float mood){
      vec3 s=linearToOutputTexel(vec4(c,1.)).rgb;
      float d=distance(texUV*vec2(320.,480.),vec2(160.,150.));
      float visible=step(7./255.,max(max(s.r,s.g),s.b));
      bool cyan=s.b>s.r*1.15&&s.g>s.r*1.05;
      bool amber=s.r>s.g*1.15&&s.g>s.b*1.2;
      if(mood>.5&&mood<1.5){
        if(cyan)s=vec3(s.r*.92,s.g*1.18+16./255.,s.b*1.25+24./255.);
        if(amber)s*=vec3(.86,.88,.92);
      }else if(mood>1.5&&mood<2.5){
        if(texUV.y*480.<215.){
          float k=max(0.,1.-d/145.);
          s+=(cyan?vec3(34.,72.,92.):vec3(22.,34.,42.))*k*visible/255.;
          if(amber)s+=vec3(28.,12.,4.)*k*visible/255.;
        }else s*=vec3(.90,.94,.97);
      }else if(mood>2.5){
        float k=max(0.,1.-d/92.)*(.68+.32*sin(time*1000./115.));
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
  const render=(frame:GuideFrame)=>{
    const p=frame.assembly??1;
    const blend=Math.max(0,Math.min(1,(p-.96)/.04));
    mesh.visible=p>=.96;particles.visible=p<1;glow.visible=p<1;
    material.uniforms.turn.value=frame.turn;
    material.uniforms.breath.value=frame.breath||0;
    material.uniforms.opacity.value=blend;
    material.uniforms.baseMood.value=frame.baseMood||0;
    material.uniforms.states.value=[...(frame.states||[]),0,0,0,0].slice(0,4);
    material.uniforms.ages.value=[...(frame.ages||[]),0,0,0,0].slice(0,4);
    material.uniforms.count.value=frame.states?.length||0;
    material.uniforms.ignition.value=frame.ignition||0;material.uniforms.time.value=frame.time||0;
    particleMaterial.uniforms.progress.value=p;particleMaterial.uniforms.opacity.value=1-blend;glowMaterial.uniforms.strength.value=1-blend;
    renderer.render(scene,camera);
  };
  return {
    canvas:renderer.domElement,vertices:sources.length/2,particles:anchors.length/3,
    render,draw(turn:number){render({turn});},
    dispose(){geometry.dispose();material.dispose();particleGeometry.dispose();particleMaterial.dispose();glowGeometry.dispose();glowMaterial.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}
