"use client";
// The existing N7 guide Humanoid (N7GuideScene: same figure, assembly, breathing, moods, head turn),
// placed at full stage scale. Only the frame around it is new; the figure itself is not changed.
import { useCallback, useEffect, useRef, useState } from "react";
import N7GuideScene, { type GuideFrameInfo, type GuideMode, type GuideMood } from "../N7GuideScene";
import { N7_HUMANOID_REFERENCE } from "../N7HumanoidReference";
import { CORE, createAssemblySound, createFx } from "../N7GuideFx";

export type Face = "n7" | "h01";
const H01_FIGURE = N7_HUMANOID_REFERENCE.slice(0, N7_HUMANOID_REFERENCE.lastIndexOf("/")) + "/n7-humanoid-h01-v2.webp";

export default function EveHumanoid({ mood, effects, sound, breathing, face, onWave, onClearWave }: {
  mood: GuideMood; effects: boolean; sound: boolean; breathing: boolean; face: Face;
  onWave?: (x: number, y: number, radius: number, fade: number) => void; onClearWave?: () => void;
}) {
  const [reduced, setReduced] = useState(false);
  const [mode, setMode] = useState<GuideMode>("assembly");
  const [replay, setReplay] = useState(0);
  const slotRef = useRef<HTMLDivElement>(null), figureRef = useRef<HTMLDivElement>(null), fxRef = useRef<HTMLCanvasElement>(null);
  const fx = useRef<ReturnType<typeof createFx> | null>(null), sfx = useRef<ReturnType<typeof createAssemblySound> | null>(null);
  const lastProgress = useRef(1), soundOn = useRef(sound), live = useRef(true), facePoint = useRef({ x: 0, y: 0, max: 1 });
  const waveCb = useRef({ onWave, onClearWave }); waveCb.current = { onWave, onClearWave };
  useEffect(() => { soundOn.current = sound; if (!sound) sfx.current?.stop(); }, [sound]);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(q.matches); change(); q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);
  useEffect(() => { live.current = effects && !reduced; if (!effects || reduced) setMode("particle"); }, [effects, reduced]);
  useEffect(() => {
    const s = createAssemblySound(); sfx.current = s;
    const unlock = () => { if (soundOn.current) s.unlock(); };
    window.addEventListener("pointerdown", unlock, true); window.addEventListener("keydown", unlock, true);
    return () => { window.removeEventListener("pointerdown", unlock, true); window.removeEventListener("keydown", unlock, true); s.dispose(); sfx.current = null; };
  }, []);
  // A real state change (listening/thinking/speaking) ends the assembly and shows the mood.
  useEffect(() => { if (mood !== "idle") setMode("particle"); }, [mood]);
  useEffect(() => {
    const host = figureRef.current, slot = slotRef.current; if (!host || !slot) return;
    const resize = () => {
      const width = Math.min(slot.clientWidth, slot.clientHeight * 2 / 3);
      Object.assign(host.style, { width: `${width}px`, height: `${width * 3 / 2}px` });
      const r = host.getBoundingClientRect(); const x = r.left + r.width * CORE.x / 320, y = r.top + r.height * CORE.y / 480;
      facePoint.current = { x, y, max: Math.max(Math.hypot(x, y), Math.hypot(innerWidth - x, y), Math.hypot(x, innerHeight - y), Math.hypot(innerWidth - x, innerHeight - y)) };
    };
    const o = new ResizeObserver(resize); o.observe(slot); window.addEventListener("resize", resize); resize();
    return () => { o.disconnect(); window.removeEventListener("resize", resize); };
  }, []);
  const complete = useCallback(() => setMode("particle"), []);
  const frame = useCallback((info: GuideFrameInfo) => {
    const p = facePoint.current;
    if (info.shock >= 0 && live.current) waveCb.current.onWave?.(p.x, p.y, 12 + p.max * info.shock, Math.sin(Math.PI * info.shock) * .45);
    else waveCb.current.onClearWave?.();
    const canvas = fxRef.current; if (canvas && !fx.current) fx.current = createFx(canvas);
    const now = performance.now(), previous = lastProgress.current; lastProgress.current = info.progress;
    if (fx.current) { if (live.current) fx.current.draw(info.progress, info.progress >= 1 && info.shock < 0, now); else fx.current.clear(); }
    const s = sfx.current;
    if (s && live.current && soundOn.current) {
      if (info.progress < 1 && (previous >= 1 || info.progress < previous - .05)) s.start();
      if (previous < .86 && info.progress >= .86) s.burst();
      if (previous < 1 && info.progress >= 1) s.chime();
    } else if (s && info.progress >= 1 && previous < 1) s.stop();
    if (figureRef.current) figureRef.current.dataset.assembly = info.progress >= 1 ? "complete" : "building";
  }, []);
  useEffect(() => {
    const replayAssembly = () => { if (!live.current) return; setMode("assembly"); setReplay(r => r + 1); };
    window.addEventListener("n7eve:replay-assembly", replayAssembly);
    return () => window.removeEventListener("n7eve:replay-assembly", replayAssembly);
  }, []);
  return (
    <div ref={slotRef} className="eve-figure-slot">
      <div ref={figureRef} className="eve-figure" data-mood={mood} data-face={face}
        aria-label={mode === "assembly" ? "N7 guide particle-river assembly" : "N7 humanoid"}>
        <N7GuideScene key={face} source={face === "h01" ? H01_FIGURE : undefined} scale={face === "h01" ? 2.5 : undefined}
          mode={mode} mood={mood} effects={effects} reduced={reduced} breathing={breathing} gestures replay={replay}
          manualMotion={false} diagnostics={false} onComplete={complete} onFrame={frame} />
        <canvas ref={fxRef} aria-hidden="true" data-fx="assembly-burst" className="eve-figure-fx" />
      </div>
    </div>
  );
}
