"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {createPortal} from "react-dom";
import useN7Voice from "./useN7Voice";
import {FEMALE_VOICE_ID} from "./N7FemaleVoice";
import {N7_GUIDE,N7_GUEST_CHAT} from "./N7BuildFlags";
import {speakable} from "./N7AgentSpeech";
import {GREETING_FIRST,GREETING_AGAIN,GREETED_KEY,describeAgents,describeCapabilities,describeTasks,go,isAgentsStatus,isCapabilitiesQuery,isFirstVisit,isTasksQuery,isWriteCommand,markGreeted,markWelcomed,navCommand,readConversationId,wasGreeted,writeConversationId} from "./N7Navigation";
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
// N7_SPECIALIST_AGENTS_V1: answers of the News & Geopolitics and Weather agents arrive in this same
// conversation. Their source addresses become active links, and the spoken version leaves the
// addresses and citation marks out. The text itself is never changed.
const LINK=/(https:\/\/[^\s<>"']+)/g;
export function richText(text:string){
  return text.split(LINK).map((part,i)=>{
    if(i%2===0)return part;
    let host="";try{const u=new URL(part);if(u.protocol!=="https:")return part;host=u.hostname.replace(/^www\./,"");}catch{return part;}
    return <a key={i} href={part} target="_blank" rel="noopener noreferrer" title={part} style={{color:"#65e8f5",wordBreak:"break-all"}}>{host} ↗</a>;
  });
}
export default function N7Workspace({ onActivity, onTrace, openSignal=0, guideOpen=false, onOpenFigure }: {
  onOpenFigure?:()=>void;
  guideOpen?:boolean;
  openSignal?:number;
  onActivity: (s: OrbState | "listening" | null) => void;
  onTrace: (t: { n: number; trace: Array<{ helper: string }> }) => void;
}) {
  const trace = (...helpers: string[]) =>
    onTrace({ n: Date.now(), trace: helpers.map(helper => ({ helper })) });
  const [open, setOpen] = useState(false);
  useEffect(()=>{if(openSignal>0)setOpen(true);},[openSignal]);
  const [tab, setTab] = useState<Tab>("chat");
  const [online, setOnline] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const guest=!authenticated&&N7_GUEST_CHAT;
  const wasAuthenticated=useRef(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [message, setMessage] = useState("");
  const autoSend=useRef<(text:string)=>void>(()=>{});
  const sending=useRef(false);
  const speechEnded=useRef<()=>void>(()=>{});
  const voice=useN7Voice(setMessage,text=>autoSend.current(text),()=>speechEnded.current());
  const voiceRef=useRef(voice);voiceRef.current=voice;
  const heard=useRef<Record<string,number>>({});
  const readAnswer=(id:string,messages:Msg[])=>{const replies=messages.filter(m=>m.role==="assistant");if(replies.length>(heard.current[id]||0)){heard.current[id]=replies.length;voiceRef.current.speak(speakable(replies.at(-1)!.content));}};
  const readAnswerRef=useRef(readAnswer);readAnswerRef.current=readAnswer;
  const [voiceOpen,setVoiceOpen]=useState(false),[voiceHost,setVoiceHost]=useState<HTMLElement|null>(null);
  useEffect(()=>{const show=()=>setVoiceOpen(true);window.addEventListener("n7:open-voice",show);return()=>window.removeEventListener("n7:open-voice",show);},[]);
  const [loginBusy,setLoginBusy]=useState(false);
  useEffect(()=>{setVoiceHost(guideOpen?document.getElementById("n7-guide-voice"):null);if(!guideOpen)voiceRef.current.suspend();},[guideOpen]);
  // N7_APEX_VOICE_FIRST_V1: the Humanoid is the interface. On entry N7 greets by voice (a first visit gets the full
  // welcome, later logins the short one, once per login) and, when the browser already allows the microphone, starts
  // listening by itself: listening -> understanding -> answering -> listening again. The microphone is closed while N7
  // speaks (the voice hook stops recognition during playback), so N7 never hears itself. Where the browser blocks
  // automatic audio, the page shows a temporary hint and the first tap or key starts everything (no permanent button).
  const home=N7_GUIDE&&!N7_GUEST_CHAT;
  const [controlsMode,setControlsMode]=useState(false);
  useEffect(()=>{try{setControlsMode(new URLSearchParams(window.location.search).get("controls")==="1");}catch{/* ignore */}},[]);
  const minimal=home&&!controlsMode;
  const [listLoaded,setListLoaded]=useState(false),[tapHint,setTapHint]=useState(false);
  const greeting=useRef({active:false,gesture:false}),conversationsRef=useRef<Conversation[]>([]);
  useEffect(()=>{conversationsRef.current=conversations;},[conversations]);
  const micAllowed=async()=>{try{return (await navigator.permissions.query({name:"microphone" as PermissionName})).state==="granted";}catch{return false;}};
  const begin=async(gesture:boolean)=>{
    if(wasGreeted())return;markGreeted();
    const first=isFirstVisit(conversationsRef.current.length>0);if(first)markWelcomed();
    greeting.current={active:true,gesture};
    voiceRef.current.speak(first?GREETING_FIRST:GREETING_AGAIN,true);
  };
  speechEnded.current=()=>{
    const g=greeting.current;if(!g.active)return;g.active=false;
    // A short pause after the last word, like the one used between answers, so the tail of N7's own voice is never taken as a command.
    window.setTimeout(()=>void (async()=>{if(!voiceRef.current.supported.input)return;if(g.gesture||await micAllowed())voiceRef.current.startConversation();})(),700);
  };
  const resumed=useRef(false);
  useEffect(()=>{
    if(!authenticated||guest||!minimal||!guideOpen||!voiceHost||!listLoaded||!voice.supported.output)return;
    let locked=true;
    try{const AudioCtor=window.AudioContext;if(AudioCtor){const probe=new AudioCtor();locked=probe.state!=="running";void probe.close();}}catch{locked=true;}
    if(wasGreeted()){
      // Already greeted in this login (a return from the Chat, NABOU or the library, or a refresh): no new greeting;
      // listening resumes only where the browser allows audio and already allows the microphone.
      if(resumed.current||locked||greeting.current.active)return;resumed.current=true;
      void (async()=>{if(voiceRef.current.supported.input&&await micAllowed())voiceRef.current.startConversation();})();
      return;
    }
    if(locked){setTapHint(true);return;}
    void begin(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authenticated,guest,minimal,guideOpen,voiceHost,listLoaded,voice.supported.input,voice.supported.output]);
  useEffect(()=>{
    if(!tapHint)return;
    const start=()=>{window.removeEventListener("pointerdown",start,true);window.removeEventListener("keydown",start,true);setTapHint(false);void begin(true);};
    window.addEventListener("pointerdown",start,true);window.addEventListener("keydown",start,true);
    return()=>{window.removeEventListener("pointerdown",start,true);window.removeEventListener("keydown",start,true);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tapHint]);
  // The small typing field, and the transient caption (typed exchanges, notices, errors, or when speech is unavailable).
  const [typing,setTyping]=useState(false),[typed,setTyped]=useState(""),[caption,setCaption]=useState("");
  const typingInput=useRef<HTMLInputElement>(null),typedPending=useRef(false);
  useEffect(()=>{if(typing)typingInput.current?.focus();},[typing]);
  useEffect(()=>{if(!caption)return;const timer=window.setTimeout(()=>setCaption(""),30000);return()=>window.clearTimeout(timer);},[caption]);
  // Real work in progress (tasks the server reports as running or queued) shows as a plain line and as «thinking».
  const [workActive,setWorkActive]=useState(false);
  useEffect(()=>{
    if(!authenticated||guest||!minimal||!guideOpen)return;
    let disposed=false;
    const poll=()=>void n7("/api/tasks").then(r=>{if(disposed)return;const rows=Array.isArray(r.tasks)?r.tasks as Task[]:[];setTasks(rows);setWorkActive(rows.some(x=>x.status==="running"||x.status==="queued"));}).catch(()=>{});
    poll();const timer=window.setInterval(poll,8000);
    return()=>{disposed=true;window.clearInterval(timer);};
  },[authenticated,guest,minimal,guideOpen]);
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
  // N7_APEX_HOME_V1: the Humanoid and the written Chat share ONE active conversation. On arrival the
  // conversation the Chat (or an earlier visit here) was using is opened, with its history; a new one
  // is created only when the user sends the first message and none exists.
  const adopt=useRef<(list:Conversation[])=>void>(()=>{});
  useEffect(()=>{activeConversation.current=conversationId;},[conversationId]);
  useEffect(()=>{if(conversationId&&!guest)writeConversationId(conversationId);},[conversationId,guest]);
  useEffect(()=>{onActivity(voice.phase||(busy||workActive||pendingJobs.some(j=>j.conversationId===conversationId)?"thinking":null));},[busy,workActive,pendingJobs,conversationId,onActivity,voice.phase]);
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
            if(activeConversation.current===job.conversationId){const reply=await n7("/api/conversations/"+idPath(job.conversationId));if(disposed)return;if(activeConversation.current===job.conversationId){const messages=(reply.conversation as {messages?:Msg[]})?.messages||[];setMessages(messages);readAnswerRef.current(job.conversationId,messages);}}
            setPendingJobs(jobs=>jobs.filter(j=>j.id!==job.id));
          }else if(state.status==="failed"){
            if(activeConversation.current===job.conversationId){setError("Η εργασία N7 απέτυχε. Μπορείς να συνεχίσεις τη συνομιλία.");voiceRef.current.failConversation("Η εργασία N7 απέτυχε. Μπορείς να ξεκινήσεις ξανά τη συζήτηση.");}
            setPendingJobs(jobs=>jobs.filter(j=>j.id!==job.id));
          }else if(attempt>=180){setError("Η παρακολούθηση της ουράς έληξε χωρίς επιβεβαιωμένη απάντηση.");if(activeConversation.current===job.conversationId)voiceRef.current.failConversation("Δεν επιβεβαιώθηκε απάντηση. Η φωνητική συζήτηση σταμάτησε.");setPendingJobs(jobs=>jobs.filter(j=>j.id!==job.id));}
        }catch(e){if(!disposed){setError("Ο έλεγχος της ουράς απέτυχε· η ολοκλήρωση δεν επιβεβαιώθηκε. "+(e instanceof Error?e.message:String(e)));if(activeConversation.current===job.conversationId)voiceRef.current.failConversation("Η σύνδεση με την ουρά διακόπηκε. Η φωνητική συζήτηση σταμάτησε.");setPendingJobs(jobs=>jobs.filter(j=>j.id!==job.id));}}
      }));}finally{inflight=false;}
    },10000);
    return()=>{disposed=true;window.clearInterval(timer);};
  },[pendingJobs]);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    try {
      const s = await n7("/api/status");
      setOnline(true);
      if(wasAuthenticated.current&&s.authenticated!==true){try{window.sessionStorage.removeItem(GREETED_KEY);}catch{/* ignore */}setListLoaded(false);voiceRef.current.suspend();setMessages([]);setConversations([]);setTasks([]);setPendingJobs([]);setConversationId("");}
      wasAuthenticated.current=s.authenticated===true;setAuthenticated(s.authenticated === true);
      if (s.authenticated === true) {
        const [c, t] = await Promise.all([n7("/api/conversations"), n7("/api/tasks")]);
        const list = Array.isArray(c.conversations) ? c.conversations as Conversation[] : [];
        setConversations(list);
        setTasks(Array.isArray(t.tasks) ? t.tasks as Task[] : []);
        adopt.current(list);setListLoaded(true);
      }
    } catch (e) {
      setOnline(false);
      setError(e instanceof Error ? e.message : "N7 connection error");
    }
  }, []);
  useEffect(() => { void check(); }, [check]);
  useEffect(()=>{const refresh=()=>void check();window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[check]);
  async function login(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget,input=form.elements.namedItem("password") as HTMLInputElement;
    setLoginBusy(true);setError("");try{await n7("/api/login",{password:input.value});input.value="";await check();}catch(e){input.value="";setError(e instanceof Error?e.message:String(e));}finally{setLoginBusy(false);}
  }

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

  adopt.current=list=>{
    if(guest||activeConversation.current)return;
    const shared=readConversationId();
    if(shared&&list.some(item=>item.id===shared))void chooseConversation(shared);
  };
  async function chooseConversation(id: string) {
    voice.suspend();setError("");
    try {
      const d = await n7("/api/conversations/" + idPath(id));
      const c = d.conversation as { messages?: Msg[] } | undefined;
      activeConversation.current=id;setConversationId(id);
      const messages=c?.messages||[];heard.current[id]=messages.filter(m=>m.role==="assistant").length;setMessages(messages);
    } catch(e) { setError(String(e)); }
  }
  async function newConversation() {
    voice.stop();
    if(guest){setMessages([]);setConversationId("");return "";}
    const d = await n7("/api/conversations", {});
    const id = String(d.id || "");
    if (!id) throw Error("N7 returned no conversation ID");
    activeConversation.current=id;heard.current[id]=0;setConversationId(id); setMessages([]);
    const list = await n7("/api/conversations");
    setConversations(Array.isArray(list.conversations) ? list.conversations as Conversation[] : []);
    return id;
  }
  async function send(spoken?:string) {
    const draft=typeof spoken==="string"?spoken:message;
    if(!draft.trim()||busy||sending.current||(!authenticated&&!guest))return;
    if(guest){
      const prompt=draft.trim();if(prompt.length>2000){setError("Γράψε έως 2.000 χαρακτήρες ανά μήνυμα.");voice.failConversation("Το μήνυμα είναι πολύ μεγάλο. Δοκίμασε πιο σύντομη φράση.");return;}
      const rows=[...messages.slice(-6),{role:"user",content:prompt}].map(m=>({role:m.role,content:m.content.slice(0,1500)}));
      rows[rows.length-1].content=prompt;
      sending.current=true;voice.stop();setBusy(true);setError("");setMessages(previous=>[...previous,{role:"user",content:prompt}]);
      try{const result=await n7("/api/n7-apex/chat",{messages:rows});if(typeof result.reply!=="string"||!result.reply.trim())throw Error("Το N7 δεν επέστρεψε απάντηση.");setMessages(previous=>[...previous,{role:"assistant",content:String(result.reply)}]);voiceRef.current.speak(result.reply);setMessage(current=>current.trim()===prompt?"":current);}
      catch(e){const error=e instanceof Error?e.message:String(e);setError(error);voiceRef.current.failConversation(error);}
      finally{sending.current=false;setBusy(false);}
      return;
    }
    if(isWriteCommand(draft)){setMessage("");setTyping(true);voiceRef.current.resume();return;} // «N7, θέλω να γράψω»: the field opens and listening goes on
    const informational=isAgentsStatus(draft)?"agents":isTasksQuery(draft)?"tasks":isCapabilitiesQuery(draft)?"capabilities":null;
    if(informational){
      // Answered from this installation's real reports (agents, tasks): nothing is invented, the model is not asked,
      // and a report that cannot be read is said plainly.
      voice.stop();setMessage("");setError("");
      try{
        const text=informational==="tasks"?describeTasks(await n7("/api/tasks") as never):informational==="agents"?describeAgents(await n7("/api/agents") as never):describeCapabilities(await n7("/api/agents") as never);
        setCaption(text);voiceRef.current.speak(text,true);
      }catch(e){const reason=e instanceof Error?e.message:String(e);const text="Η πληροφορία δεν είναι διαθέσιμη αυτή τη στιγμή: "+reason;setCaption(text);voiceRef.current.speak(text,true);}
      return;
    }
    const requested=navCommand(draft);
    if(requested){
      // Moving between the Humanoid, the Chat and NABOU is not a question for the model. The shared
      // conversation ID is saved first, so the other screen opens the same conversation.
      voice.stop();setMessage("");
      if(requested!=="humanoid")go(requested,conversationId||undefined);
      return;
    }
    const prompt=draft.trim();sending.current=true;voice.stop();setBusy(true); setError(""); trace("orchestrator","memory","model_runtime");
    try {
      const id = conversationId || await newConversation();
      const result = await n7("/api/conversations/" + idPath(id) + "/chat", { message: prompt });
      const conv = result.conversation as { messages?: Msg[] } | undefined;
      // The server names the specialist agent that answered (news/geopolitics or weather).
      if((result.agent as {id?:string}|undefined)?.id)trace("orchestrator","web_research");
      if(result.pending===true&&typeof result.job_id==="string"){
        idPath(result.job_id);
        setPendingJobs(jobs=>jobs.some(j=>j.id===result.job_id)?jobs:[...jobs,{id:String(result.job_id),conversationId:id}]);
        setMessages(previous=>[...previous,{role:"user",content:prompt}]);
      }else if (conv?.messages){if(activeConversation.current===id){setMessages(conv.messages);readAnswerRef.current(id,conv.messages);}}
      else {const reply=await n7("/api/conversations/"+idPath(id));const messages=(reply.conversation as {messages?:Msg[]})?.messages||[];if(activeConversation.current===id){setMessages(messages);readAnswerRef.current(id,messages);}}
      setMessage(current=>current.trim()===prompt?"":current);
      const list = await n7("/api/conversations");
      setConversations(Array.isArray(list.conversations) ? list.conversations as Conversation[] : []);
      // Text arrival is not audio playback; never invent a speaking event.
    } catch (e) { const error=e instanceof Error?e.message:String(e);setError(error);voiceRef.current.failConversation(error); }
    finally { sending.current=false;setBusy(false); }
  }
  autoSend.current=text=>{if(pendingJobs.some(j=>j.conversationId===conversationId)||sending.current||busy){voiceRef.current.failConversation("Το N7 απαντά ακόμη. Περίμενε πριν ξεκινήσεις ξανά.");return;}void send(text);};
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

  const lastAnswer=messages.filter(m=>m.role==="assistant").at(-1)?.content;
  const answerCount=messages.filter(m=>m.role==="assistant").length;
  const shownCount=useRef<number|undefined>(undefined);
  useEffect(()=>{
    // Counted, not compared by text: two replies may be identical.
    if(answerCount===shownCount.current)return;
    const wasFirst=shownCount.current===undefined,grew=shownCount.current!==undefined&&answerCount>shownCount.current;shownCount.current=answerCount;
    // A reply to a typed message, or any reply when this browser cannot speak, is also shown as text.
    if(lastAnswer&&!wasFirst&&grew&&(typedPending.current||!voice.supported.output)){typedPending.current=false;setCaption(lastAnswer);}
  },[answerCount,lastAnswer,voice.supported.output]);
  useEffect(()=>{if(error&&minimal)setCaption(error);},[error,minimal]);
  const loginForm=<form onSubmit={event=>void login(event)} style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <label>Κωδικός N7 <input name="password" type="password" autoComplete="current-password" required style={{...inputStyle,width:170}}/></label>
    <button type="submit" disabled={loginBusy} style={buttonStyle}>{loginBusy?"Σύνδεση…":"Σύνδεση"}</button>
    <p style={{fontSize:12,margin:0}}>Ο ίδιος κωδικός που χρησιμοποιείς στο N7. Δεν χρειάζεται νέος λογαριασμός.</p>
  </form>;
  const voiceControls=<div aria-label="Φωνητική συνομιλία N7" style={{fontSize:12,lineHeight:1.45}}>
    {!authenticated&&!guest?<>{loginForm}<button type="button" style={buttonStyle} onClick={()=>void check()}>Επανέλεγχος σύνδεσης</button></>:<>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
        {!voice.conversation&&<button type="button" style={buttonStyle} onClick={voice.toggle} aria-pressed={voice.enabled} disabled={!voice.supported.output}>Φωνή {voice.enabled?"ενεργή":"ανενεργή"}</button>}
        <button type="button" style={{...buttonStyle,background:voice.conversation?"#713c25":"#12516a"}} onClick={voice.conversation?voice.suspend:voice.startConversation} disabled={!voice.conversation&&(busy||pendingJobs.some(j=>j.conversationId===conversationId)||!voice.supported.input||!voice.supported.output)}>{voice.conversation?"Τέλος συζήτησης":"Έναρξη συζήτησης"}</button>
        {!voice.conversation&&<button type="button" style={buttonStyle} onClick={voice.listen} disabled={busy||pendingJobs.some(j=>j.conversationId===conversationId)||!voice.supported.input}>Υπαγόρευση</button>}
        {!voice.conversation&&<button type="button" style={buttonStyle} onClick={()=>{voice.suspend();}}>Διακοπή ήχου</button>}
        {!voice.conversation&&<button type="button" style={buttonStyle} onClick={()=>voice.speak("Γεια σου. Είμαι το N7. Η φωνή είναι έτοιμη.",true)} disabled={!voice.supported.output}>Δοκιμή φωνής</button>}
        {!voice.conversation&&lastAnswer&&<button type="button" style={buttonStyle} onClick={()=>voice.speak(speakable(lastAnswer),true)} disabled={!voice.supported.output}>Ανάγνωση απάντησης</button>}
      </div>
      {!voice.conversation&&<label>Φωνή συσκευής <select aria-label="Φωνή συσκευής" value={voice.voiceURI} onChange={e=>voice.setVoiceURI(e.target.value)}><option value={FEMALE_VOICE_ID}>N7 · Ελληνική γυναικεία</option><option value="">Αυτόματη φωνή συσκευής</option>{voice.voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label>}
      {!voice.supported.input&&<p>Το μικρόφωνο δεν υποστηρίζεται εδώ. Δοκίμασε Chrome/Edge ή γράψε το μήνυμα.</p>}
      {!voice.supported.output&&<p>Δεν υπάρχει διαθέσιμη εκφώνηση στον browser. Οι απαντήσεις εμφανίζονται ως κείμενο.</p>}
      <p style={{margin:"5px 0"}}>Πάτησε Έναρξη συζήτησης μία φορά. Μετά μιλάς και το N7 απαντά αυτόματα. Για διακοπή πες «τέλος συζήτησης» όταν σε ακούει. Το μικρόφωνο κλείνει όσο μιλά το N7. Ο browser μπορεί να χρησιμοποιεί την υπηρεσία αναγνώρισής του.</p>
      <p role="status" aria-label="Κατάσταση φωνής">{voice.status||"Πάτησε Δοκιμή φωνής για να ακούσεις το N7."}</p>
      {guideOpen&&<>
        {caption&&<div role="status" aria-label="Ενημέρωση N7" style={{maxHeight:90,overflow:"auto",whiteSpace:"pre-wrap",color:"#cdf9ff"}}>{caption}</div>}
        {lastAnswer&&<div aria-label="Τελευταία απάντηση N7" style={{maxHeight:70,overflow:"auto",whiteSpace:"pre-wrap"}}>{richText(lastAnswer)}</div>}
        <textarea aria-label="Φωνητικό μήνυμα" readOnly={voice.conversation} rows={2} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Μίλησε ή γράψε εδώ…" style={inputStyle}/>
        {!voice.conversation&&<button type="button" style={buttonStyle} onClick={()=>void send()} disabled={busy||!message.trim()}>Αποστολή στη φιγούρα</button>}
        {busy||pendingJobs.some(j=>j.conversationId===conversationId)?<span role="status"> Το N7 ετοιμάζει απάντηση…</span>:null}
      </>}
    </>}
    {error&&<p role="alert" style={{color:"#ffba9a"}}>{error}</p>}
  </div>;
  return (
    <>
      {guideOpen&&voiceHost&&minimal&&createPortal(<div style={{position:"relative",zIndex:5,display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"6px 12px calc(14px + env(safe-area-inset-bottom))",pointerEvents:"none"}}>
        {tapHint&&<p role="status" aria-label="Έναρξη N7" data-n7-tap="" style={{margin:0,color:"#bfe9f3",fontSize:13,letterSpacing:".06em",textShadow:"0 0 12px #000"}}>Πάτησε οπουδήποτε για να ξεκινήσει η N7</p>}
        {caption&&<div role="status" aria-label="Απάντηση N7" style={{pointerEvents:"auto",maxWidth:"min(760px,calc(100% - 24px))",maxHeight:"26dvh",overflow:"auto",whiteSpace:"pre-wrap",fontSize:14,lineHeight:1.55,color:"#e7f9fc",background:"rgba(3,11,18,.82)",border:"1px solid rgba(120,220,240,.14)",borderRadius:14,padding:"10px 14px"}}>{richText(caption)}</div>}
        {(workActive||pendingJobs.length>0)&&<p role="status" aria-label="Εκτελείται εργασία" style={{margin:0,color:"#9fdbe8",fontSize:12,letterSpacing:".08em"}}>Εκτελείται εργασία…</p>}
        {typing&&<form onSubmit={e=>{e.preventDefault();const text=typed.trim();if(!text)return;setTyped("");setTyping(false);typedPending.current=true;void send(text);}} style={{pointerEvents:"auto",display:"flex",gap:6,width:"min(640px,calc(100% - 24px))"}}>
          <input ref={typingInput} aria-label="Γράψε στην N7" value={typed} maxLength={2000} autoComplete="off" onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setTyped("");setTyping(false);}}} style={{...inputStyle,flex:1,borderRadius:22,padding:"10px 16px",background:"rgba(3,11,18,.88)",fontSize:16}} />
          <button type="submit" aria-label="Αποστολή" style={{...buttonStyle,borderRadius:22,padding:"0 16px"}} disabled={!typed.trim()}>➤</button>
        </form>}
        <button type="button" data-n7-keyboard="" aria-label="Πληκτρολόγιο" aria-expanded={typing} onClick={()=>{if(typing){setTyped("");}setTyping(x=>!x);}} style={{pointerEvents:"auto",width:40,height:32,display:"grid",placeItems:"center",padding:0,border:"1px solid rgba(140,225,245,.22)",borderRadius:8,background:"rgba(4,14,22,.45)",color:"#bfe9f3",cursor:"pointer"}}>
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><rect x="1" y="1" width="20" height="14" rx="2"/><path d="M4 5h1M7 5h1M10 5h1M13 5h1M16 5h2M4 8h2M8 8h1M11 8h1M14 8h1M17 8h1M6 11h10" strokeLinecap="round"/></svg>
        </button>
      </div>,voiceHost)}
      {guideOpen&&voiceHost&&!minimal&&createPortal(<div style={{position:"relative",zIndex:5,padding:"6px 12px",background:"#04121beb",flex:"none",maxHeight:"38dvh",overflow:"auto"}}>
        <button type="button" aria-expanded={voiceOpen} onClick={()=>{setVoiceOpen(x=>!x);if(voiceOpen)voice.suspend();}}>Φωνητική συνομιλία</button>
        {voiceOpen&&voiceControls}
      </div>,voiceHost)}
      <button type="button" onClick={() => {if(onOpenFigure&&N7_GUIDE&&window.matchMedia("(max-width:700px), (max-width:1000px) and (max-height:500px)").matches){setVoiceOpen(true);onOpenFigure();return;}setOpen(x => !x);}}
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
            {guest?"Συνομιλία χωρίς κωδικό":authenticated ? "Συνδεδεμένο" : online ? "Απαιτείται σύνδεση N7" : "Μη διαθέσιμο"}
          </span>
        </header>
        {!authenticated&&!guest ? (
          <div style={{marginTop:18,fontSize:13,lineHeight:1.6}}>
            {loginForm}
            <a href="/" target="_blank" rel="noopener noreferrer" style={{color:"#65e8f5",display:"block",marginBottom:12}}>Σύνδεση στο N7</a>
            <button style={buttonStyle} type="button" onClick={() => void check()}>Επανέλεγχος σύνδεσης</button>
          </div>
        ) : (
          <>
            {!guest&&<nav aria-label="N7 operations" style={{display:"flex",gap:7,margin:"16px 0"}}>
              {(["chat","tasks","research"] as const).map(t =>
                <button key={t} type="button" style={{...buttonStyle,
                  background:tab===t?"#12516a":"#101c28",fontSize:12}}
                  onClick={() => setTab(t)}>{t==="chat"?"Συνομιλία":t==="tasks"?"Agents":"Έρευνα"}</button>)}
            </nav>}
            {(guest||tab === "chat") && <div>
              {!guideOpen&&voiceControls}
              {pendingJobs.some(j=>j.conversationId===conversationId)&&<p role="status" style={{fontSize:12}}>Αναμονή απάντησης N7. Μπορείς να συνεχίσεις τη συνομιλία.</p>}
              {!guest&&<select aria-label="Conversation" style={inputStyle} value={conversationId}
                onChange={e => void chooseConversation(e.target.value)}>
                <option value="">Νέα συνομιλία</option>
                {conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>}
              <div aria-live="polite" style={{height:240,overflow:"auto",padding:"10px 0",whiteSpace:"pre-wrap",fontSize:13}}>
                {messages.length===0 && <p style={{opacity:.7}}>Δεν υπάρχουν μηνύματα σε αυτή τη συνομιλία.</p>}
                {messages.map((m,i)=><article key={i} style={{marginBottom:12,
                  borderLeft:m.role==="user"?"2px solid #c99257":"2px solid #00c6e9",paddingLeft:8}}>
                  <small style={{opacity:.65}}>{m.role==="user"?"Εσύ":"N7"}</small><div>{m.role==="assistant"?richText(m.content):m.content}</div>
                </article>)}
              </div>
              <textarea aria-label="Νέο μήνυμα" rows={3} value={message}
                onChange={e=>setMessage(e.target.value)} placeholder="Μίλησε στον N7..."
                style={{...inputStyle,resize:"vertical"}} />
              <button type="button" style={{...buttonStyle,marginTop:8}} disabled={busy||!message.trim()}
                onClick={() => void send()}>{busy?"Εκτέλεση...":"Αποστολή"}</button>
            </div>}
            {!guest&&tab === "tasks" && <div>
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
            {!guest&&tab === "research" && <div>
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
