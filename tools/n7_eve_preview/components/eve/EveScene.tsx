"use client";
// Decorative environment only (no data): the Olive 1662 Aegean chart from the atlas, darkened to
// navy, a planet glow on the horizon and a sci-fi harbour skyline. The approved N7 backdrop
// (nebula + light strands) stays as the deepest layer.
import { forwardRef } from "react";
import N7Backdrop, { type N7BackdropHandle } from "../N7Backdrop";
import { N7_EVE_ATLAS_BASE } from "../N7EveConfig";

// Deterministic skyline: towers, spires and domes, drawn once.
function skyline(seed: number, h: number, step: number) {
  let x = 0, r = seed, d = "M0 300 ";
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  while (x < 2000) {
    const w = step * (0.6 + rnd() * 1.4), top = 300 - h * (0.25 + rnd() * rnd() * 1.2), e = x + w;
    d += `L${x.toFixed(0)} 300 L${x.toFixed(0)} ${top.toFixed(0)} `;
    if (rnd() < 0.18) d += `L${(x + w * 0.45).toFixed(0)} ${top.toFixed(0)} L${(x + w / 2).toFixed(0)} ${(top - 55).toFixed(0)} L${(x + w * 0.55).toFixed(0)} ${top.toFixed(0)} `;
    d += `L${e.toFixed(0)} ${top.toFixed(0)} L${e.toFixed(0)} 300 `;
    x = e + rnd() * step * 0.4;
  }
  return d + "L2000 300 Z";
}
const FAR = skyline(7, 120, 34), NEAR = skyline(31, 190, 52);

const EveScene = forwardRef<N7BackdropHandle, { effects: boolean }>(function EveScene({ effects }, ref) {
  return (
    <div className="eve-scene" aria-hidden="true">
      <div className="eve-scene-nebula"><N7Backdrop ref={ref} effects={effects} reduced={false} /></div>
      <div className="eve-scene-map" style={{ backgroundImage: `url(${N7_EVE_ATLAS_BASE}jarvis-intelligence-chamber/assets/ollive-aegean-1662-preview.jpg)` }} />
      <div className="eve-scene-grid" />
      <div className="eve-scene-planet" />
      <svg className="eve-scene-city" viewBox="0 0 2000 300" preserveAspectRatio="none">
        <defs>
          <linearGradient id="eveCityFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#17405c" /><stop offset="1" stopColor="#081521" /></linearGradient>
          <linearGradient id="eveCityNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b1d2c" /><stop offset="1" stopColor="#04090f" /></linearGradient>
          <pattern id="eveWin" width="14" height="11" patternUnits="userSpaceOnUse"><rect x="3" y="3" width="2" height="1.4" fill="#7fe3f5" opacity=".55" /></pattern>
        </defs>
        <path d={FAR} fill="url(#eveCityFar)" opacity=".85" />
        <path d={FAR} fill="url(#eveWin)" opacity=".45" />
        <path d={NEAR} fill="url(#eveCityNear)" />
        <path d={NEAR} fill="url(#eveWin)" opacity=".6" />
        <line x1="0" y1="299" x2="2000" y2="299" stroke="#58d6ee" strokeOpacity=".35" />
      </svg>
      <div className="eve-scene-scan" />
      <div className="eve-scene-vignette" />
    </div>
  );
});
export default EveScene;
