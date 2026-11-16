"use client";
// The N7 conversation, with the same runtime contract as N7Workspace (owner session, queued jobs).
// No fake replies: a message is only shown as N7's when the N7 runtime returned it.
import { useCallback, useEffect, useRef, useState } from "react";
import useN7Voice from "../useN7Voice";
import { n7Api, safeId, searchLibrary, txt, type LibraryHit } from "./eveApi";

export type Msg = { role: string; content: string; kind?: "library"; hits?: LibraryHit[]; query?: string; at?: number };
export type Conversation = { id: string; title: string; updated_at?: string; updatedAt?: string };
export type Task = { id: string; kind?: string; prompt: string; status: string; result?: string; error?: string; created_at?: string; createdAt?: string };
export type N7Status = { authenticated?: boolean; modelConfigured?: boolean; queueModelAvailable?: boolean; queueDispatchConfigured?: boolean; queueModel?: string };
export type N7State = "idle" | "listening" | "thinking" | "speaking";

export default function useN7Session(command?: (text: string) => boolean) {
  const commandRef = useRef(command); commandRef.current = command;
  const [online, setOnline] = useState<boolean | null>(null);
  const [status, setStatus] = useState<N7Status | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingJobs, setPendingJobs] = useState<{ id: string; conversationId: string }[]>([]);
  const sending = useRef(false);
  const active = useRef(conversationId);
  useEffect(() => { active.current = conversationId; }, [conversationId]);
  const autoSend = useRef<(text: string) => void>(() => {});
  const voice = useN7Voice(setDraft, text => autoSend.current(text));
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const heard = useRef<Record<string, number>>({});
  const readAnswer = (id: string, list: Msg[]) => {
    const replies = list.filter(m => m.role === "assistant");
    if (replies.length > (heard.current[id] || 0)) { heard.current[id] = replies.length; voiceRef.current.speak(txt(replies.at(-1)!.content)); }
  };
  const readRef = useRef(readAnswer); readRef.current = readAnswer;

  const refresh = useCallback(async () => {
    try {
      const s = (await n7Api("/api/status")) as N7Status;
      setOnline(true); setStatus(s); setAuthenticated(s.authenticated === true);
      if (s.authenticated === true) {
        const [c, t] = await Promise.all([n7Api("/api/conversations"), n7Api("/api/tasks")]);
        setConversations(Array.isArray(c.conversations) ? (c.conversations as Conversation[]) : []);
        setTasks(Array.isArray(t.tasks) ? (t.tasks as Task[]) : []);
      }
    } catch (e) {
      setOnline(false); setStatus(null);
      setError(e instanceof Error ? e.message : "N7 connection error");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const f = () => void refresh(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, [refresh]);
  useEffect(() => {
    if (!authenticated) return;
    const h = window.setInterval(() => { void n7Api("/api/tasks").then(t => setTasks(Array.isArray(t.tasks) ? (t.tasks as Task[]) : [])).catch(() => {}); }, 8000);
    return () => window.clearInterval(h);
  }, [authenticated]);

  // Queued N7 replies: poll the real job until done/failed. Never invent completion.
  useEffect(() => {
    if (!pendingJobs.length) return;
    let disposed = false, inflight = false; const attempts = new Map<string, number>();
    const timer = window.setInterval(async () => {
      if (inflight) return; inflight = true;
      try {
        await Promise.all(pendingJobs.map(async job => {
          const attempt = (attempts.get(job.id) || 0) + 1; attempts.set(job.id, attempt);
          try {
            const state = await n7Api("/api/n7/job/" + safeId(job.id)); if (disposed) return;
            if (state.status === "done") {
              if (active.current === job.conversationId) {
                const reply = await n7Api("/api/conversations/" + safeId(job.conversationId)); if (disposed) return;
                const list = ((reply.conversation as { messages?: Msg[] })?.messages) || [];
                setMessages(list); readRef.current(job.conversationId, list);
              }
              setPendingJobs(j => j.filter(x => x.id !== job.id));
            } else if (state.status === "failed") {
              setError("Η εργασία N7 απέτυχε. Μπορείς να συνεχίσεις τη συνομιλία.");
              voiceRef.current.failConversation("Η εργασία N7 απέτυχε.");
              setPendingJobs(j => j.filter(x => x.id !== job.id));
            } else if (attempt >= 180) {
              setError("Δεν επιβεβαιώθηκε απάντηση μέσα στον χρόνο αναμονής.");
              setPendingJobs(j => j.filter(x => x.id !== job.id));
            }
          } catch (e) {
            if (!disposed) { setError("Ο έλεγχος της απάντησης απέτυχε: " + (e instanceof Error ? e.message : String(e))); setPendingJobs(j => j.filter(x => x.id !== job.id)); }
          }
        }));
      } finally { inflight = false; }
    }, 10000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [pendingJobs]);

  async function login(password: string) {
    setError("");
    try { await n7Api("/api/login", { password }); await refresh(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
  }
  async function openConversation(id: string) {
    voice.suspend(); setError("");
    try {
      const d = await n7Api("/api/conversations/" + safeId(id));
      const list = ((d.conversation as { messages?: Msg[] })?.messages) || [];
      active.current = id; setConversationId(id); heard.current[id] = list.filter(m => m.role === "assistant").length; setMessages(list);
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
  }
  function newConversation() { voice.stop(); active.current = ""; setConversationId(""); setMessages([]); setError(""); }
  async function createConversation() {
    const d = await n7Api("/api/conversations", {});
    const id = String(d.id || ""); if (!id) throw Error("Το N7 δεν επέστρεψε συνομιλία.");
    active.current = id; heard.current[id] = 0; setConversationId(id);
    return id;
  }

  // Without the owner session the N7 model is not available (production rule). The typed question
  // then goes to the public library search, shown as library results — never as an N7 answer.
  async function libraryTurn(prompt: string) {
    setMessages(m => [...m, { role: "user", content: prompt, at: Date.now() }]);
    const r = await searchLibrary(prompt);
    if (!r.ok) throw Error(r.error === "timeout" ? "Η βιβλιοθήκη δεν απάντησε εγκαίρως." : "Η βιβλιοθήκη δεν είναι διαθέσιμη (" + r.error + ").");
    const hits = (r.data.hits || []).slice(0, 6);
    setMessages(m => [...m, { role: "library", kind: "library", query: prompt, hits, content: hits.length ? `Βρέθηκαν ${hits.length} σημεία στη βιβλιοθήκη.` : "Δεν βρέθηκε κάτι στη βιβλιοθήκη.", at: Date.now() }]);
  }

  async function send(spoken?: string) {
    const prompt = (typeof spoken === "string" ? spoken : draft).trim();
    if (!prompt || busy || sending.current) return;
    if (prompt.length > 4000) { setError("Γράψε έως 4.000 χαρακτήρες."); return; }
    // Interface commands (e.g. «άνοιξε τον χάρτη») are handled by the shell, not sent as questions.
    if (commandRef.current?.(prompt)) { setDraft(c => (c.trim() === prompt ? "" : c)); return; }
    sending.current = true; voice.stop(); setBusy(true); setError("");
    try {
      if (!authenticated) { await libraryTurn(prompt); setDraft(c => (c.trim() === prompt ? "" : c)); return; }
      const id = conversationId || (await createConversation());
      const result = await n7Api("/api/conversations/" + safeId(id) + "/chat", { message: prompt });
      const conv = result.conversation as { messages?: Msg[] } | undefined;
      if (result.pending === true && typeof result.job_id === "string") {
        safeId(result.job_id);
        setPendingJobs(j => (j.some(x => x.id === result.job_id) ? j : [...j, { id: String(result.job_id), conversationId: id }]));
        setMessages(m => [...m, { role: "user", content: prompt }]);
      } else if (conv?.messages) { if (active.current === id) { setMessages(conv.messages); readRef.current(id, conv.messages); } }
      else {
        const reply = await n7Api("/api/conversations/" + safeId(id));
        const list = ((reply.conversation as { messages?: Msg[] })?.messages) || [];
        if (active.current === id) { setMessages(list); readRef.current(id, list); }
      }
      setDraft(c => (c.trim() === prompt ? "" : c));
      const list = await n7Api("/api/conversations");
      setConversations(Array.isArray(list.conversations) ? (list.conversations as Conversation[]) : []);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message); voiceRef.current.failConversation(message);
    } finally { sending.current = false; setBusy(false); }
  }
  const waiting = pendingJobs.some(j => j.conversationId === conversationId);
  autoSend.current = text => { if (waiting || sending.current || busy) { voiceRef.current.failConversation("Το N7 απαντά ακόμη. Περίμενε λίγο."); return; } void send(text); };

  // One state for the whole system, from real signals only.
  const state: N7State = voice.phase === "listening" ? "listening" : voice.phase === "speaking" ? "speaking" : busy || waiting ? "thinking" : "idle";

  return { online, status, authenticated, conversations, conversationId, messages, tasks, draft, setDraft, busy, waiting, error, setError,
    voice, state, refresh, login, send, openConversation, newConversation };
}
export type N7Session = ReturnType<typeof useN7Session>;
