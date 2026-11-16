"use client";
// N7 · EVE redesign shell. Composes the existing N7 parts (guide Humanoid, voice, N7 runtime API)
// with the real NABOU map and pct-live library. Isolated route; the current N7 pages are untouched.
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, PanelRightOpen, Map as MapIcon, ScanFace } from "lucide-react";
import N7Backdrop, { type N7BackdropHandle } from "../N7Backdrop";
import EveRail, { SECTIONS, type Section } from "./EveRail";
import EveHumanoid from "./EveHumanoid";
import EveCommandBar from "./EveCommandBar";
import EveConversation from "./EveConversation";
import EvePanel from "./EvePanel";
import LibraryPanel from "./LibraryPanel";
import AgentsPanel from "./AgentsPanel";
import NabouWorkspace from "./NabouWorkspace";
import { ResearchPanel, HistoryPanel, NotConnectedPanel, SettingsPanel, type EveSettings } from "./OtherPanels";
import useN7Session from "./useN7Session";
import { pct, txt } from "./eveApi";
import "./eve.css";

type Workspace = "n7" | "nabou";
type Panel = Exclude<Section, "n7" | "nabou"> | "chat" | null;
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.!;·]/g, "").trim();

export default function N7EveShell() {
  const [workspace, setWorkspace] = useState<Workspace>("n7");
  const [panel, setPanel] = useState<Panel>("chat");
  const [nabouMounted, setNabouMounted] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState<string | undefined>();
  const [libraryOnline, setLibraryOnline] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<EveSettings>({ face: "n7", effects: true, sound: true, breathing: true });
  const backdrop = useRef<N7BackdropHandle>(null);

  const goWorkspace = useCallback((w: Workspace) => { setWorkspace(w); if (w === "nabou") setNabouMounted(true); setPanel(p => (p === null || p === "chat" ? "chat" : p)); }, []);
  const openLibrary = useCallback((q?: string) => { setLibraryQuery(q); setPanel("library"); }, []);
  const command = useCallback((text: string) => {
    const t = norm(text);
    if (/^(ανοιξε |δειξε |παμε (στο|στον) )?(το |τον )?(χαρτη|nabou|ναμπου)$/.test(t)) { goWorkspace("nabou"); return true; }
    if (/^(πισω|επιστροφη)( στο n7)?$|^n7$/.test(t)) { goWorkspace("n7"); return true; }
    const lib = text.trim().match(/^(?:ψ[άα]ξε στη βιβλιοθ[ήη]κη|βιβλιοθ[ήη]κη|ψ[άα]ξε)\s*[:·-]?\s+(.+)$/i);
    if (lib) { openLibrary(lib[1].trim()); return true; }
    return false;
  }, [goWorkspace, openLibrary]);
  const session = useN7Session(command);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("n7-eve-settings") || "null");
      const face = new URLSearchParams(location.search).get("face") || localStorage.getItem("n7-face");
      setSettings(s => ({ ...s, ...(saved || {}), ...(face === "h01" || face === "n7" ? { face } : {}) }));
    } catch { /* defaults */ }
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.replace(/^#/, "")).toLowerCase();
      if (h === "nabou") goWorkspace("nabou");
      else if (h === "n7") { goWorkspace("n7"); setPanel("chat"); }
      else if (SECTIONS.some(s => s.id === h)) setPanel(h as Panel);
    };
    // On a phone the Humanoid opens alone; the conversation sheet opens on demand.
    if (!location.hash && window.matchMedia("(max-width:760px)").matches) setPanel(null);
    fromHash(); window.addEventListener("hashchange", fromHash);
    void pct("/library/status", { timeout: 10000 }).then(r => setLibraryOnline(r.ok));
    return () => window.removeEventListener("hashchange", fromHash);
  }, [goWorkspace]);
  useEffect(() => { try { localStorage.setItem("n7-eve-settings", JSON.stringify(settings)); localStorage.setItem("n7-face", settings.face); } catch { /* private mode */ } }, [settings]);

  const select = (s: Section) => {
    setMobileNav(false);
    if (s === "n7" || s === "nabou") {
      goWorkspace(s);
      // On a phone the map opens full screen; N7 is one tap away (bottom-right button).
      setPanel(s === "nabou" && window.matchMedia("(max-width:760px)").matches ? null : "chat");
      history.replaceState(null, "", "#" + s); return;
    }
    setPanel(p => (p === s ? null : s)); history.replaceState(null, "", "#" + s);
  };
  const active: Section = panel && panel !== "chat" ? panel : workspace;
  const close = () => setPanel(null);
  const toLogin = () => setPanel("settings");
  const lastN7 = txt(session.messages.filter(m => m.role === "assistant").at(-1)?.content);

  let dock: React.ReactNode = null;
  if (panel === "chat") dock = (
    <EvePanel title={workspace === "nabou" ? "N7 στον χάρτη" : "Συνομιλία"} code={workspace === "nabou" ? "N7 · NABOU" : "N7 · COMMS"} onClose={close}
      footClass="eve-chat-foot" footer={<EveCommandBar session={session} compact placeholder={workspace === "nabou" ? "Ρώτα το N7 για τον χάρτη…" : undefined} />}>
      <EveConversation session={session} onLogin={toLogin} onLibrary={openLibrary} />
    </EvePanel>
  );
  else if (panel === "library") dock = <LibraryPanel onClose={close} initialQuery={libraryQuery} />;
  else if (panel === "agents") dock = <AgentsPanel session={session} onClose={close} />;
  else if (panel === "research") dock = <ResearchPanel session={session} onClose={close} onOpenNabou={() => goWorkspace("nabou")} onLogin={toLogin} />;
  else if (panel === "history") dock = <HistoryPanel session={session} onClose={close} onOpen={() => { goWorkspace("n7"); setPanel("chat"); }} onLogin={toLogin} />;
  else if (panel === "news") dock = <NotConnectedPanel title="Ειδήσεις" code="NEWS · ΓΕΩΠΟΛΙΤΙΚΗ" onClose={close} text="Δεν υπάρχει ακόμη πηγή ειδήσεων συνδεδεμένη με το N7." />;
  else if (panel === "weather") dock = <NotConnectedPanel title="Καιρός" code="WEATHER" onClose={close} text="Δεν υπάρχει ακόμη υπηρεσία καιρού συνδεδεμένη με το N7." />;
  else if (panel === "settings") dock = <SettingsPanel session={session} settings={settings} onChange={setSettings} onClose={close} />;

  return (
    <div className="eve-root" data-workspace={workspace} data-dock={dock ? "open" : "closed"} data-panel={panel || "none"} data-state={session.state}>
      <div className="eve-backdrop" aria-hidden="true"><N7Backdrop ref={backdrop} effects={settings.effects} reduced={false} /></div>
      <div className="eve-atmos" aria-hidden="true" />
      <EveRail active={active} onSelect={select} expanded={railExpanded} onToggle={() => setRailExpanded(x => !x)} mobileOpen={mobileNav} />
      {mobileNav && <button type="button" className="eve-scrim" aria-label="Κλείσιμο μενού" onClick={() => setMobileNav(false)} />}
      <header className="eve-top">
        <button type="button" className="eve-icon-btn eve-menu" aria-label="Μενού" aria-expanded={mobileNav} onClick={() => setMobileNav(x => !x)}><Menu size={18} strokeWidth={1.4} /></button>
        <div className="eve-brand"><b>NABOU</b><span>N7 · ΣΥΣΤΗΜΑ ΙΣΤΟΡΙΚΗΣ ΕΡΕΥΝΑΣ</span></div>
        <div className="eve-switch" role="group" aria-label="Χώρος εργασίας">
          <button type="button" aria-pressed={workspace === "n7"} onClick={() => select("n7")}><ScanFace size={14} strokeWidth={1.4} /> N7</button>
          <button type="button" aria-pressed={workspace === "nabou"} onClick={() => select("nabou")}><MapIcon size={14} strokeWidth={1.4} /> NABOU</button>
        </div>
        <div className="eve-links" aria-label="Συνδέσεις">
          <span className="eve-chip" data-tone={session.authenticated ? "ok" : session.online === false ? "warn" : "off"} title="N7 runtime">
            N7 {session.online === null ? "…" : session.authenticated ? "ΣΥΝΔΕΔΕΜΕΝΟ" : session.online ? "ΧΩΡΙΣ ΣΥΝΔΕΣΗ" : "ΕΚΤΟΣ"}</span>
          <span className="eve-chip" data-tone={libraryOnline ? "ok" : libraryOnline === false ? "warn" : "off"} title="Βιβλιοθήκη pct-live">
            LIB {libraryOnline === null ? "…" : libraryOnline ? "ONLINE" : "ΕΚΤΟΣ"}</span>
        </div>
      </header>

      <main className="eve-stage">
        <section className="eve-n7" data-visible={workspace === "n7"} aria-hidden={workspace !== "n7"} aria-label="N7">
          <div className="eve-reticle" aria-hidden="true"><i /><i /><i /><i /></div>
          <EveHumanoid mood={session.state} effects={settings.effects} sound={settings.sound} breathing={settings.breathing} face={settings.face}
            onWave={(x, y, r, f) => backdrop.current?.wave(x, y, r, f)} onClearWave={() => backdrop.current?.clear()} />
          <div className="eve-n7-foot">
            {panel !== "chat" && lastN7 && <p className="eve-subtitle" aria-live="polite">{lastN7.length > 220 ? lastN7.slice(0, 220) + "…" : lastN7}</p>}
            <EveCommandBar session={session} />
          </div>
          {panel === null && <button type="button" className="eve-dock-open" onClick={() => setPanel("chat")} aria-label="Άνοιγμα συνομιλίας"><PanelRightOpen size={16} strokeWidth={1.4} /></button>}
        </section>
        {nabouMounted && <NabouWorkspace visible={workspace === "nabou"} />}
        {workspace === "nabou" && panel === null && <button type="button" className="eve-dock-open eve-dock-open-map" onClick={() => setPanel("chat")}><ScanFace size={15} strokeWidth={1.4} /> N7</button>}
      </main>
      {dock && <aside className="eve-dock" aria-label="Πλαϊνό panel">{dock}</aside>}
    </div>
  );
}
