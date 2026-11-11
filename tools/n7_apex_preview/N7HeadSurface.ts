import * as THREE from "three";

// Adjacent artwork tiles share destination edges. No luminance culling, alpha
// shadow, underlay or silhouette mask. This uses the already-installed engine.
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
  const ys=[...Array.from({length:53},(_,i)=>i*4),480];
  for(const y of ys) for(const x of xs){sources.push(x,y);positions.push(x,y,0);}
  for(let y=0;y<ys.length-1;y++) for(let x=0;x<xs.length-1;x++){
    const i=y*xs.length+x;indices.push(i,i+1,i+xs.length,i+1,i+xs.length+1,i+xs.length);
  }
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute("source",new THREE.Float32BufferAttribute(sources,2));
  geometry.setIndex(indices);
  const material=new THREE.ShaderMaterial({
    uniforms:{turn:{value:0},artwork:{value:texture}},
    depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    vertexShader:`
    attribute vec2 source;
    uniform float turn;
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
    void main(){
      vec4 c=texture2D(artwork,texUV);
      // Shadow changes light, never coverage. Glow only modulates source color.
      gl_FragColor=vec4(c.rgb*shade+c.rgb*vec3(.55,.94,1.)*rim,c.a);
      #include <colorspace_fragment>
    }
  `
  });
  const scene=new THREE.Scene();
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
  return {
    canvas:renderer.domElement,vertices:sources.length/2,
    draw(turn:number){material.uniforms.turn.value=turn;renderer.render(scene,camera);},
    dispose(){geometry.dispose();material.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss();}
  };
}
