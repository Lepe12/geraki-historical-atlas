"use client";
import { useState } from "react";
import ApexWorld from "./ApexWorld";
import N7Workspace from "./N7Workspace";
import N7HumanoidView from "./N7HumanoidView";
import type { OrbState } from "./ApexHeroOrb";
import { N7_HUMANOID_REFERENCE } from "./N7HumanoidReference";

export type N7Trace = { n: number; trace: Array<{ helper: string }> };

export default function N7ApexStage() {
  const isolatedGuide=N7_HUMANOID_REFERENCE.includes("/n7-apex-step5/");
  const [n7Activity, setN7Activity] = useState<OrbState | "listening" | null>(null);
  const [workspaceRequest,setWorkspaceRequest]=useState(0);
  const [n7Trace, setN7Trace] = useState<N7Trace | null>(null);
  const [humanoidOpen,setHumanoidOpen]=useState(false);
  return (
    <>
      <div inert={humanoidOpen} aria-hidden={humanoidOpen?true:undefined}>
      <section style={{ position: "relative", height: "100vh", minHeight: 620, background:isolatedGuide?"#030c13":undefined }}>
        {!humanoidOpen&&!isolatedGuide&&<ApexWorld n7Activity={n7Activity==="listening"?"idle":n7Activity} n7Trace={n7Trace} />}
      </section>
      <button type="button" onClick={()=>setHumanoidOpen(true)}
        style={{position:"fixed",left:18,bottom:18,zIndex:79,padding:"9px 12px",border:"1px solid #29677b",
          borderRadius:7,color:"#cdf9ff",background:"#112d39",cursor:"pointer",fontWeight:700,letterSpacing:1.5,
          boxShadow:"0 0 20px #00dafa38"}}>HUMANOID</button>
      <N7Workspace guideOpen={humanoidOpen&&isolatedGuide} openSignal={workspaceRequest} onActivity={setN7Activity} onTrace={setN7Trace} />
      </div>
      <N7HumanoidView onWorkspace={()=>{setHumanoidOpen(false);setWorkspaceRequest(x=>x+1);}} open={humanoidOpen} onClose={()=>{setHumanoidOpen(false);if(isolatedGuide)setWorkspaceRequest(x=>x+1);}} activity={n7Activity==="thinking"||n7Activity==="listening"||n7Activity==="speaking"?n7Activity:null} />
    </>
  );
}
