#!/usr/bin/env python3
import argparse, pathlib, shutil, subprocess

UPSTREAM="https://github.com/RubenM1990/APEX-UI.git"
COMMIT="a8732fad1078a809cadfa810cb0d89cf4445dbed"

def run(*args,cwd=None):
    subprocess.run(args,cwd=cwd,check=True)

def patch_exact(path, old, new):
    text=path.read_text()
    if text.count(old)!=1:
        raise RuntimeError(f"anchor mismatch in {path}: {old[:80]!r}")
    path.write_text(text.replace(old,new,1))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",required=True)
    args=ap.parse_args()
    out=pathlib.Path(args.out).resolve()
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)
    run("git","init",str(out))
    run("git","remote","add","origin",UPSTREAM,cwd=out)
    run("git","fetch","--depth","1","origin",COMMIT,cwd=out)
    run("git","checkout","--detach","FETCH_HEAD",cwd=out)
    head=subprocess.check_output(["git","rev-parse","HEAD"],cwd=out,text=True).strip()
    if head!=COMMIT: raise RuntimeError("wrong upstream commit")
    overlay=pathlib.Path(__file__).with_name("apex-preview")
    shutil.copy2(overlay/"N7Workspace.tsx",out/"components/N7Workspace.tsx")
    shutil.copy2(overlay/"N7ApexStage.tsx",out/"components/N7ApexStage.tsx")

    patch_exact(out/"app/page.tsx",'import ApexWorld from "@/components/ApexWorld";','import N7ApexStage from "@/components/N7ApexStage";')
    patch_exact(out/"app/page.tsx",'''<section style={{ position: "relative", height: "100vh", minHeight: 620 }}>
        <ApexWorld />
      </section>''','<N7ApexStage />')
    patch_exact(out/"app/page.tsx","View on GitHub ↗","APEX UI · MIT SOURCE ↗")
    patch_exact(out/"app/layout.tsx",'title: "APEX-UI — Autonomous-agent orb interface",','title: "N7 — AI Workspace",')
    patch_exact(out/"app/layout.tsx",'<html lang="en">','<html lang="el">')
    patch_exact(out/"components/ApexWorld.tsx",'export default function ApexWorld() {','export default function ApexWorld({ n7Activity = null }: { n7Activity?: OrbState | null }) {')
    patch_exact(out/"components/ApexWorld.tsx",'const orbState: OrbState = showState;','const orbState: OrbState = n7Activity ?? showState;')
    for old,new in [
      ("Online - Apex routes work to it automatically","Interface role — verify execution in N7 WORKSPACE"),
      ("Integration - wired into the core","Visual role — connector status not verified"),
      ("Standby - in active development","Visual role — not a running task"),
      ("Connected and in use","Requires authenticated external connector"),
      ("Keeps Apex's development log","Keeps N7's development log"),
      ("Future: builds Apex itself","Coding tasks require N7 agent dispatch"),
      ("Part of the Apex core","Role shown in N7 interface"),
      ('aria-label="Apex agents"','aria-label="N7 agents"'),
      ('aria-label="Apex core - tap to energize"','aria-label="N7 core - tap to energize"'),
    ]:
      txt=(out/"components/ApexWorld.tsx").read_text()
      (out/"components/ApexWorld.tsx").write_text(txt.replace(old,new))
    txt=(out/"components/ReasoningWeb.jsx").read_text().replace("lab.textContent = 'Apex'","lab.textContent = 'N7'").replace('aria-label="Apex reasoning web"','aria-label="N7 reasoning web"')
    (out/"components/ReasoningWeb.jsx").write_text(txt)
    txt=(out/"components/ApexOverviewPanel.tsx").read_text().replace('fetch("/api/weather")','fetch("/n7-apex/api/weather/")')
    (out/"components/ApexOverviewPanel.tsx").write_text(txt)
    (out/"app/api/weather/route.ts").write_text('''import { NextResponse } from "next/server";
export const dynamic = "force-static";
export function GET(){ return NextResponse.json({current:null,city:"Athens"}); }
''')
    (out/"next.config.mjs").write_text('''const nextConfig={output:"export",trailingSlash:true,basePath:"/n7-apex",assetPrefix:"/n7-apex",images:{unoptimized:true}}; export default nextConfig;
''')
    print("N7_APEX_SOURCE_READY="+head)

if __name__=="__main__": main()
