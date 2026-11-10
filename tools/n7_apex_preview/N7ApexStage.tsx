"use client";
import { useState } from "react";
import ApexWorld from "./ApexWorld";
import N7Workspace from "./N7Workspace";
import type { OrbState } from "./ApexHeroOrb";

export type N7Trace = { n: number; trace: Array<{ helper: string }> };

export default function N7ApexStage() {
  const [n7Activity, setN7Activity] = useState<OrbState | null>(null);
  const [n7Trace, setN7Trace] = useState<N7Trace | null>(null);
  return (
    <>
      <section style={{ position: "relative", height: "100vh", minHeight: 620 }}>
        <ApexWorld n7Activity={n7Activity} n7Trace={n7Trace} />
      </section>
      <N7Workspace onActivity={setN7Activity} onTrace={setN7Trace} />
    </>
  );
}
