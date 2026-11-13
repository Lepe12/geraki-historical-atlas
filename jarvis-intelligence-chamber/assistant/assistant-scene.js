/* NABOU voice assistant — holographic scene (shared by the welcome page and the assistant panel).
   Idle: a slowly turning armillary/compass orb. Active: the same particles gather into the
   cyan holographic line portrait of a 16th-century cartographer (see ../assets/assistant/README.md).
   API (stable): show/hide/jump/turn/look/nod/speaking/freeze/pause/resume/tune/dispose.
   Added: show(seconds), kick(), dissolve(ms), calm(bool), createHologram(canvas, {stage}). */
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
uniform float uMorph, uTime, uYaw, uPitch, uPulse, uSize, uPix, uGain, uMouth, uBurst, uGlitch, uFlick;
attribute vec3 aOrb; attribute float aBright; attribute float aHead; attribute float aSeed;
varying float vA; varying float vWarm;
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  /* head turn / nod: pivot at the neck; aHead = 1 for the head, fading to 0 through the ruff */
  vec3 piv = vec3(0.02, -0.2, 0.0);
  mat3 R = rotY(uYaw * aHead) * rotX(uPitch * aHead);
  vec3 b = piv + R * (position - piv);
  /* speech: the jaw swings open. Everything under the moustache line (cloud y ≈ 0.148) — lower lip, chin, beard — drops, hinged at the ear
     side (x ≈ 0.04) so the front moves most, and fades to zero towards the ruff so the collar never tears. The upper lip lifts a little. */
  float yo = b.y;                                                      /* height before the jaw moves */
  float jx = smoothstep(-0.50, -0.38, b.x) * clamp((0.04 - b.x) / 0.30, 0., 1.);
  float below = smoothstep(0.160, 0.136, yo);                          /* 0 on the moustache, 1 right under it */
  float reach = smoothstep(-0.20, 0.05, yo);                          /* 1 near the mouth, 0 at the collar */
  float jaw = jx * below * reach * aHead;
  float lift = jx * smoothstep(0.23, 0.15, yo) * (1. - below) * aHead;
  b.y += uMouth * (0.012 * lift - 0.20 * jaw); b.x += uMouth * 0.02 * jaw;
  float d = aSeed * 0.45;
  float k = smoothstep(d, d + 0.55, uMorph);
  vec3 p = mix(aOrb, b, k);
  float swirl = sin(3.14159 * k);
  p += normalize(p + 1e-4) * swirl * 0.22 + vec3(sin(aSeed * 40. + uTime), cos(aSeed * 31. + uTime), 0.) * swirl * 0.05;
  p += vec3(0., sin(uTime * 0.9 + aSeed * 6.28) * 0.003, 0.);
  /* rare horizontal glitch: a few thin bands slip sideways for ~0.15s */
  float band = floor(p.y * 16.0), gr = hash(band * 91.7 + floor(uTime * 24.0));
  p.x += step(0.82, gr) * (gr - 0.9) * 0.34 * uGlitch;
  /* dissolve on exit: the figure breaks into drifting particles */
  float bu = uBurst * uBurst * (0.45 + aSeed);
  vec3 dir = normalize(vec3(hash(aSeed * 91.3) - 0.5, hash(aSeed * 57.1) - 0.35, hash(aSeed * 33.7) - 0.5) + 1e-4);
  p += (dir * 1.1 + normalize(p + 1e-4) * 0.5 + vec3(0., 0.35, 0.)) * bu;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  /* slow light sweep down the figure, like a hologram refreshing */
  float scan = smoothstep(0.08, 0., abs(fract(position.y * 0.35 - uTime * 0.08) - 0.5) - 0.42) * 0.35;
  float orb = 0.55 + 0.25 * sin(aSeed * 50. + uTime * 1.7);
  float fig = pow(aBright, 0.8) * (1. + scan + uPulse * 0.08 * (0.4 + aHead));
  /* mouth while speaking: the opening is the empty, dark band between the moustache and the dropped beard. Its two lips are lit: the
     underside of the moustache and the first beard hairs that moved with the jaw; points stretched across the gap are dimmed. */
  float mw = jx * aHead * uMouth;
  float gapB = below * (1. - below) * 4.;
  fig *= 1. - 0.85 * gapB * mw;
  fig *= 1. - 0.45 * uMouth * jaw;                                                          /* the dropped beard is a little dimmer than at rest */
  fig *= 1. - 0.7 * mw * reach * (1. - reach) * 4. * below;                                /* hairs piling up against the ruff stay soft */
  float upper = smoothstep(0.100, 0.150, yo) * (1. - smoothstep(0.150, 0.180, yo));       /* moustache underside */
  float lower = smoothstep(0.060, 0.125, yo) * below;                                        /* hairs that form the lower lip */
  fig *= 1. + mw * (0.9 * upper + 0.45 * lower);
  /* depth: nearer points (face towards the viewer) are a little larger and brighter */
  float depth = clamp(p.z * 1.3 + 0.5, 0., 1.);
  float dA = 0.72 + 0.45 * depth;
  vA = mix(orb, fig, k) * uGain * uFlick * dA * (1. - uBurst);
  vWarm = mix(0.35, aBright, k) * (0.85 + 0.25 * depth);
  gl_PointSize = uSize * uPix * (1.0 + uPulse * 0.05 * k) * (0.86 + 0.3 * depth) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */`
uniform float uLine;
varying float vA; varying float vWarm;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c);
  if (r > 0.25) discard;
  /* thin scan lines (screen space) */
  float sl = 0.74 + 0.26 * step(0.5, fract(gl_FragCoord.y / uLine));
  float a = smoothstep(0.25, 0.0, r) * vA * sl;
  /* holographic cyan: deep #1E6FA8 -> #7FD4FF, only the brightest strokes lift toward #CFF3FF */
  vec3 deep = vec3(0.118, 0.435, 0.659), mid = vec3(0.498, 0.831, 1.0), hi = vec3(0.81, 0.953, 1.0);
  float t = clamp(vWarm, 0., 1.);
  vec3 col = t < 0.62 ? mix(deep, mid, t / 0.62) : mix(mid, hi, (t - 0.62) / 0.38 * 0.8);
  gl_FragColor = vec4(col * a, a);
}`;

/* projector base: light rings, a faint cone of light and drifting dust (welcome page only) */
const baseVert = /* glsl */`
uniform float uTime, uPix, uDrift; attribute float aSeed; attribute float aKind; varying float vA;
void main(){
  vec3 p = position;
  if (aKind > 0.5) { p.y = -1.2 + mod(p.y + 1.2 + uTime * uDrift * (0.02 + aSeed * 0.05), 2.3); p.x += sin(uTime * 0.4 * uDrift + aSeed * 40.) * 0.03; }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 1.6) * uDrift + aSeed * 90.);
  vA = aKind > 0.5 ? tw * 0.55 * smoothstep(-1.2, -0.9, p.y) * smoothstep(1.1, 0.6, p.y) : 0.9;
  gl_PointSize = (aKind > 0.5 ? 0.012 + aSeed * 0.014 : 0.016) * uPix / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const baseFrag = /* glsl */`
uniform float uGain; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard;
  float a = smoothstep(0.25, 0., r) * vA * uGain; gl_FragColor = vec4(vec3(0.30, 0.66, 0.95) * a, a); }`;
const coneVert = /* glsl */`varying float vY; varying vec3 vN; void main(){ vY = position.y; vN = normalMatrix * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const coneFrag = /* glsl */`uniform float uGain, uTime; varying float vY; varying vec3 vN;
void main(){ float h = clamp((vY + 0.35) / 0.7, 0., 1.); float rim = 0.4 + 0.6 * pow(1. - abs(normalize(vN).z), 1.2);
  float a = (1. - h) * (1. - h) * 0.2 * rim * uGain * (0.9 + 0.1 * sin(uTime * 1.3 + vY * 9.));
  gl_FragColor = vec4(vec3(0.16, 0.52, 0.85) * a, a); }`;

const CLEAR = 0x000000; // canvases use mix-blend-mode: screen, so black = transparent and the page glow shows through

export async function createHologram(canvas, opts = {}) {
  const stage = !!opts.stage;
  const reduceMq = matchMedia("(prefers-reduced-motion: reduce)");
  const small = Math.min(innerWidth, innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "low-power" });
  let pr = Math.min(small ? 1.5 : 2, devicePixelRatio || 1);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(CLEAR, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  if (stage) { camera.position.set(0, 0.3, 4.35); camera.lookAt(0, -0.22, 0); } else camera.position.set(0, -0.02, 3.7);
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
  const u = { uMorph: { value: 0 }, uTime: { value: 0 }, uYaw: { value: 0 }, uPitch: { value: 0 }, uPulse: { value: 0 }, uSize: { value: 0.03 }, uPix: { value: 1 }, uGain: { value: 0.27 },
    uMouth: { value: 0 }, uBurst: { value: 0 }, uGlitch: { value: 0 }, uFlick: { value: 1 }, uLine: { value: 4 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  const group = new THREE.Group(); group.add(pts); scene.add(group);

  /* projector base (welcome page): rings of light, cone, dust */
  const extra = []; const bu = { uTime: { value: 0 }, uPix: { value: 1 }, uDrift: { value: 1 }, uGain: { value: 0.9 } };
  const cu = { uGain: { value: 0.9 }, uTime: u.uTime };
  let ringMat = null;
  if (stage) {
    const YB = -1.2, ringPts = [], kind = [], sd = [];
    for (const [R, n] of [[0.5, 150], [0.82, 230], [1.14, 300]]) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ringPts.push(Math.cos(a) * R, YB, Math.sin(a) * R); kind.push(0); sd.push(rnd()); }
    const dust = 150; for (let i = 0; i < dust; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 1.25; ringPts.push(Math.cos(a) * r, YB + rnd() * 2.3, Math.sin(a) * r); kind.push(1); sd.push(rnd()); }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.Float32BufferAttribute(ringPts, 3));
    bg.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
    bg.setAttribute("aSeed", new THREE.Float32BufferAttribute(sd, 1));
    ringMat = new THREE.ShaderMaterial({ uniforms: bu, vertexShader: baseVert, fragmentShader: baseFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const basePts = new THREE.Points(bg, ringMat); basePts.frustumCulled = false; scene.add(basePts);
    const cg = new THREE.CylinderGeometry(0.98, 0.5, 0.7, 56, 1, true);
    const cm = new THREE.ShaderMaterial({ uniforms: cu, vertexShader: coneVert, fragmentShader: coneFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const cone = new THREE.Mesh(cg, cm); cone.position.y = YB + 0.35; cone.frustumCulled = false; scene.add(cone);
    extra.push(bg, ringMat, cg, cm);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.35, 0.28);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const st = { target: 0, morph: 0, morphDur: 2.4, yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, pulse: 0, speaking: false, nodUntil: 0, spin: 0, t0: performance.now(), raf: 0, frozen: null,
    mouth: 0, kickV: 0, calm: reduceMq.matches, gx: 0, gy: 0, tgx: 0, tgy: 0, lastMove: 0, burstFrom: 0, burstDur: 0, burstRes: null,
    nextGlitch: performance.now() + 2500, glitchUntil: 0, flickUntil: 0, nextFlick: performance.now() + 1800, frames: 0, acc: 0, adapted: false };
  function size() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    u.uPix.value = bu.uPix.value = h * renderer.getPixelRatio() * 0.5;
    u.uLine.value = Math.max(3, Math.round(3.5 * renderer.getPixelRatio()));
  }
  const ro = new ResizeObserver(size); ro.observe(canvas); size();

  /* the head follows the pointer / finger softly (small angles, lerped) */
  const onMove = (e) => {
    if (st.calm) return;
    const r = canvas.getBoundingClientRect(); if (!r.width) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
    st.tgx = Math.max(-1, Math.min(1, (e.clientX - cx) / (innerWidth * 0.5)));
    st.tgy = Math.max(-1, Math.min(1, (e.clientY - cy) / (innerHeight * 0.5)));
    st.lastMove = performance.now();
  };
  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerdown", onMove, { passive: true });
  const onMq = () => { st.calm = reduceMq.matches; };
  reduceMq.addEventListener?.("change", onMq);

  let last = performance.now();
  function frame(now) {
    st.raf = requestAnimationFrame(frame);
    const t = st.frozen != null ? st.frozen : (now - st.t0) / 1000;
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw), dtm = Math.min(0.25, raw); last = now;
    /* adaptive quality: if the first second is slow (weak phone / software GL) drop to 1x pixel ratio once */
    if (!st.adapted && ++st.frames > 8) { st.acc += raw; if (st.frames >= 40) { st.adapted = true; if (st.acc / 32 > 0.045 && pr > 1) { pr = 1; renderer.setPixelRatio(1); size(); } } }
    st.morph += Math.sign(st.target - st.morph) * Math.min(Math.abs(st.target - st.morph), dtm / st.morphDur);
    const calm = st.calm, k = st.morph;
    st.spin += calm ? 0 : dt * 0.25 * (1 - st.morph);
    /* gaze + depth parallax */
    if (!calm && now - st.lastMove > 4000) { st.tgx = 0; st.tgy = 0; }
    const gk = Math.min(1, dtm * 3);
    st.gx += ((calm ? 0 : st.tgx) - st.gx) * gk; st.gy += ((calm ? 0 : st.tgy) - st.gy) * gk;
    group.rotation.y = st.spin * (1 - k) + (calm ? 0 : (Math.sin(t * 0.35) * 0.06 + st.gx * 0.16) * k);
    group.rotation.x = 0.35 * (1 - k) + (calm ? 0 : st.gy * 0.05 * k);
    let nod = 0;
    if (now < st.nodUntil) nod = Math.sin((st.nodUntil - now) / 1200 * Math.PI * 2) * 0.2;
    /* speech: voice-like envelope drives pulse, jaw and a small nod; kick() (word boundaries) adds accents */
    st.kickV = Math.max(0, st.kickV - dt * 5);
    const env = st.speaking ? 0.55 + 0.45 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1)) : 0;
    /* reduced motion: a gentle, steady half-open mouth while the voice plays (no syllable flapping, no pulse) */
    const wantMouth = st.speaking ? (calm ? 0.4 : Math.min(1, 0.1 + 0.85 * Math.abs(Math.sin(t * 9.4) * Math.sin(t * 4.1 + 0.6)) + 0.5 * st.kickV)) : 0;
    st.mouth += (wantMouth - st.mouth) * Math.min(1, dt * (calm ? 5 : 14));
    const speakNod = st.speaking && !calm ? Math.sin(t * 2.3) * 0.03 + st.kickV * 0.035 : 0;
    st.yaw += (st.tYaw - st.yaw) * Math.min(1, dtm * 2.5);
    st.pitch += (st.tPitch + nod + speakNod - st.pitch) * Math.min(1, dtm * 4);
    const want = Math.min(1, env + st.kickV * 0.35);
    st.pulse += (want - st.pulse) * Math.min(1, dt * 8);
    /* hologram flicker / glitch: rare, short; none under reduced motion */
    if (!calm) {
      if (now > st.nextGlitch) { st.glitchUntil = now + 140; st.flickUntil = now + 140; st.nextGlitch = now + 4500 + Math.random() * 6500; }
      if (now > st.nextFlick) { st.flickUntil = now + 70; st.nextFlick = now + 2200 + Math.random() * 3800; }
    }
    u.uGlitch.value = now < st.glitchUntil ? 1 : 0;
    u.uFlick.value = !calm && now < st.flickUntil ? 0.62 + 0.3 * Math.random() : 1;
    if (st.burstDur) {
      const b = Math.min(1, (now - st.burstFrom) / st.burstDur); u.uBurst.value = b;
      if (b >= 1) { st.burstDur = 0; st.burstRes?.(); st.burstRes = null; }
    }
    u.uMorph.value = k; u.uTime.value = t; u.uMouth.value = st.mouth; u.uPulse.value = st.pulse;
    u.uYaw.value = st.yaw + (calm ? 0 : Math.sin(t * 0.5) * 0.04 * k + st.gx * 0.2 * k);
    u.uPitch.value = st.pitch + (calm ? 0 : Math.sin(t * 0.37) * 0.02 * k - st.gy * 0.1 * k);
    bu.uTime.value = t; bu.uDrift.value = calm ? 0 : 1;
    if (stage) { const fade = 1 - u.uBurst.value; bu.uGain.value = 0.9 * fade; cu.uGain.value = 0.9 * fade * (0.55 + 0.45 * k); }
    bloom.strength = 0.3 + st.pulse * 0.06;
    composer.render();
  }
  st.raf = requestAnimationFrame(frame);
  return {
    get active() { return st.target === 1; },
    get morph() { return st.morph; },
    // The cartographer portrait is withdrawn: N7's presence is the approved Humanoid. Only the orb remains.
    show() { st.target = 0; }, hide() { st.target = 0; st.morphDur = 2.4; },
    jump() { st.morph = st.target = 0; },
    turn(dir) { st.tYaw = Math.max(-0.45, Math.min(0.45, dir === 0 ? 0 : st.tYaw + dir * 0.3)); },
    look(pitch) { st.tPitch = pitch; },
    nod() { st.nodUntil = performance.now() + 1200; },
    speaking(v) { st.speaking = !!v; if (!v) st.kickV = 0; },
    kick(v = 1) { st.kickV = Math.min(1, st.kickV + v); },
    calm(v) { st.calm = !!v; },
    /* the figure breaks into particles; resolves when finished (use before fading the canvas) */
    dissolve(ms = 520) { return new Promise((res) => { st.burstFrom = performance.now(); st.burstDur = Math.max(60, ms); st.burstRes = res; }); },
    freeze(t) { st.frozen = t; },
    pause() { cancelAnimationFrame(st.raf); st.raf = 0; },
    resume() { if (!st.raf) { last = performance.now(); st.raf = requestAnimationFrame(frame); } },
    tune(o) { for (const k in o) { if (u[k]) u[k].value = o[k]; else if (k in bloom) bloom[k] = o[k]; } },
    stats() { return { pr, frames: st.frames }; },
    dispose() { cancelAnimationFrame(st.raf); removeEventListener("pointermove", onMove); removeEventListener("pointerdown", onMove); reduceMq.removeEventListener?.("change", onMq); ro.disconnect(); g.dispose(); mat.dispose(); for (const x of extra) x.dispose?.(); composer.dispose?.(); renderer.dispose(); },
  };
}
