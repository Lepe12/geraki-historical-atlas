"use client";
// N7 · command interface. Composes the existing N7 parts (guide Humanoid, voice, N7 runtime API)
// with the real NABOU map and pct-live library. Isolated route; the current N7 pages are untouched.
// Every status on screen comes from N7 (/api/status) or pct-live; nothing is simulated.
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, ScanFace, Mic, MicOff, Volume2, VolumeX, Settings2 } from "lucide-react";
import type { N7BackdropHandle } from "../N7Backdrop";
import EveScene from "./EveScene";
import EveRail, { SECTIONS, type Section } from "./EveRail";
import EveHumanoid from "./EveHumanoid";
import { EveRing } from "./EveHud";
import EveCommandBar from "./EveCommandBar";
import EveConversation from "./EveConversation";
import EvePanel from "./EvePanel";
import LibraryPanel from "./LibraryPanel";
import AgentsPanel from "./AgentsPanel";
import NabouWorkspace from "./NabouWorkspace";
import { ResearchPanel, HistoryPanel, SettingsPanel, ProjectsPanel, type EveSettings } from "./OtherPanels";
import { WelcomePanel, AgentsListPanel, ProjectPanel, QuickActionsPanel, SystemPanel } from "./EveSide";
import useN7Session from "./useN7Session";
import useSystemStatus from "./useSystemStatus";
import { txt } from "./eveApi";
import "./eve.css";

type Workspace = "n7" | "nabou";
type Panel = Exclude<Section, "n7" | "nabou"> | "overview" | null;
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.!;·]/g, "").trim();
const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width:760px)").matches;
const NAV: { id: Section; label: string }[] = [
  { id: "research", label: "Έρευνα" }, { id: "sources", label: "Πηγές" }, { id: "nabou", label: "NABOU Χάρτης" },
  { id: "agents", label: "Agents" }, { id: "library", label: "Βιβλιοθήκη" }, { id: "projects", label: "Έργα" },
];

function Logo() {
  return (
    <svg className="eve-logo" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 2 36 11v18L20 38 4 29V11Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M20 7 31.5 13.5v13L20 33 8.5 26.5v-13Z" fill="rgba(111,207,228,.08)" stroke="currentColor" strokeOpacity=".45" strokeWidth=".8" />
      <text x="20" y="24.5" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" fontFamily="inherit">N7</text>
    </svg>
  );
}

export default function N7EveShell() {
  const [workspace, setWorkspace] = useState<Workspace>("n7");
  const [panel, setPanel] = useState<Panel>(null);
  const [nabouMounted, setNabouMounted] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState<string | undefined>();
  const [settings, setSettings] = useState<EveSettings>({ face: "n7", effects: true, sound: true, breathing: true });
  const backdrop = useRef<N7BackdropHandle>(null);
  const sys = useSystemStatus();

  const goWorkspace = useCallback((w: Workspace) => { setWorkspace(w); if (w === "nabou") setNabouMounted(true); }, []);
  const openLibrary = useCallback((q?: string) => { setLibraryQuery(q); setPanel("library"); }, []);
  const command = useCallback((text: string) => {
    const t = norm(text);
    if (/^(ανοιξε |δειξε |παμε (στο|στον) )?(το |τον )?(χαρτη|nabou|ναμπου)$/.test(t)) { goWorkspace("nabou"); setPanel(null); return true; }
    if (/^(πισω|επιστροφη)( στο n7)?$|^n7$/.test(t)) { goWorkspace("n7"); return true; }
    const lib = text.trim().match(/^(?:ψ[άα]ξε στη βιβλιοθ[ήη]κη|βιβλιοθ[ήη]κη|ψ[άα]ξε)\s*[:·-]?\s+(.+)$/i);
    if (lib) { openLibrary(lib[1].trim()); return true; }
    return false;
  }, [goWorkspace, openLibrary]);
  const session = useN7Session(command);
  const { voice } = session;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("n7-eve-settings") || "null");
      const face = new URLSearchParams(location.search).get("face") || localStorage.getItem("n7-face");
      setSettings(s => ({ ...s, ...(saved || {}), ...(face === "h01" || face === "n7" ? { face } : {}) }));
    } catch { /* defaults */ }
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.replace(/^#/, "")).toLowerCase();
      if (h === "nabou") { goWorkspace("nabou"); setPanel(null); }
      else if (h === "n7") { goWorkspace("n7"); setPanel(null); }
      else if (SECTIONS.some(s => s.id === h) || h === "history") setPanel(h as Panel);
    };
    fromHash(); window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [goWorkspace]);
  // A new message opens the conversation so the reply (N7 or library) is visible.
  const msgCount = session.messages.length, seen = useRef(0);
  useEffect(() => { if (msgCount > seen.current) setPanel(p => (p === null || p === "overview" ? "chat" : p)); seen.current = msgCount; }, [msgCount]);
  useEffect(() => { try { localStorage.setItem("n7-eve-settings", JSON.stringify(settings)); localStorage.setItem("n7-face", settings.face); } catch { /* private mode */ } }, [settings]);

  const select = (s: Section) => {
    setMobileNav(false);
    if (s === "n7" || s === "nabou") {
      goWorkspace(s);
      // On a phone, N7 opens the overview sheet (the side panels); on desktop it returns to the home screen.
      setPanel(s === "n7" && isPhone() ? "overview" : null);
      history.replaceState(null, "", "#" + s); return;
    }
    setPanel(p => (p === s ? null : s)); history.replaceState(null, "", "#" + s);
  };
  const active: Section = panel && panel !== "overview" ? panel : workspace;
  const close = () => setPanel(null);
  const toLogin = () => setPanel("settings");
  const prefill = (text: string) => {
    session.setDraft(text); setPanel(null);
    requestAnimationFrame(() => { const el = document.querySelector<HTMLTextAreaElement>(".eve-main-command textarea"); el?.focus(); el?.setSelectionRange(text.length, text.length); });
  };
  const micOn = voice.conversation || voice.phase === "listening";
  const mic = () => { if (micOn) { voice.suspend(); return; } if (session.authenticated && voice.supported.output) voice.startConversation(); else voice.listen(); };
  const lastN7 = txt(session.messages.filter(m => m.role === "assistant").at(-1)?.content);
  const onlineTone = session.online ? "ok" : session.online === false ? "warn" : "off";

  const side = {
    welcome: <WelcomePanel session={session} />,
    agents: <AgentsListPanel session={session} sys={sys} onOpen={() => setPanel("agents")} />,
    project: <ProjectPanel sys={sys} onOpen={() => setPanel("projects")} />,
    quick: <QuickActionsPanel session={session} onMap={() => select("nabou")} onResearch={() => setPanel("research")} onPrefill={prefill} />,
    system: <SystemPanel session={session} sys={sys} />,
  };

  let dock: React.ReactNode = null;
  if (panel === "chat") dock = (
    <EvePanel title={workspace === "nabou" ? "N7 στον χάρτη" : "Συνομιλία"} code="N7 · COMMS" onClose={close}
      footClass="eve-chat-foot" footer={<EveCommandBar session={session} compact placeholder={workspace === "nabou" ? "Ρώτα το N7 για τον χάρτη…" : undefined} />}>
      <EveConversation session={session} onLogin={toLogin} onLibrary={openLibrary} />
    </EvePanel>
  );
  else if (panel === "library" || panel === "sources") dock = <LibraryPanel key={panel} view={panel === "sources" ? "sources" : "search"} onClose={close} initialQuery={panel === "library" ? libraryQuery : undefined} />;
  else if (panel === "agents") dock = <AgentsPanel session={session} onClose={close} />;
  else if (panel === "research") dock = <ResearchPanel session={session} onClose={close} onOpenNabou={() => select("nabou")} onLogin={toLogin} />;
  else if (panel === "projects") dock = <ProjectsPanel sys={sys} onClose={close} onHistory={() => setPanel("history")} />;
  else if (panel === "history") dock = <HistoryPanel session={session} onClose={close} onOpen={() => { goWorkspace("n7"); setPanel("chat"); }} onLogin={toLogin} />;
  else if (panel === "settings") dock = <SettingsPanel session={session} settings={settings} onChange={setSettings} onClose={close} />;
  else if (panel === "overview") dock = <div className="eve-overview">{side.welcome}{side.agents}{side.project}{side.quick}{side.system}<button type="button" className="eve-btn eve-btn-wide" onClick={close}>Κλείσιμο</button></div>;

  return (
    <div className="eve-root" data-workspace={workspace} data-dock={dock ? "open" : "closed"} data-panel={panel || "none"} data-state={session.state}>
      <EveScene ref={backdrop} effects={settings.effects} />
      <header className="eve-top">
        <button type="button" className="eve-icon-btn eve-menu" aria-label="Μενού" aria-expanded={mobileNav} onClick={() => setMobileNav(x => !x)}><Menu size={18} strokeWidth={1.4} /></button>
        <button type="button" className="eve-brand" onClick={() => select("n7")} aria-label="N7 — αρχική">
          <Logo /><span><b>N7</b><small>AI COMMAND INTERFACE</small></span>
        </button>
        <nav className="eve-tabs" aria-label="Ενότητες">
          {NAV.map(n => <button key={n.id} type="button" aria-current={active === n.id ? "page" : undefined} data-section={n.id} onClick={() => select(n.id)}>{n.label}</button>)}
        </nav>
        <div className="eve-top-right">
          <span className="eve-online" data-tone={onlineTone} title={session.authenticated ? "Συνδεδεμένος κάτοχος" : "Χωρίς σύνδεση κατόχου"}>
            <i />N7 {session.online === null ? "…" : session.online ? "Online" : "Offline"}</span>
          <button type="button" className="eve-icon-btn" aria-pressed={micOn} onClick={mic} disabled={!voice.supported.input}
            aria-label={micOn ? "Σταμάτημα μικροφώνου" : "Μικρόφωνο"}>{micOn ? <MicOff size={16} strokeWidth={1.5} /> : <Mic size={16} strokeWidth={1.5} />}</button>
          <button type="button" className="eve-icon-btn" aria-pressed={voice.enabled} onClick={voice.toggle} disabled={!voice.supported.output}
            aria-label={voice.enabled ? "Κλείσιμο εκφώνησης" : "Εκφώνηση απαντήσεων"}>{voice.enabled ? <Volume2 size={16} strokeWidth={1.5} /> : <VolumeX size={16} strokeWidth={1.5} />}</button>
          <button type="button" className="eve-icon-btn" aria-pressed={panel === "settings"} onClick={() => select("settings")} aria-label="Ρυθμίσεις"><Settings2 size={16} strokeWidth={1.5} /></button>
        </div>
      </header>
      <EveRail active={active} onSelect={select} mobileOpen={mobileNav} />
      {mobileNav && <button type="button" className="eve-scrim" aria-label="Κλείσιμο μενού" onClick={() => setMobileNav(false)} />}

      <main className="eve-stage">
        <section className="eve-n7" data-visible={workspace === "n7"} aria-hidden={workspace !== "n7"} aria-label="N7">
          <div className="eve-ring-slot" aria-hidden="true"><EveRing state={session.state} /></div>
          <EveHumanoid mood={session.state} effects={settings.effects} sound={settings.sound} breathing={settings.breathing} face={settings.face}
            onWave={(x, y, r, f) => backdrop.current?.wave(x, y, r, f)} onClearWave={() => backdrop.current?.clear()} />
          <div className="eve-n7-foot">
            {panel !== "chat" && lastN7 && <p className="eve-subtitle" aria-live="polite">{lastN7.length > 220 ? lastN7.slice(0, 220) + "…" : lastN7}</p>}
            <div className="eve-main-command"><EveCommandBar session={session} placeholder="Γράψε ή μίλησε στο N7..." /></div>
          </div>
        </section>
        {nabouMounted && <NabouWorkspace visible={workspace === "nabou"} />}
        {workspace === "nabou" && !dock && <button type="button" className="eve-dock-open eve-dock-open-map" onClick={() => setPanel("chat")}><ScanFace size={15} strokeWidth={1.4} /> N7</button>}
        {workspace === "n7" && <aside className="eve-col eve-col-left" aria-label="Υποδοχή και agents">{side.welcome}{side.agents}</aside>}
        {dock ? <aside className="eve-col eve-col-right eve-dock" aria-label="Πλαϊνό panel">{dock}</aside>
          : workspace === "n7" && <aside className="eve-col eve-col-right" aria-label="Έργο, ενέργειες και σύστημα">{side.project}{side.quick}{side.system}</aside>}
      </main>
    </div>
  );
}
