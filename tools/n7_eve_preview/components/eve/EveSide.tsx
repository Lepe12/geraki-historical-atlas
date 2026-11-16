"use client";
// Side panels of the home screen. Every value comes from N7 or pct-live; missing values show «—».
import { useEffect, useRef } from "react";
import { Map as MapIcon, Globe, ScanText, PenLine, Landmark } from "lucide-react";
import EvePanel from "./EvePanel";
import { readVoiceSignal } from "../N7VoiceSignal";
import { txt } from "./eveApi";
import type { N7Session, N7State } from "./useN7Session";
import type { SystemStatusHook } from "./useSystemStatus";

const STATE_EL: Record<string, string> = { PASS: "Λειτουργεί", PARTIAL: "Μερική λειτουργία", FAIL: "Σφάλμα", BLOCKED: "Σε αναμονή" };
const SAY: Record<N7State, string> = { idle: "Σε αναμονή", listening: "Σε ακούω…", thinking: "Σκέφτομαι…", speaking: "Μιλώ" };
export const athens = (iso: unknown) => {
  if (typeof iso !== "string" || !iso) return "—";
  const d = new Date(iso); if (isNaN(+d)) return "—";
  return d.toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

// Output-audio waveform: bars follow the real N7 voice level; flat line when N7 is silent.
export function EveWaveform({ state }: { state: N7State }) {
  const ref = useRef<HTMLCanvasElement>(null), stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext("2d"); if (!ctx) return;
    const hist = new Array(48).fill(0); let raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw); if (now - last < 40) return; last = now;
      const w = c.width = c.clientWidth * devicePixelRatio, h = c.height = c.clientHeight * devicePixelRatio;
      const lv = stateRef.current === "speaking" ? Math.max(0, readVoiceSignal(now)) : 0;
      hist.shift(); hist.push(lv);
      ctx.clearRect(0, 0, w, h); const bw = w / hist.length;
      ctx.fillStyle = "rgba(110,220,245,.85)"; ctx.shadowColor = "rgba(110,220,245,.6)"; ctx.shadowBlur = 6 * devicePixelRatio;
      hist.forEach((v, i) => { const bh = Math.max(1 * devicePixelRatio, v * h * .92); ctx.fillRect(i * bw + bw * .25, (h - bh) / 2, bw * .5, bh); });
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="eve-wave" aria-hidden="true" />;
}

export function WelcomePanel({ session }: { session: N7Session }) {
  return (
    <EvePanel title="N7 — Υποδοχή" className="eve-side-panel">
      <p className="eve-greet">Καλώς ήρθες. Είμαι το <b>N7</b>, ο βοηθός σου για την ιστορική έρευνα στο NABOU.</p>
      <div className="eve-voice-line"><EveWaveform state={session.state} /><span data-state={session.state}>{SAY[session.state]}</span></div>
      {!session.authenticated && <p className="eve-dim">Χωρίς σύνδεση απαντώ από τη βιβλιοθήκη.</p>}
    </EvePanel>
  );
}

type Row = { name: string; status: string; tone: "ok" | "warn" | "off"; running?: boolean };
export function AgentsListPanel({ session, sys, onOpen }: { session: N7Session; sys: SystemStatusHook; onOpen: () => void }) {
  const a = sys.agent, st = session.status;
  const rows: Row[] = [
    { name: "N7 runtime", status: session.online === null ? "—" : session.online ? (st?.modelConfigured ? "Σε λειτουργία" : "Χωρίς μοντέλο") : "Εκτός", tone: session.online ? (st?.modelConfigured ? "ok" : "warn") : session.online === false ? "warn" : "off" },
    { name: "Ερευνητικός agent", status: a ? (STATE_EL[txt(a.state)] || txt(a.state) || "—") : sys.agentError ? "Μη διαθέσιμος" : "—", tone: a ? (a.state === "PASS" ? "ok" : "warn") : sys.agentError ? "warn" : "off" },
    { name: "Ουρά εργασιών", status: st ? (st.queueModelAvailable ? "Διαθέσιμη" : "Μη διαθέσιμη") : "—", tone: st?.queueModelAvailable ? "ok" : st ? "warn" : "off" },
  ];
  for (const t of session.tasks.filter(t => /run|queue|pend/i.test(txt(t.status))).slice(0, 3))
    rows.push({ name: txt(t.prompt).slice(0, 40) || "Εργασία", status: txt(t.status), tone: "off", running: /run/i.test(txt(t.status)) });
  return (
    <EvePanel title="Ενεργοί Agents" className="eve-side-panel">
      <ul className="eve-agent-rows">
        {rows.map(r => (
          <li key={r.name} data-tone={r.tone}>
            <span className="eve-dot" /><b>{r.name}</b><em>{r.status}</em>
            {/* No service reports a percentage, so the bar carries no number: striped only while a task really runs. */}
            <span className="eve-bar" data-running={r.running || undefined}><i /></span><small>—</small>
          </li>
        ))}
      </ul>
      <button type="button" className="eve-link" onClick={onOpen}>Όλοι οι agents →</button>
    </EvePanel>
  );
}

export function ProjectPanel({ sys, onOpen }: { sys: SystemStatusHook; onOpen: () => void }) {
  const a = sys.agent;
  return (
    <EvePanel title="Τρέχον Έργο" className="eve-side-panel">
      {a ? (
        <dl className="eve-kv">
          <dt>Έργο</dt><dd>{txt(a.project) || "—"}</dd>
          <dt>Κατάσταση</dt><dd data-tone={a.state === "PASS" ? "ok" : "warn"}>{STATE_EL[txt(a.state)] || txt(a.state) || "—"}</dd>
          <dt>Ενημέρωση</dt><dd className="eve-num">{athens(a.updated_at)}</dd>
          <dt>Νέα αποστολή</dt><dd>{a.can_dispatch ? "Επιτρέπεται" : "Κλειστή"}</dd>
        </dl>
      ) : <p className="eve-dim">{sys.agentError ? "Η κατάσταση έργου δεν διαβάστηκε." : "—"}</p>}
      <button type="button" className="eve-link" onClick={onOpen}>Λεπτομέρειες έργου →</button>
    </EvePanel>
  );
}

export function QuickActionsPanel({ session, onMap, onResearch, onPrefill }: { session: N7Session; onMap: () => void; onResearch: () => void; onPrefill: (text: string) => void }) {
  const auth = session.authenticated;
  const actions = [
    { icon: MapIcon, label: "Άνοιγμα χάρτη NABOU", run: onMap, ok: true, note: "" },
    { icon: Globe, label: "Αναζήτηση στο διαδίκτυο", run: () => onPrefill("Αναζήτησε στο διαδίκτυο: "), ok: auth, note: "Χρειάζεται σύνδεση N7" },
    { icon: ScanText, label: "Ανάλυση πηγής (OCR)", run: () => {}, ok: false, note: "Δεν έχει συνδεθεί σε αυτή την προβολή" },
    { icon: PenLine, label: "Σύνθεση κειμένου", run: () => onPrefill("Σύνθεσε κείμενο για: "), ok: auth, note: "Χρειάζεται σύνδεση N7" },
    { icon: Landmark, label: "Ιστορική έρευνα", run: onResearch, ok: true, note: "" },
  ];
  return (
    <EvePanel title="Γρήγορες Ενέργειες" className="eve-side-panel">
      <ul className="eve-actions">
        {actions.map(({ icon: Icon, label, run, ok, note }) => (
          <li key={label}><button type="button" onClick={run} disabled={!ok} title={ok ? undefined : note}>
            <Icon size={15} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span>{!ok && <small>{note}</small>}
          </button></li>
        ))}
      </ul>
    </EvePanel>
  );
}

export function SystemPanel({ session, sys }: { session: N7Session; sys: SystemStatusHook }) {
  const st = session.status, lib = sys.library, h = sys.health, a = sys.agent;
  const dot = (v: boolean | null) => (v === null ? "off" : v ? "ok" : "warn");
  const items: [string, boolean | null, string][] = [
    ["N7 runtime", session.online, session.online === null ? "—" : session.online ? "Online" : "Offline"],
    ["Μοντέλο", st ? !!st.modelConfigured : null, st ? (st.modelConfigured ? "OK" : "Όχι") : "—"],
    ["Βιβλιοθήκη", lib ? !!(lib.published_configured && lib.historical_configured) : sys.libraryError ? false : null, sys.sources != null ? `${sys.sources} πηγές` : lib ? "OK" : "—"],
    ["pct-live", h ? h.status === "PASS" : sys.healthError ? false : null, h ? txt(h.status) : "—"],
    ["Ερευνητικός agent", a ? !!a.connected : sys.agentError ? false : null, a ? (a.connected ? "Συνδεδεμένος" : "Αποσυνδεδεμένος") : "—"],
    ["Σύνδεση κατόχου", session.online ? session.authenticated : null, session.authenticated ? "Ναι" : session.online ? "Όχι" : "—"],
  ];
  return (
    <EvePanel title="Σύστημα" className="eve-side-panel">
      <ul className="eve-sys">
        {items.map(([k, v, label]) => <li key={k} data-tone={dot(v)}><span className="eve-dot" />{k}<b className="eve-num">{label}</b></li>)}
      </ul>
      <p className="eve-dim eve-num">{sys.checkedAt ? "Έλεγχος " + sys.checkedAt.toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" }) : "Έλεγχος…"}</p>
    </EvePanel>
  );
}
