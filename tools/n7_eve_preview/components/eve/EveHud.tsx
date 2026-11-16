"use client";
// State ring (holo pedestal under the Humanoid). Ticks and brackets are decoration; only the lit
// segments carry meaning, and they follow the real N7 state.
import { useEffect, useRef } from "react";
import { readVoiceSignal } from "../N7VoiceSignal";
import type { N7State } from "./useN7Session";

const SEGMENTS = 36;
const STATES: { id: N7State; label: string; at: number }[] = [
  { id: "idle", label: "IDLE", at: -135 }, { id: "listening", label: "LISTENING", at: -45 },
  { id: "thinking", label: "THINKING", at: 45 }, { id: "speaking", label: "SPEAKING", at: 135 },
];
const rad = (deg: number) => (deg - 90) * Math.PI / 180;
const pt = (r: number, deg: number) => [500 + r * Math.cos(rad(deg)), 500 + r * Math.sin(rad(deg))];
function arc(r: number, a0: number, a1: number) {
  const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

// The capacitor-style ring around the Humanoid. Its lit segments follow the real N7 state:
// idle = resting, listening = microphone open, thinking = request pending (sweep),
// speaking = the real output audio level (N7VoiceSignal).
export function EveRing({ state }: { state: N7State }) {
  const segRef = useRef<SVGGElement>(null), stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    let raf = 0, prev = "";
    const segs = () => Array.from(segRef.current?.children || []) as SVGPathElement[];
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const s = stateRef.current, list = segs(); if (!list.length) return;
      let lit: (i: number) => number;
      if (s === "thinking") { const head = (now / 90) % SEGMENTS; lit = i => { const d = (head - i + SEGMENTS) % SEGMENTS; return d < 7 ? 1 - d / 8 : 0; }; }
      else if (s === "speaking") { const lv = Math.max(0, readVoiceSignal(now)); const n = Math.round(lv * SEGMENTS / 2); lit = i => { const d = Math.min(i, SEGMENTS - i); return d <= n ? 1 : 0.08; }; }
      else if (s === "listening") { const p = (Math.sin(now / 420) + 1) / 2; lit = i => (i % 2 === 0 ? .55 + .45 * p : .25); }
      else lit = () => .16;
      let key = s === "idle" ? "idle" : "";
      if (key && key === prev) return; prev = key;
      list.forEach((el, i) => { el.style.opacity = String(lit(i)); });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const ticks = Array.from({ length: 120 }, (_, i) => i * 3);
  return (
    <svg className="eve-ring" viewBox="0 0 1000 1000" aria-hidden="true" data-state={state}>
      <circle cx="500" cy="500" r="486" className="eve-ring-faint" />
      <g className="eve-ring-ticks">
        {ticks.map(a => { const long = a % 30 === 0, [x0, y0] = pt(long ? 462 : 470, a), [x1, y1] = pt(478, a);
          return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} data-long={long || undefined} />; })}
      </g>
      <g ref={segRef} className="eve-ring-cap">
        {Array.from({ length: SEGMENTS }, (_, i) => <path key={i} d={arc(440, i * 10 + 1.2, i * 10 + 8.8)} />)}
      </g>
      <circle cx="500" cy="500" r="418" className="eve-ring-dash" />
      <path d={arc(398, 200, 250)} className="eve-ring-bracket" /><path d={arc(398, 110, 160)} className="eve-ring-bracket" />
      <path d={arc(398, -70, -20)} className="eve-ring-bracket" /><path d={arc(398, 20, 70)} className="eve-ring-bracket" />
      {[0, 90, 180, 270].map(a => { const [x0, y0] = pt(380, a), [x1, y1] = pt(404, a); return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} className="eve-ring-cross" />; })}
      {STATES.map(s => {
        const [x, y] = pt(505, s.at), on = s.id === state, [mx, my] = pt(458, s.at);
        return <g key={s.id} className="eve-ring-state" data-on={on || undefined}>
          <circle cx={mx} cy={my} r={on ? 5 : 3} />
          <text x={x} y={y} textAnchor={s.at < 0 ? "end" : "start"} dominantBaseline="middle">{s.label}</text>
        </g>;
      })}
    </svg>
  );
}
