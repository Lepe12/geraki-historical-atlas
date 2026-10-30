/* NABOU voice assistant — holographic scene (loaded only after the user opens the assistant).
   Idle: a slowly turning golden armillary/compass orb. Active: the same particles gather into the
   gold line portrait of a 16th-century cartographer (see ../assets/assistant/README.md). */
import * as THREE from "../vendor/three/three.module.min.js";
import { EffectComposer } from "../vendor/three/EffectComposer.js";
import { RenderPass } from "../vendor/three/RenderPass.js";
import { UnrealBloomPass } from "../vendor/three/UnrealBloomPass.js";
import { OutputPass } from "../vendor/three/OutputPass.js";

const ASSET = new URL("../assets/assistant/cartographer-points.bin", import.meta.url);

async function loadBust() {
  const buf = await (await fetch(ASSET)).arrayBuffer();
  const n = new DataView(buf).getUint32(0, true);
  const pos = new Int16Array(buf, 4, n * 3), bright = new Uint8Array(buf, 4 + n * 6, n), head = new Uint8Array(buf, 4 + n * 7, n);
  const p = new Float32Array(n * 3), b = new Float32Array(n), h = new Float32Array(n);
  for (let i = 0; i < n * 3; i++) p[i] = pos[i] / 32767;
  for (let i = 0; i < n; i++) { b[i] = bright[i] / 255; h[i] = head[i] / 255; }
  return { n, p, b, h };
}

/* armillary orb: rings sampled by length so every particle has a place */
function orbPoints(n, rnd) {
  const R = 0.78, rings = [];
  const ring = (r, tiltX, tiltZ, y = 0, w = 1) => rings.push({ r, tiltX, tiltZ, y, w, len: 2 * Math.PI * r * w });
  ring(R, 0, 0); ring(R * 0.92, 0, 0, R * 0.39); ring(R * 0.92, 0, 0, -R * 0.39);            // equator + tropics
  ring(R * 0.98, 23.4 * Math.PI / 180, 0, 0, 1.2);                                            // ecliptic (brighter band)
  for (let k = 0; k < 4; k++) ring(R, Math.PI / 2, k * Math.PI / 4);                          // meridians
  ring(R * 1.12, 0, 0, 0, 0.8); ring(R * 0.34, Math.PI / 2, 0.4); ring(R * 0.34, 0.6, 0);      // outer frame + inner globe
  const total = rings.reduce((a, r) => a + r.len, 0), out = new Float32Array(n * 3);
  const star = Math.floor(n * 0.08); // compass rose (8 points) in the equator plane
  for (let i = 0; i < n; i++) {
    let x, y, z;
    if (i < star) {
      const arm = i % 8, t = rnd(), big = arm % 2 === 0, L = big ? 0.7 : 0.42, a = arm * Math.PI / 4;
      const side = (rnd() < 0.5 ? -1 : 1) * (1 - t) * (big ? 0.07 : 0.05);
      x = Math.cos(a) * t * L - Math.sin(a) * side; z = Math.sin(a) * t * L + Math.cos(a) * side; y = 0;
    } else {
      let u = rnd() * total, r = rings[0];
      for (const g of rings) { if (u < g.len) { r = g; break; } u -= g.len; }
      const a = rnd() * Math.PI * 2;
      x = Math.cos(a) * r.r; z = Math.sin(a) * r.r; y = r.y;
      const cy = Math.cos(r.tiltX), sy = Math.sin(r.tiltX); [y, z] = [y * cy - z * sy, y * sy + z * cy];
      const cz = Math.cos(r.tiltZ), sz = Math.sin(r.tiltZ); [x, y] = [x * cz - y * sz, x * sz + y * cz];
    }
    out.set([x, y, z], i * 3);
  }
  return out;
}

const vert = /* glsl */`
uniform float uMorph, uTime, uYaw, uPitch, uPulse, uSize, uPix, uGain;
attribute vec3 aOrb; attribute float aBright; attribute float aHead; attribute float aSeed;
varying float vA; varying float vWarm;
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
void main(){
  /* head turn / nod: pivot at the neck; aHead = 1 for the head, fading to 0 through the ruff */
  vec3 piv = vec3(0.02, -0.2, 0.0);
  mat3 R = rotY(uYaw * aHead) * rotX(uPitch * aHead);
  vec3 b = piv + R * (position - piv);
  float d = aSeed * 0.45;
  float k = smoothstep(d, d + 0.55, uMorph);
  vec3 p = mix(aOrb, b, k);
  float swirl = sin(3.14159 * k);
  p += normalize(p + 1e-4) * swirl * 0.22 + vec3(sin(aSeed * 40. + uTime), cos(aSeed * 31. + uTime), 0.) * swirl * 0.05;
  p += vec3(0., sin(uTime * 0.9 + aSeed * 6.28) * 0.003, 0.);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  /* slow light sweep down the figure, like a hologram refreshing */
  float scan = smoothstep(0.08, 0., abs(fract(position.y * 0.35 - uTime * 0.08) - 0.5) - 0.42) * 0.35;
  float orb = 0.55 + 0.25 * sin(aSeed * 50. + uTime * 1.7);
  float fig = pow(aBright, 0.8) * (1. + scan + uPulse * 0.28 * (0.4 + aHead));
  vA = mix(orb, fig, k) * uGain;
  vWarm = mix(0.35, aBright, k);
  gl_PointSize = uSize * uPix * (1.0 + uPulse * 0.2 * k) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */`
varying float vA; varying float vWarm;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.0, r) * vA;
  vec3 gold = mix(vec3(1.0, 0.30, 0.0), vec3(1.0, 0.64, 0.14), vWarm);
  gl_FragColor = vec4(gold * a, a);
}`;

export async function createHologram(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, -0.02, 3.7);
  const bust = await loadBust();
  let s = 12345; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(bust.n);
  for (let i = 0; i < bust.n; i++) seed[i] = rnd();
  g.setAttribute("position", new THREE.BufferAttribute(bust.p, 3));
  g.setAttribute("aBright", new THREE.BufferAttribute(bust.b, 1));
  g.setAttribute("aHead", new THREE.BufferAttribute(bust.h, 1));
  g.setAttribute("aOrb", new THREE.BufferAttribute(orbPoints(bust.n, rnd), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const u = { uMorph: { value: 0 }, uTime: { value: 0 }, uYaw: { value: 0 }, uPitch: { value: 0 }, uPulse: { value: 0 }, uSize: { value: 0.03 }, uPix: { value: 1 }, uGain: { value: 0.22 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  const group = new THREE.Group(); group.add(pts); scene.add(group);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const st = { target: 0, morph: 0, yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, pulse: 0, speaking: false, nodUntil: 0, spin: 0, t0: performance.now(), raf: 0, frozen: null };
  function size() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    u.uPix.value = h * renderer.getPixelRatio() * 0.5;
  }
  const ro = new ResizeObserver(size); ro.observe(canvas); size();
  let last = performance.now();
  function frame(now) {
    st.raf = requestAnimationFrame(frame);
    const t = st.frozen != null ? st.frozen : (now - st.t0) / 1000;
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw), dtm = Math.min(0.25, raw); last = now;
    st.morph += Math.sign(st.target - st.morph) * Math.min(Math.abs(st.target - st.morph), dtm / 2.4);
    st.spin += dt * 0.25 * (1 - st.morph);
    const k = st.morph;
    group.rotation.y = st.spin * (1 - k) + Math.sin(t * 0.35) * 0.06 * k;
    group.rotation.x = 0.35 * (1 - k);
    let nod = 0;
    if (now < st.nodUntil) nod = Math.sin((st.nodUntil - now) / 1200 * Math.PI * 2) * 0.2;
    st.yaw += (st.tYaw - st.yaw) * Math.min(1, dtm * 2.5);
    st.pitch += (st.tPitch + nod - st.pitch) * Math.min(1, dtm * 4);
    const want = st.speaking ? 0.55 + 0.45 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1)) : 0;
    st.pulse += (want - st.pulse) * Math.min(1, dt * 8);
    u.uMorph.value = k; u.uTime.value = t; u.uYaw.value = st.yaw + Math.sin(t * 0.5) * 0.04 * k; u.uPitch.value = st.pitch + Math.sin(t * 0.37) * 0.02 * k; u.uPulse.value = st.pulse;
    bloom.strength = 0.45 + st.pulse * 0.15;
    composer.render();
  }
  st.raf = requestAnimationFrame(frame);
  return {
    get active() { return st.target === 1; },
    get morph() { return st.morph; },
    show() { st.target = 1; }, hide() { st.target = 0; },
    jump(v) { st.morph = st.target = v; },
    turn(dir) { st.tYaw = Math.max(-0.45, Math.min(0.45, dir === 0 ? 0 : st.tYaw + dir * 0.3)); },
    look(pitch) { st.tPitch = pitch; },
    nod() { st.nodUntil = performance.now() + 1200; },
    speaking(v) { st.speaking = !!v; },
    freeze(t) { st.frozen = t; },
    pause() { cancelAnimationFrame(st.raf); st.raf = 0; },
    resume() { if (!st.raf) { last = performance.now(); st.raf = requestAnimationFrame(frame); } },
    tune(o) { for (const k in o) { if (u[k]) u[k].value = o[k]; else if (k in bloom) bloom[k] = o[k]; } },
    dispose() { cancelAnimationFrame(st.raf); ro.disconnect(); g.dispose(); mat.dispose(); composer.dispose?.(); renderer.dispose(); },
  };
}
