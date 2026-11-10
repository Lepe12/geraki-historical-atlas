"use client";
import { useState } from "react";
import ApexWorld from "./ApexWorld";
import N7Workspace from "./N7Workspace";
import type { OrbState } from "./ApexHeroOrb";

export default function N7ApexStage() {
  const [n7Activity, setN7Activity] = useState<OrbState | null>(null);
  return (
    <>
      <section style={{ position: "relative", height: "100vh", minHeight: 620 }}>
        <ApexWorld n7Activity={n7Activity} />
      </section>
      <N7Workspace onActivity={setN7Activity} />
    </>
  );
}
