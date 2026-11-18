import * as THREE from "three";

// Profile sections measured in the guide's 320×480 rest coordinates.
// Each section is [row, centre x, half width, depth].
type Section = readonly [number, number, number, number];
const torso: Section[] = [
  [248,160,49,30], [261,160,79,43], [290,160,84,55],
  [338,160,77,62], [373,160,66,53], [415,160,56,42], [480,160,61,38],
];
const sleeve: Section[] = [
  [255,253,9,15], [267,255,25,27], [292,259,29,35],
  [331,259,25,30], [387,264,20,26], [441,275,20,22], [480,280,20,18],
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
  const fabric = material(0x151f29,.12,.88);
  const sleeves = material(0x101822,.1,.91);
  const armor = material(0x263947,.48,.49);
  const webbing = material(0x080d14,.05,.95);
  const hardware = material(0x536875,.72,.36);
  const cyan = material(0x27dff8,.2,.35,0x14b8ed);

  const point = (x: number,y: number,z: number) => new THREE.Vector3(x-160,248-y,z);
  const add = (geometry: THREE.BufferGeometry, finish: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry,finish);
    chest.add(mesh);
    mesh.renderOrder = 1;
    return mesh;
  };
  const shell = (sections: Section[], finish: THREE.Material, mirror = 1, neckline = false) => {
    const vertices: number[] = [], indices: number[] = [];
    const sides = 48;
    sections.forEach(([y,x,width,depth],row) => {
      for(let i=0;i<sides;i++){
        const angle = i/sides*Math.PI*2;
        const centreDip = neckline && row===0 ? 24*Math.pow(Math.abs(Math.cos(angle)),6) : 0;
        const p = point(160+mirror*(x-160+width*Math.sin(angle)),y+centreDip,depth*Math.cos(angle)+7);
        vertices.push(p.x,p.y,p.z);
        if(row===0)continue;
        const a=(row-1)*sides+i, b=(row-1)*sides+(i+1)%sides;
        if(mirror===1)indices.push(a,a+sides,b,b,a+sides,b+sides);
        else indices.push(a,b,a+sides,b,b+sides,a+sides);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add(geometry,finish);
  };
  type Point = readonly [number,number,number];
  const seam = (path: Point[], radius: number, finish: THREE.Material) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.map(([x,y,z])=>point(x,y,z))),24,radius,6,false),finish);
  const hardwareBox = (x: number,y: number,z: number,w: number,h: number,d: number,finish: THREE.Material) => {
    const mesh = add(new THREE.BoxGeometry(w,h,d),finish);
    mesh.position.copy(point(x,y,z));
    return mesh;
  };

  shell(torso,fabric,1,true);
  for(const side of [-1,1]){
    shell(sleeve,sleeves,side);
    const x = (offset: number) => 160+side*offset;
    // Raised shoulder plates and collar piping follow the jacket's surface.
    seam([[x(51),263,36],[x(76),267,35],[x(93),275,44],[x(109),294,43]],4,armor);
    seam([[x(67),268,37],[x(89),273,48],[x(105),287,49]],1.15,cyan);
    seam([[x(31),252,33],[x(24),261,43],[x(12),268,49],[160,277,56]],2.4,armor);
    seam([[x(31),253,36],[x(24),261,46],[x(12),269,52]],.85,cyan);
    seam([[x(55),288,52],[x(46),320,65],[x(37),354,65],[x(40),397,49]],3.6,webbing);
    seam([[x(63),316,50],[x(60),355,54],[x(51),388,43],[x(50),429,38]],1.1,armor);
    seam([[x(103),308,42],[x(105),345,40],[x(111),390,37]],1,armor);
  }
  seam([[160,277,58],[160,319,69],[160,343,70],[160,384,58],[160,418,51],[160,479,47]],1.25,hardware);
  seam([[107,414,30],[127,417,48],[160,418,54],[193,417,48],[213,414,30]],5,webbing);
  hardwareBox(160,417,55,23,12,5,hardware);
  hardwareBox(160,417,58,12,2,2,cyan);
  const module = hardwareBox(208,315,61,23,30,9,armor);
  module.rotation.z = -.19;
  for(let i=0;i<3;i++)hardwareBox(206+i*2,306+i*5,66,10,1.4,1.4,cyan);
  hardwareBox(195,394,54,23,17,10,webbing).rotation.z = -.12;
  seam([[219,319,62],[226,335,49],[220,359,50],[204,387,55]],1.45,hardware);
  hardwareBox(160,298,65,8,10,4,armor);
  hardwareBox(160,298,68,3,6,2,cyan);

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
