#!/usr/bin/env python3
import argparse, pathlib, shutil, subprocess, base64, hashlib, os

UPSTREAM="https://github.com/RubenM1990/APEX-UI.git"
COMMIT="a8732fad1078a809cadfa810cb0d89cf4445dbed"

def run(*args,cwd=None):
    subprocess.run(args,cwd=cwd,check=True)

def patch_exact(path, old, new):
    text=path.read_text()
    if text.count(old)!=1:
        raise RuntimeError(f"anchor mismatch in {path}: {old[:80]!r}")
    path.write_text(text.replace(old,new,1))


def replace_between(path, start, end, replacement):
    text=path.read_text()
    a=text.find(start); b=text.find(end,a)
    if a<0 or b<0 or text.find(start,a+1)>=0:
        raise RuntimeError(f"section anchor mismatch in {path}: {start!r}")
    path.write_text(text[:a]+replacement+text[b:])

N7_GRAPH_ROSTER = """const ROSTER = [
  ['orchestrator',     'Orchestrator',       'consultant', 250, 212, true,  18, 9],
  ['memory',           'Memory',             'consultant', 452, 250, true, -18, 8],
  ['research_planner', 'Research Plan',      'consultant', 296, 118, true, -22, 6.5],
  ['historian',        'Historical Research','consultant', 182, 150, true,  24, 6.5],
  ['evidence_audit',   'Evidence Audit',     'consultant', 436, 148, true, -20, 6.5],
  ['editor',           'Greek Editor',       'consultant', 584, 208, true, -26, 6.5],
  ['coding_agent',     'Coding Agent',       'doer',       158, 266, true,  22, 6.5],
  ['task_runner',      'Task Runner',        'doer',       195, 298, true,  22, 6.5],
  ['source_scout',     'Source Scout',       'doer',       232, 330, true,  20, 6.5],
  ['web_research',     'Web Research',       'doer',       330, 374, true, -16, 6.5],
  ['browser_reader',   'Browser Reader',     'doer',       426, 350, false,-18, 6.5],
  ['pdf_reader',       'PDF Reader',         'doer',       502, 312, true, -22, 6.5],
  ['library_ingest',   'Library Ingest',     'doer',       118, 356, true,  26, 6],
  ['source_library',   'Source Library',     'tool',       256, 388, true,  20, 5.5],
  ['conversation_store','Conversations',     'tool',       414, 392, true, -18, 5.5],
  ['skills',           'Skills',             'tool',       560, 356, true, -24, 5.5],
  ['mission_bridge',   'Mission Bridge',     'tool',       608, 286, true, -26, 5.5],
  ['model_runtime',    'Model Runtime',      'tool',       582, 132, true,  24, 5.5],
]
"""

N7_WORLD_ROSTER = """export const ROSTER: { key: string; name: string; color: string }[] = [
  { key: "orchestrator",      name: "Orchestrator",        color: "#00e5ff" },
  { key: "memory",            name: "Memory",              color: "#00e5ff" },
  { key: "research_planner",  name: "Research Plan",       color: "#00e5ff" },
  { key: "historian",         name: "Historical Research", color: "#00e5ff" },
  { key: "evidence_audit",    name: "Evidence Audit",      color: "#00e5ff" },
  { key: "editor",            name: "Greek Editor",        color: "#00e5ff" },
  { key: "coding_agent",      name: "Coding Agent",        color: "#f5a623" },
  { key: "task_runner",       name: "Task Runner",         color: "#f5a623" },
  { key: "source_scout",      name: "Source Scout",        color: "#f5a623" },
  { key: "web_research",      name: "Web Research",        color: "#f5a623" },
  { key: "browser_reader",    name: "Browser Reader",      color: "#f5a623" },
  { key: "pdf_reader",        name: "PDF Reader",          color: "#f5a623" },
  { key: "library_ingest",    name: "Library Ingest",      color: "#f5a623" },
  { key: "source_library",    name: "Source Library",      color: "#7f9bb3" },
  { key: "conversation_store",name: "Conversations",       color: "#7f9bb3" },
  { key: "skills",            name: "Skills",              color: "#7f9bb3" },
  { key: "mission_bridge",    name: "Mission Bridge",      color: "#7f9bb3" },
  { key: "model_runtime",     name: "Model Runtime",       color: "#7f9bb3" },
];

export const INFO: Record<string, AgentInfo> = {
  orchestrator: { role: "Central agent orchestrator", status: "online",
    caps: ["Routes bounded autonomous tasks", "Calls only approved workspace tools", "Loads reviewed skills when relevant"],
    asks: ["Run this as an agent task", "Use the right N7 tools"] },
  memory: { role: "Persistent owner memory", status: "online",
    caps: ["Stores owner-approved writing guidance", "Keeps reviewed skill feedback", "Feeds approved context into later work"],
    asks: ["Remember this correction", "Use my approved writing rules"] },
  research_planner: { role: "Research mission controller", status: "online",
    caps: ["Dispatches signed research missions", "Tracks mission state", "Separates operational completion from historical verification"],
    asks: ["Start a research mission", "Show mission status"] },
  historian: { role: "Historical research engine", status: "online",
    caps: ["Queries the private historical library", "Builds source-attributed evidence sets", "Keeps unverified claims explicitly marked"],
    asks: ["Research this person", "Find evidence for this event"] },
  evidence_audit: { role: "Evidence quality gate", status: "integration",
    caps: ["Audits claims against sources", "Flags unsupported statements", "Preserves source identity and evidence status"],
    asks: ["Audit these claims", "Which claims lack evidence?"] },
  editor: { role: "Greek prose editor", status: "online",
    caps: ["Uses the reviewed Greek editing skill", "Preserves author voice and canon", "Applies owner-approved corrections"],
    asks: ["Edit this chapter", "Keep my style while correcting it"] },
  coding_agent: { role: "Verified coding agent", status: "integration",
    caps: ["Runs bounded Qwen coding tasks", "Tests generated changes", "Can produce review-only GitHub pull requests"],
    asks: ["Implement and test this change", "Prepare a draft PR"] },
  task_runner: { role: "Durable task queue", status: "online",
    caps: ["Queues analysis and agent jobs", "Persists task state", "Recovers bounded analysis jobs after restart"],
    asks: ["Run this independently", "Show my active tasks"] },
  source_scout: { role: "Source discovery worker", status: "integration",
    caps: ["Discovers candidate historical sources", "Hands candidates to evidence workflows", "Does not treat metadata as proof"],
    asks: ["Find candidate sources", "Scout references for this topic"] },
  web_research: { role: "Public web research", status: "online",
    caps: ["Runs bounded server-side web search", "Reads approved public historical pages", "Returns source URLs with retrieval status"],
    asks: ["Search the web", "Check current public sources"] },
  browser_reader: { role: "Read-only browser worker", status: "standby",
    caps: ["Reads allowlisted HTTPS pages", "Rejects form submission and arbitrary host access", "Requires browser capability to be configured"],
    asks: ["Open this approved page", "Read this public source"] },
  pdf_reader: { role: "PDF document reader", status: "integration",
    caps: ["Extracts page-bound PDF text", "Reports empty pages requiring OCR", "Preserves page numbers and partial-read status"],
    asks: ["Read this PDF", "Show which pages need OCR"] },
  library_ingest: { role: "Document ingestion worker", status: "online",
    caps: ["Ingests source files in bounded batches", "Tracks progress and source hashes", "Feeds the persistent historical library"],
    asks: ["Add this source", "Continue processing this book"] },
  source_library: { role: "Persistent historical source store", status: "online",
    caps: ["Stores source/page identity", "Searches imported material", "Returns evidence-linked excerpts"],
    asks: ["Search my library", "Find this name in my sources"] },
  conversation_store: { role: "Conversation persistence", status: "online",
    caps: ["Stores private conversation history", "Restores conversations after restart", "Keeps chat state separate from source evidence"],
    asks: ["Open an older conversation", "Continue this project"] },
  skills: { role: "Reviewed skills registry", status: "online",
    caps: ["Loads reviewed SKILL.md instructions", "Records owner feedback patterns", "Creates inactive improvement proposals for review"],
    asks: ["Use the historical audit skill", "List available skills"] },
  mission_bridge: { role: "Signed research bridge", status: "online",
    caps: ["Authenticates mission dispatch", "Protects private research routes", "Links N7 chat to the research workflow"],
    asks: ["Dispatch this mission", "Fetch its verified status"] },
  model_runtime: { role: "Model provider runtime", status: "online",
    caps: ["Runs the configured chat/model provider", "Supports tool-capable agent execution", "Exposes model availability through N7 status"],
    asks: ["Use the configured model", "Check model availability"] },
};

"""

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",required=True)
    args=ap.parse_args()
    out=pathlib.Path(args.out).resolve()
    base_path=os.getenv("N7_APEX_BASE_PATH","/n7-apex").rstrip("/") or "/n7-apex"
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)
    run("git","init",str(out))
    run("git","remote","add","origin",UPSTREAM,cwd=out)
    run("git","fetch","--depth","1","origin",COMMIT,cwd=out)
    run("git","checkout","--detach","FETCH_HEAD",cwd=out)
    head=subprocess.check_output(["git","rev-parse","HEAD"],cwd=out,text=True).strip()
    if head!=COMMIT: raise RuntimeError("wrong upstream commit")
    overlay=pathlib.Path(__file__).resolve().parent
    shutil.copy2(overlay/"N7Workspace.tsx",out/"components/N7Workspace.tsx")
    shutil.copy2(overlay/"N7ApexStage.tsx",out/"components/N7ApexStage.tsx")
    # Step 5/6 stays isolated; retain the normal production entry point.
    # The isolated Step 5 route must present the humanoid immediately.
    # Production /n7-apex keeps the normal button-controlled workflow.
    # isolated auto-open deployment marker
    if base_path.endswith("n7-apex-step5"):
        patch_exact(out/"components/N7ApexStage.tsx",
            "const [humanoidOpen,setHumanoidOpen]=useState(false);",
            "const [humanoidOpen,setHumanoidOpen]=useState(true);")
    shutil.copy2(overlay/"N7HumanoidView.tsx",out/"components/N7HumanoidView.tsx")
    shutil.copy2(overlay/"N7Backdrop.tsx",out/"components/N7Backdrop.tsx")
    shutil.copy2(overlay/"N7HeadSurface.ts",out/"components/N7HeadSurface.ts")
    (out/"components/N7BackdropReference.ts").write_text(f'export const N7_BACKDROP_REFERENCE = "{base_path}/n7-mountain-backdrop.webp";\n')
    shutil.copy2(overlay/"N7HumanoidReference.ts",out/"components/N7HumanoidReference.ts")
    (out/"components/N7HumanoidReference.ts").write_text(f'export const N7_HUMANOID_REFERENCE = "{base_path}/n7-humanoid-idle-v3.webp";\n')
    for part in overlay.glob("N7HumanoidReferencePart*.ts"):
        shutil.copy2(part, out/"components"/part.name)
    shutil.copy2(overlay/"N7HumanoidIdle.ts",out/"components/N7HumanoidIdle.ts")
    (out/"public").mkdir(parents=True, exist_ok=True)
    chunks = sorted((overlay/"assets_v3").glob("chunk*.b64"))
    if len(chunks) != 15:
        raise RuntimeError(f"expected 15 humanoid asset chunks, found {len(chunks)}")
    encoded = "".join(p.read_text().strip() for p in chunks)
    humanoid_bytes = base64.b64decode(encoded, validate=True)
    humanoid_sha = hashlib.sha256(humanoid_bytes).hexdigest()
    if humanoid_sha != "bdba288c56230908e1c6abd1a199e5a895159730faf27c672916b03d51a5c7e5":
        raise RuntimeError(f"wrong N7 humanoid asset sha256: {humanoid_sha}")
    (out/"public/n7-humanoid-idle-v3.webp").write_bytes(humanoid_bytes)
    shutil.copy2(overlay/"assets/n7-mountain-backdrop.webp",out/"public/n7-mountain-backdrop.webp")

    patch_exact(out/"app/page.tsx",'import ApexWorld from "@/components/ApexWorld";','import N7ApexStage from "@/components/N7ApexStage";')
    patch_exact(out/"app/page.tsx",'''<section style={{ position: "relative", height: "100vh", minHeight: 620 }}>
        <ApexWorld />
      </section>''','<N7ApexStage />')
    patch_exact(out/"app/page.tsx","View on GitHub ↗","APEX UI · MIT SOURCE ↗")
    patch_exact(out/"app/layout.tsx",'title: "APEX-UI — Autonomous-agent orb interface",','title: "N7 — AI Workspace",')
    patch_exact(out/"app/layout.tsx",'<html lang="en">','<html lang="el">')
    patch_exact(out/"components/ApexWorld.tsx",'export default function ApexWorld() {','export default function ApexWorld({ n7Activity = null }: { n7Activity?: OrbState | null }) {')
    patch_exact(out/"components/ApexWorld.tsx",'const orbState: OrbState = showState;','const orbState: OrbState = n7Activity ?? showState;')
    # Preserve APEX hierarchy/geometry, replace only the business-specific roster with real N7 subsystems.
    replace_between(out/"components/ReasoningWeb.jsx","const ROSTER = [","const META =",N7_GRAPH_ROSTER)
    replace_between(out/"components/ApexWorld.tsx","export const ROSTER:","const STATUS_LINE",N7_WORLD_ROSTER)
    patch_exact(out/"components/ApexWorld.tsx",
      'export default function ApexWorld({ n7Activity = null }: { n7Activity?: OrbState | null }) {',
      'export default function ApexWorld({ n7Activity = null, n7Trace = null }: { n7Activity?: OrbState | null; n7Trace?: unknown }) {')
    patch_exact(out/"components/ApexWorld.tsx",
      '          state={webState}\n          mode="full"',
      '          state={webState}\n          trace={n7Trace}\n          mode="full"')
    patch_exact(out/"components/ApexWorld.tsx",
      'online: { color: "#34d399", text: "Online - Apex routes work to it automatically" },\n  standby: { color: "#c9a84c", text: "Standby - in active development" },\n  integration: { color: "#7f9bb3", text: "Integration - wired into the core" },',
      'online: { color: "#34d399", text: "Live in the N7 runtime" },\n  standby: { color: "#c9a84c", text: "Available when the required host capability is configured" },\n  integration: { color: "#7f9bb3", text: "Verified subsystem or separate execution path" },')
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
    txt=(out/"components/ApexOverviewPanel.tsx").read_text().replace('fetch("/api/weather")',f'fetch("{base_path}/api/weather/")')
    (out/"components/ApexOverviewPanel.tsx").write_text(txt)
    (out/"app/api/weather/route.ts").write_text('''import { NextResponse } from "next/server";
export const dynamic = "force-static";
export function GET(){ return NextResponse.json({current:null,city:"Athens"}); }
''')
    (out/"next.config.mjs").write_text(f'''const nextConfig={{output:"export",trailingSlash:true,basePath:"{base_path}",assetPrefix:"{base_path}",images:{{unoptimized:true}}}}; export default nextConfig;
''')
    print("N7_APEX_SOURCE_READY="+head)

if __name__=="__main__": main()
