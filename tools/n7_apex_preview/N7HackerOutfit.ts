import * as THREE from "three";

// Profile sections measured in the guide's 320×480 rest coordinates.
// Each section is [row, centre x, half width, depth].
type Section = readonly [number, number, number, number];
// The crop ends above the utility belt. The inner edges leave the original core exposed.
const torso: Section[] = [
  [252,160,65,33], [266,160,87,45], [289,160,90,57],
  [322,160,84,62], [352,160,76,54], [377,160,65,47], [386,160,63,45],
];
const sleeve: Section[] = [
  [255,244,7,17], [263,253,21,24], [277,257,29,31],
  [299,260,29,33], [324,261,25,31], [348,261,22,25],
  [369,263,20,25], [380,265,22,24], [391,267,19,22],
  [402,269,21,24], [415,271,18,20],
];
const bracer: Section[] = [
  [413,271,16,16], [427,273,19,19], [455,280,18,18], [480,288,16,15],
];

// Used by the approved textured torso and every part of the fitted jacket.
export const guideChestMotion = `
  vec2 breatheChest(vec2 pixel, float restY, float breath) {
    float weight=exp(-pow((restY-320.)/94.,2.))*smoothstep(208.,252.,restY)*(1.-smoothstep(420.,470.,restY));
    pixel.x=160.+(pixel.x-160.)*(1.+breath*.006*weight);
    pixel.y-=breath*.9*weight;
    return pixel;
  }
`;

export function createHackerOutfit() {
  const root = new THREE.Group();
  const chest = new THREE.Group();
  root.add(chest);
  chest.position.set(160,-248,0);
  const materials: THREE.MeshStandardMaterial[] = [];
  const breathing = {value: 0};
  const material = (color: number, metalness: number, roughness: number, emissive = 0) => {
    const result = new THREE.MeshStandardMaterial({
      color, metalness, roughness, emissive, emissiveIntensity: .75,
      transparent: true,
    });
    result.onBeforeCompile = shader => {
      shader.uniforms.guideBreath = breathing;
      shader.vertexShader = `uniform float guideBreath;
${guideChestMotion}
${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vec4 rest = modelMatrix * vec4(transformed, 1.0);
        vec2 posed = breatheChest(vec2(rest.x, -rest.y), -rest.y, guideBreath);
        vec4 mvPosition = viewMatrix * vec4(posed.x, -posed.y, rest.z, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      `);
    };
    materials.push(result);
    return result;
  };
  const leather = material(0x1b242c,.15,.68);
  const prepareLeather=leather.onBeforeCompile.bind(leather);
  leather.onBeforeCompile=(shader,renderer)=>{
    prepareLeather(shader,renderer);
    shader.vertexShader="varying vec3 clothPosition;\n"+shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\nclothPosition=position;"
    );
    shader.fragmentShader="varying vec3 clothPosition;\n"+shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      vec2 grainCoord=clothPosition.xy;
      float weave=sin(grainCoord.x*2.8+grainCoord.y*1.7)*sin(grainCoord.y*2.5-grainCoord.x*.6);
      float grain=fract(sin(dot(floor(grainCoord*1.4),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=.94+.08*weave+.13*grain;
      roughnessFactor=clamp(.51+.12*weave+.17*grain,.42,.84);`
    );
  };
  const seamLeather = material(0x0c1218,.07,.83);
  const hoodLining = material(0x153141,.25,.62);
  const armor = material(0x283a46,.45,.47);
  const webbing = material(0x13171d,.08,.9);
  const hardware = material(0x75838c,.72,.37);
  const cyan = material(0x22adc9,.18,.5,0x086581);
  const amber = material(0xffae49,.2,.38,0xc65a09);

  type Point = readonly [number,number,number];
  const point = ([x,y,z]: Point) => new THREE.Vector3(x-160,248-y,z);
  const add = (geometry: THREE.BufferGeometry, finish: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry,finish);
    chest.add(mesh);
    mesh.renderOrder = 1;
    return mesh;
  };
  const tube = (path: Point[], radius: number, finish: THREE.Material) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.map(point)),20,radius,6,false),finish);
  const lerp = THREE.MathUtils.lerp;
  const mirror = (p: Point, side: number): Point => [160+side*(p[0]-160),p[1],p[2]];
  const surface = ([y,x,width,depth]: Section, angle: number, offset = 0): Point =>
    [x+width*Math.sin(angle),y,8+depth*Math.cos(angle)+offset];
  const patch = (rows: Point[][], side: number, finish: THREE.Material) => {
    const vertices = rows.flatMap(row=>row.flatMap(p=>point(mirror(p,side)).toArray()));
    const indices: number[] = [];
    const columns = rows[0].length;
    for(let row=1;row<rows.length;row++){
      for(let col=0;col<columns-1;col++){
        const a=(row-1)*columns+col, b=a+1, c=a+columns, d=c+1;
        if(side===1)indices.push(a,c,b,b,c,d);
        else indices.push(a,b,c,b,d,c);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(geometry,finish);
  };
  const band = (inner: Point[], outer: Point[], side: number, finish: THREE.Material) => {
    patch(inner.map((p,i)=>[p,outer[i]]),side,finish);
  };
  const profile = (
    sections: Section[], side: number, finish: THREE.Material, start: (row: number)=>number,
    end: number, offset = 0,
  ) => {
    patch(sections.map((section,row)=>Array.from({length:33},(_,i)=>
      surface(section,lerp(start(row),end,i/32),offset))),side,finish);
  };
  const buckle = (p: Point,w: number,h: number,d: number,finish: THREE.Material) => {
    const mesh = add(new THREE.BoxGeometry(w,h,d),finish);
    mesh.position.copy(point(p));
    return mesh;
  };
  const opening = [.56,.45,.36,.32,.33,.37,.38];
  const outerHood: Point[] = [[192,234,31],[216,237,32],[233,246,31],[235,253,37],[224,266,48],[202,285,61]];
  const innerHood: Point[] = [[191,237,27],[200,242,32],[207,250,40],[209,257,51],[197,272,58],[197,285,63]];
  for(const side of [-1,1]){
    const hem = torso.slice(-2);
    const seam = (path: Point[],width: number,finish: THREE.Material)=>tube(path.map(p=>mirror(p,side)),width,finish);
    profile(torso,side,leather,row=>opening[row],Math.PI);
    profile(hem,side,seamLeather,row=>opening[row+5],Math.PI,1.5);
    // Bias-cut sleeve folds compress towards the elbow. Carry the ridges
    // around the arm so the silhouette and specular response move together.
    const sleeveRows: Point[][] = [];
    for(let y=255;y<=415;y++){
      const hi=sleeve.findIndex(row=>row[0]>=y);
      const low=sleeve[Math.max(0,hi-1)], high=sleeve[hi];
      const t=(y-low[0])/Math.max(1,high[0]-low[0]);
      const cx=lerp(low[1],high[1],t), width=lerp(low[2],high[2],t);
      const depth=lerp(low[3],high[3],t);
      sleeveRows.push(Array.from({length:65},(_,i)=>{
        const angle=(i/64*2-1)*Math.PI;
        const elbow=Math.exp(-Math.pow((y-375)/37,2));
        const phase=y*.39+2.8*Math.sin(angle+.017*y)+side*.7;
        const fold=elbow*(3.2*Math.sin(phase)+1.4*Math.sin(2*phase+.6));
        return surface([y,cx,width+fold,depth+fold],angle);
      }));
    }
    patch(sleeveRows,side,leather);
    profile(sleeve.slice(-3),side,seamLeather,()=>-Math.PI,Math.PI,1.2);
    profile(bracer,side,armor,()=>-Math.PI,Math.PI);

    const lapel = torso.map((section,row)=>surface(section,opening[row],2.5));
    const lapelFacing = torso.map((section,row)=>surface(section,opening[row]+.13,1.7));
    band(lapel,lapelFacing,side,seamLeather);
    seam(lapel,1.1,seamLeather);
    const fastening=new THREE.CatmullRomCurve3(lapel.map(p=>point(mirror(p,side))));
    const teeth=new THREE.InstancedMesh(new THREE.BoxGeometry(1.8,.8,1.2),hardware,56);
    for(let i=0;i<teeth.count;i++){
      const pos=fastening.getPointAt(i/(teeth.count-1));
      teeth.setMatrixAt(i,new THREE.Matrix4().makeTranslation(pos.x,pos.y,pos.z+1));
    }
    teeth.renderOrder=1;
    chest.add(teeth);
    const [zipX,zipY,zipZ] = mirror(lapel[5],side);
    buckle([zipX,zipY+3,zipZ+2],2.8,8,2,hardware);
    seam(torso.map(section=>surface(section,.82,1.6)),.7,seamLeather);

    // Turned-back hood with a separate lining and rolled leather edge.
    const hoodFold: Point[] = outerHood.map(([x,y,z],i)=>[
      lerp(x,innerHood[i][0],.26),lerp(y,innerHood[i][1],.26),z+2.4,
    ]);
    const hoodRows = innerHood.map((inner,i)=>Array.from({length:13},(_,j)=>{
      const u=j/12, outer=hoodFold[i];
      return [lerp(inner[0],outer[0],u),lerp(inner[1],outer[1],u),
        lerp(inner[2],outer[2],u)+4.5*Math.sin(Math.PI*u)] as Point;
    }));
    patch(hoodRows,side,hoodLining);
    band(hoodFold,outerHood,side,leather);
    seam(outerHood,1.9,seamLeather);
    seam(innerHood.slice(1,5),.7,cyan);

    const shoulder = sleeve.slice(2,5);
    profile(shoulder,side,armor,()=>.1,1.28,2.6);
    seam(shoulder.map(section=>surface(section,1.03,3.6)),1,amber);
    seam(shoulder.map(section=>surface(section,.55,3.5)),.8,cyan);
    seam(bracer.map(section=>surface(section,.25,1.8)),1.1,cyan);
    seam(sleeve.slice(4,9).map(section=>surface(section,-.32,1.6)),.75,seamLeather);
  }
  // Waist webbing sits below the hem, over the original illuminated torso.
  const beltTop: Point[] = [[108,420,26],[129,424,44],[160,427,50],[190,423,44],[211,417,26]];
  const beltBottom: Point[] = beltTop.map(([x,y,z])=>[x,y+9,z+1]);
  patch([beltTop,beltBottom],1,webbing);
  tube(beltTop,.75,leather);
  tube(beltBottom,.75,leather);
  buckle([169,430,51],18,12,4,hardware);
  buckle([169,430,54],11,6,2,seamLeather);
  buckle([169,430,56],7,1.8,1,amber);
  buckle([118,448,34],17,26,9,seamLeather).rotation.z = -.18;
  buckle([120,441,39],11,6,2,armor);
  buckle([119,444,41],5,1.8,1,cyan);

  return {
    root,
    pose(visible: boolean, breath: number, opacity: number) {
      root.visible = visible;
      breathing.value = breath;
      materials.forEach(finish=>{finish.opacity=opacity;});
    },
    dispose() {
      chest.children.forEach(child=>(child as THREE.Mesh).geometry.dispose());
      materials.forEach(finish=>finish.dispose());
    },
  };
}
