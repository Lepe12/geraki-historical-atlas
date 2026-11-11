"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrbState } from "./ApexHeroOrb";

type Msg = { role: string; content: string };
type Conversation = { id: string; title: string };
type Task = { id: string; kind?: string; prompt: string; status: string; result?: string; error?: string };
type ApiData = Record<string, unknown>;
type Tab = "chat" | "tasks" | "research";

async function n7(path: string, payload?: Record<string, unknown>): Promise<ApiData> {
  if (!path.startsWith("/api/") || path.startsWith("//")) throw Error("Unsafe N7 API path");
  const response = await fetch(path, {
    method: payload ? "POST" : "GET",
    credentials: "same-origin",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: "no-store",
  });
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw Error("N7 API unavailable on this host; the interface must share the N7 origin");
  }
  const data = (await response.json()) as ApiData;
  if (!response.ok) throw Error(String(data.error || "N7 HTTP " + response.status));
  return data;
}
function idPath(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw Error("Invalid conversation ID");
  return encodeURIComponent(id);
}
const inputStyle: React.CSSProperties = {
  width: "100%", padding: 10, background: "#0b1420", color: "#e7f9fc",
  border: "1px solid #274755", borderRadius: 7, fontSize: 13,
};
const buttonStyle: React.CSSProperties = {
  padding: "9px 12px", border: "1px solid #29677b", borderRadius: 7,
  color: "#cdf9ff", background: "#112d39", cursor: "pointer",
};
export default function N7Workspace({ onActivity, onTrace, openSignal=0 }: {
  openSignal?:number;
  onActivity: (s: OrbState | null) => void;
  onTrace: (t: { n: number; trace: Array<{ helper: string }> }) => void;
}) {
  const trace = (...helpers: string[]) =>
    onTrace({ n: Date.now(), trace: helpers.map(helper => ({ helper })) });
  const [open, setOpen] = useState(false);
  useEffect(()=>{if(openSignal>0)setOpen(true);},[openSignal]);
  const [tab, setTab] = useState<Tab>("chat");
  const [online, setOnline] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [message, setMessage] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [kind, setKind] = useState("analysis");
  const [missionTarget, setMissionTarget] = useState("");
  const [missionQuestion, setMissionQuestion] = useState("");
  const [missionDates, setMissionDates] = useState("");
  const [missionId, setMissionId] = useState("");
  const [missionStatus, setMissionStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingJobs,setPendingJobs]=useState<{id:string;conversationId:string}[]>([]);
  const activeConversation=useRef(conversationId);
  useEffect(()=>{activeConversation.current=conversationId;},[conversationId]);
  useEffect(()=>{onActivity(busy||pendingJobs.some(j=>j.conversationId===conversationId)?"thinking":null);},[busy,pendingJobs,conversationId,onActivity]);
  useEffect(()=>{
    if(!pendingJobs.length)return;
    let disposed=false,inflight=false;const attempts=new Map<string,number>();
    const timer=window.setInterval(async()=>{
      if(inflight)return;inflight=true;
      try{await Promise.all(pendingJobs.map(async job=>{
        const attempt=(attempts.get(job.id)||0)+1;attempts.set(job.id,attempt);
        try{
          const state=await n7("/api/n7/job/"+idPath(job.id));if(disposed)return;
          if(state.status==="done"){
            if(activeConversation.current===job.conversationId){const reply=await n7("/api/conversations/"+idPath(job.conversationId));if(disposed)return;if(activeConversation.current===job.conversationId)setMessages((reply.conversation as {messages?:Msg[]})?.messages||[]);}
            setPendingJobs(jobs=>jobs.filter(j=>j.id!==job.id));
          }else if(state.status==="failed"){
            if(activeConversation.current===job.conversationId)setError("Η εργασία N7 απέτυχε. Μπορείς να συνεχίσεις τη συνομιλία.");
            setPendingJobs(jobs=>jobs.filter(j=>j.id!==job.id));
          }else if(attempt>=180){setError("Η παρακολούθηση της ουράς έληξε χωρίς επιβεβαιωμένη απάντηση.");setPendingJobs(jobs=>jobs.filter(j=>j.id!==job.id));}
        }catch(e){if(!disposed){setError("Ο έλεγχος της ουράς απέτυχε· η ολοκλήρωση δεν επιβεβαιώθηκε. "+(e instanceof Error?e.message:String(e)));setPendingJobs(jobs=>jobs.filter(j=>j.id!==job.id));}}
      }));}finally{inflight=false;}
    },10000);
    return()=>{disposed=true;window.clearInterval(timer);};
  },[pendingJobs]);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    try {
      const s = await n7("/api/status");
      setOnline(true);
      setAuthenticated(s.authenticated === true);
      if (s.authenticated === true) {
        const [c, t] = await Promise.all([n7("/api/conversations"), n7("/api/tasks")]);
        setConversations(Array.isArray(c.conversations) ? c.conversations as Conversation[] : []);
        setTasks(Array.isArray(t.tasks) ? t.tasks as Task[] : []);
      }
    } catch (e) {
      setOnline(false);
      setError(e instanceof Error ? e.message : "N7 connection error");
    }
  }, []);
  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    if (!open || !authenticated) return;
    const handle = window.setInterval(() => {
      void n7("/api/tasks").then(t => setTasks(Array.isArray(t.tasks) ? t.tasks as Task[] : [])).catch(() => {});
    }, 5000);
    return () => window.clearInterval(handle);
  }, [open, authenticated]);
  useEffect(() => {
    if (!missionId || !open) return;
    const refresh = () => { void n7("/api/research/missions/" + encodeURIComponent(missionId))
      .then(data => setMissionStatus(JSON.stringify(data, null, 2)))
      .catch(e => setMissionStatus(String(e))); };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [missionId, open]);

  async function chooseConversation(id: string) {
    setError("");
    try {
      const d = await n7("/api/conversations/" + idPath(id));
      const c = d.conversation as { messages?: Msg[] } | undefined;
      setConversationId(id);
      setMessages(c?.messages || []);
    } catch(e) { setError(String(e)); }
  }
  async function newConversation() {
    const d = await n7("/api/conversations", {});
    const id = String(d.id || "");
    if (!id) throw Error("N7 returned no conversation ID");
    setConversationId(id); setMessages([]);
    const list = await n7("/api/conversations");
    setConversations(Array.isArray(list.conversations) ? list.conversations as Conversation[] : []);
    return id;
  }
  async function send() {
    if (!message.trim() || busy || !authenticated) return;
    setBusy(true); setError(""); trace("orchestrator","memory","model_runtime");
    try {
      const id = conversationId || await newConversation();
      const result = await n7("/api/conversations/" + idPath(id) + "/chat", { message: message.trim() });
      const conv = result.conversation as { messages?: Msg[] } | undefined;
      if(result.pending===true&&typeof result.job_id==="string"){
        idPath(result.job_id);
        setPendingJobs(jobs=>jobs.some(j=>j.id===result.job_id)?jobs:[...jobs,{id:String(result.job_id),conversationId:id}]);
        setMessages(previous=>[...previous,{role:"user",content:message.trim()}]);
      }else if (conv?.messages) setMessages(conv.messages);
      else await chooseConversation(id);
      setMessage("");
      const list = await n7("/api/conversations");
      setConversations(Array.isArray(list.conversations) ? list.conversations as Conversation[] : []);
      // Text arrival is not audio playback; never invent a speaking event.
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function submitTask() {
    if (!taskPrompt.trim() || busy || !authenticated) return;
    setBusy(true); setError("");
    trace("orchestrator","task_runner",kind === "agent" ? "skills" : "model_runtime");
    try {
      await n7("/api/tasks", { prompt: taskPrompt.trim(), kind });
      const t = await n7("/api/tasks");
      setTasks(Array.isArray(t.tasks) ? t.tasks as Task[] : []);
      setTaskPrompt("");
    } catch(e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function submitMission() {
    if (missionTarget.trim().length < 3 || missionQuestion.trim().length < 12 || busy) return;
    setBusy(true); setError("");
    trace("orchestrator","research_planner","historian","evidence_audit","source_library","mission_bridge");
    try {
      const m = await n7("/api/research/missions", {
        target: missionTarget.trim(), purpose: missionQuestion.trim(),
        date_range: missionDates.trim(), aliases: ""
      });
      const requestId = String(m.request_id || "");
      if (!/^n7mission-[a-f0-9]{24}$/.test(requestId)) throw Error("Unverified mission request ID");
      setMissionId(requestId);
      setMissionStatus("Ανατέθηκε: " + requestId + " — αναμονή επιβεβαίωσης εκτέλεσης");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(x => !x)}
        aria-expanded={open} aria-controls="n7-workspace"
        style={{ position:"fixed",right:18,bottom:18,zIndex:80,...buttonStyle,
          boxShadow:"0 0 22px #00dafa45",fontWeight:700,letterSpacing:2 }}>
        N7 {online === true ? "●" : online === false ? "○" : "·"} {open ? "×" : "WORKSPACE"}
      </button>
      {open && <section id="n7-workspace" aria-label="N7 workspace"
        style={{position:"fixed",right:16,bottom:70,zIndex:80,width:"min(420px, calc(100vw - 32px))",
          height:"min(630px, calc(100vh - 100px))",overflow:"auto",padding:16,
          color:"#e7f9fc",background:"rgba(4,12,20,.98)",border:"1px solid #2d7183",
          borderRadius:13,boxShadow:"0 10px 45px #000b",fontFamily:"system-ui,sans-serif"}}>
        <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
          <strong style={{letterSpacing:3,color:"#65e8f5"}}>N7 CONTROL</strong>
          <span style={{fontSize:11,color:authenticated?"#68d4a1":"#efb58d"}}>
            {authenticated ? "Συνδεδεμένο" : online ? "Απαιτείται σύνδεση N7" : "Μη διαθέσιμο"}
          </span>
        </header>
        {!authenticated ? (
          <div style={{marginTop:18,fontSize:13,lineHeight:1.6}}>
            <p>Το πραγματικό N7 απαιτεί ενεργή συνεδρία στο ίδιο domain. Δεν χρησιμοποιούνται δοκιμαστικές απαντήσεις ή κρυφά tokens.</p>
            <a href="/" target="_blank" rel="noopener noreferrer" style={{color:"#65e8f5",display:"block",marginBottom:12}}>Σύνδεση στο N7</a>
            <button style={buttonStyle} type="button" onClick={() => void check()}>Επανέλεγχος σύνδεσης</button>
          </div>
        ) : (
          <>
            <nav aria-label="N7 operations" style={{display:"flex",gap:7,margin:"16px 0"}}>
              {(["chat","tasks","research"] as const).map(t =>
                <button key={t} type="button" style={{...buttonStyle,
                  background:tab===t?"#12516a":"#101c28",fontSize:12}}
                  onClick={() => setTab(t)}>{t==="chat"?"Συνομιλία":t==="tasks"?"Agents":"Έρευνα"}</button>)}
            </nav>
            {tab === "chat" && <div>
              {pendingJobs.some(j=>j.conversationId===conversationId)&&<p role="status" style={{fontSize:12}}>Αναμονή απάντησης N7. Μπορείς να συνεχίσεις τη συνομιλία.</p>}
              <select aria-label="Conversation" style={inputStyle} value={conversationId}
                onChange={e => void chooseConversation(e.target.value)}>
                <option value="">Νέα συνομιλία</option>
                {conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <div aria-live="polite" style={{height:240,overflow:"auto",padding:"10px 0",whiteSpace:"pre-wrap",fontSize:13}}>
                {messages.length===0 && <p style={{opacity:.7}}>Δεν υπάρχουν μηνύματα σε αυτή τη συνομιλία.</p>}
                {messages.map((m,i)=><article key={i} style={{marginBottom:12,
                  borderLeft:m.role==="user"?"2px solid #c99257":"2px solid #00c6e9",paddingLeft:8}}>
                  <small style={{opacity:.65}}>{m.role==="user"?"Εσύ":"N7"}</small><div>{m.content}</div>
                </article>)}
              </div>
              <textarea aria-label="Νέο μήνυμα" rows={3} value={message}
                onChange={e=>setMessage(e.target.value)} placeholder="Μίλησε στον N7..."
                style={{...inputStyle,resize:"vertical"}} />
              <button type="button" style={{...buttonStyle,marginTop:8}} disabled={busy||!message.trim()}
                onClick={() => void send()}>{busy?"Εκτέλεση...":"Αποστολή"}</button>
            </div>}
            {tab === "tasks" && <div>
              <textarea aria-label="Εργασία agent" value={taskPrompt} onChange={e=>setTaskPrompt(e.target.value)}
                rows={3} style={inputStyle} placeholder="Ανάθεσε εργασία στον N7..." />
              <select aria-label="Είδος εργασίας" value={kind} onChange={e=>setKind(e.target.value)}
                style={{...inputStyle,marginTop:7}}>
                <option value="analysis">Ανάλυση</option><option value="agent">Agent workspace</option>
              </select>
              <button style={{...buttonStyle,marginTop:8}} type="button" disabled={busy||!taskPrompt.trim()}
                onClick={() => void submitTask()}>Ανάθεση</button>
              <h4>Πραγματικές εργασίες</h4>
              <div aria-live="polite" style={{fontSize:12,maxHeight:200,overflow:"auto"}}>
                {tasks.map(t=><article key={t.id} style={{borderTop:"1px solid #24414d",padding:"9px 0"}}>
                  <b>{t.status}</b> · {t.prompt}
                  <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",opacity:.7}}>{t.result||t.error||""}</pre>
                </article>)}
              </div>
            </div>}
            {tab === "research" && <div>
              <input aria-label="Τόπος ή πρόσωπο" placeholder="Τόπος ή πρόσωπο" value={missionTarget}
                onChange={e=>setMissionTarget(e.target.value)} style={inputStyle}/>
              <textarea aria-label="Ερευνητικό ερώτημα" rows={3} placeholder="Ερευνητικό ερώτημα" value={missionQuestion}
                onChange={e=>setMissionQuestion(e.target.value)} style={{...inputStyle,marginTop:8}}/>
              <input aria-label="Χρονολογίες" placeholder="π.χ. 1600–1700" value={missionDates}
                onChange={e=>setMissionDates(e.target.value)} style={{...inputStyle,marginTop:8}}/>
              <button style={{...buttonStyle,marginTop:8}} type="button"
                disabled={busy||missionTarget.trim().length<3||missionQuestion.trim().length<12}
                onClick={() => void submitMission()}>Εκκίνηση αποστολής</button>
              <pre aria-live="polite" style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:11,maxHeight:230,overflow:"auto"}}>
                {missionStatus||"Δεν έχει ξεκινήσει αποστολή."}
              </pre>
            </div>}
          </>
        )}
        {error && <p role="alert" style={{fontSize:12,color:"#ffab9e",whiteSpace:"pre-wrap"}}>{error}</p>}
        <p style={{fontSize:10,opacity:.55,marginTop:18}}>Πραγματικό API · χωρίς απομιμήσεις Agents · χωρίς κλειδιά browser</p>
      </section>}
    </>
  );
}
