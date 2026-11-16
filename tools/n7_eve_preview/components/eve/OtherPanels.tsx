"use client";
import { useEffect, useState } from "react";
import { FEMALE_VOICE_ID } from "../N7FemaleVoice";
import EvePanel, { EveDetails, EveEmpty, EveField } from "./EvePanel";
import { n7Api, txt } from "./eveApi";
import type { N7Session } from "./useN7Session";
import type { Face } from "./EveHumanoid";

export function ResearchPanel({ session, onClose, onOpenNabou, onLogin }: { session: N7Session; onClose: () => void; onOpenNabou: () => void; onLogin: () => void }) {
  const [target, setTarget] = useState(""), [question, setQuestion] = useState(""), [dates, setDates] = useState("");
  const [missionId, setMissionId] = useState(""), [mission, setMission] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (!missionId) return;
    const refresh = () => void n7Api("/api/research/missions/" + encodeURIComponent(missionId)).then(d => setMission(JSON.stringify(d, null, 2))).catch(e => setMission(String(e)));
    refresh(); const t = window.setInterval(refresh, 15000); return () => window.clearInterval(t);
  }, [missionId]);
  async function submit() {
    if (target.trim().length < 3 || question.trim().length < 12 || busy) return;
    setBusy(true); setError("");
    try {
      const m = await n7Api("/api/research/missions", { target: target.trim(), purpose: question.trim(), date_range: dates.trim(), aliases: "" });
      const id = String(m.request_id || "");
      if (!/^n7mission-[a-f0-9]{24}$/.test(id)) throw Error("Δεν επιβεβαιώθηκε αριθμός αποστολής.");
      setMissionId(id); setMission("Ανατέθηκε: " + id + " — αναμονή επιβεβαίωσης εκτέλεσης");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <EvePanel title="Έρευνα" code="RESEARCH" onClose={onClose}>
      <p className="eve-lead">Η ιστορική έρευνα ξεκινά από τη βιβλιοθήκη και συνεχίζει, αν χρειαστεί, με μεγάλη αναζήτηση σε αρχεία.</p>
      <button type="button" className="eve-btn eve-btn-wide" onClick={onOpenNabou}>Έρευνα μέσα στο NABOU</button>
      <h3 className="eve-h3">Ερευνητική αποστολή N7</h3>
      {!session.authenticated ? <EveEmpty title="Χρειάζεται σύνδεση στο N7"><button type="button" className="eve-link" onClick={onLogin}>Σύνδεση</button></EveEmpty> : (
        <form className="eve-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <label>Τόπος ή πρόσωπο<input value={target} onChange={e => setTarget(e.target.value)} placeholder="π.χ. Πέτρος Λάντζας" /></label>
          <label>Ερώτημα<textarea rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Τι θέλεις να μάθεις;" /></label>
          <label>Χρονολογίες<input value={dates} onChange={e => setDates(e.target.value)} placeholder="π.χ. 1570–1600" /></label>
          <button type="submit" className="eve-btn" disabled={busy || target.trim().length < 3 || question.trim().length < 12}>{busy ? "Αποστολή…" : "Εκκίνηση έρευνας"}</button>
        </form>
      )}
      {mission && <pre className="eve-pre" aria-live="polite">{mission}</pre>}
      {error && <p className="eve-error" role="alert">{error}</p>}
      <h3 className="eve-h3">Διαδικτυακή έρευνα</h3>
      <EveEmpty title="Δεν έχει συνδεθεί εδώ ακόμη">Η διαδικτυακή αναζήτηση γίνεται από το N7 μέσα στη συνομιλία, όταν είσαι συνδεδεμένος.</EveEmpty>
    </EvePanel>
  );
}

export function HistoryPanel({ session, onClose, onOpen, onLogin }: { session: N7Session; onClose: () => void; onOpen: () => void; onLogin: () => void }) {
  return (
    <EvePanel title="Ιστορικό" code="HISTORY" onClose={onClose}>
      <h3 className="eve-h3">Συνομιλίες</h3>
      {!session.authenticated ? <EveEmpty title="Το ιστορικό φαίνεται μετά τη σύνδεση στο N7"><button type="button" className="eve-link" onClick={onLogin}>Σύνδεση</button></EveEmpty> : (
        <>
          <button type="button" className="eve-btn" onClick={() => { session.newConversation(); onOpen(); }}>Νέα συνομιλία</button>
          {session.conversations.length === 0 ? <EveEmpty title="Καμία αποθηκευμένη συνομιλία" /> : (
            <ul className="eve-list">
              {session.conversations.map(c => (
                <li key={c.id}><button type="button" aria-current={c.id === session.conversationId || undefined}
                  onClick={() => { void session.openConversation(c.id); onOpen(); }}>{txt(c.title) || "Χωρίς τίτλο"}</button></li>
              ))}
            </ul>
          )}
          <h3 className="eve-h3">Εργασίες</h3>
          {session.tasks.length === 0 ? <EveEmpty title="Καμία εργασία" /> :
            <ul className="eve-list">{session.tasks.slice(0, 20).map(t => <li key={t.id}><span className="eve-task-status">{txt(t.status)}</span> {txt(t.prompt)}</li>)}</ul>}
        </>
      )}
      <EveDetails summary="Αυτή η συνεδρία"><p>Μηνύματα σε αυτή την οθόνη: {session.messages.length}</p></EveDetails>
    </EvePanel>
  );
}

export function NotConnectedPanel({ title, code, onClose, text }: { title: string; code: string; onClose: () => void; text: string }) {
  return (
    <EvePanel title={title} code={code} onClose={onClose}>
      <EveEmpty title="Δεν έχει συνδεθεί πηγή">{text}</EveEmpty>
      <p className="eve-dim">Δεν δείχνουμε δοκιμαστικά ή φανταστικά στοιχεία. Θα εμφανιστούν εδώ όταν συνδεθεί πραγματική πηγή.</p>
    </EvePanel>
  );
}

export type EveSettings = { face: Face; effects: boolean; sound: boolean; breathing: boolean };

export function SettingsPanel({ session, settings, onChange, onClose }: { session: N7Session; settings: EveSettings; onChange: (s: EveSettings) => void; onClose: () => void }) {
  const [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  const v = session.voice;
  const set = (patch: Partial<EveSettings>) => onChange({ ...settings, ...patch });
  return (
    <EvePanel title="Ρυθμίσεις" code="SETTINGS" onClose={onClose}>
      <h3 className="eve-h3">Σύνδεση N7</h3>
      {session.authenticated ? <EveField label="Κατάσταση" value="Συνδεδεμένο" tone="ok" /> : session.online === false ? <EveEmpty title="Το N7 δεν είναι διαθέσιμο από αυτή τη διεύθυνση" /> : (
        <form className="eve-form eve-login" onSubmit={async e => { e.preventDefault(); setBusy(true); const ok = await session.login(password); setPassword(""); setBusy(false); if (ok) onClose(); }}>
          <label>Κωδικός N7<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
          <button type="submit" className="eve-btn" disabled={busy}>{busy ? "Σύνδεση…" : "Σύνδεση"}</button>
          <p className="eve-dim">Ο ίδιος κωδικός με το N7. Η βιβλιοθήκη δουλεύει και χωρίς σύνδεση.</p>
        </form>
      )}
      <h3 className="eve-h3">Humanoid</h3>
      <div className="eve-seg" role="group" aria-label="Πρόσωπο">
        <button type="button" aria-pressed={settings.face === "n7"} onClick={() => set({ face: "n7" })}>Πρόσωπο N7</button>
        <button type="button" aria-pressed={settings.face === "h01"} onClick={() => set({ face: "h01" })}>Πρόσωπο H01</button>
      </div>
      <label className="eve-check"><input type="checkbox" checked={settings.effects} onChange={e => set({ effects: e.target.checked })} /> Κίνηση και εφέ</label>
      <label className="eve-check"><input type="checkbox" checked={settings.breathing} onChange={e => set({ breathing: e.target.checked })} /> Αναπνοή</label>
      <label className="eve-check"><input type="checkbox" checked={settings.sound} onChange={e => set({ sound: e.target.checked })} /> Ήχοι συναρμολόγησης</label>
      <button type="button" className="eve-btn" disabled={!settings.effects} onClick={() => window.dispatchEvent(new Event("n7eve:replay-assembly"))}>Επανάληψη συναρμολόγησης</button>
      <h3 className="eve-h3">Φωνή</h3>
      <label className="eve-form">Φωνή N7
        <select value={v.voiceURI} onChange={e => v.setVoiceURI(e.target.value)}>
          <option value={FEMALE_VOICE_ID}>N7 · Ελληνική γυναικεία</option>
          <option value="">Αυτόματη φωνή συσκευής</option>
          {v.voices.map(x => <option key={x.voiceURI} value={x.voiceURI}>{x.name} ({x.lang})</option>)}
        </select>
      </label>
      <div className="eve-row">
        <button type="button" className="eve-btn" aria-pressed={v.enabled} onClick={v.toggle} disabled={!v.supported.output}>Εκφώνηση απαντήσεων: {v.enabled ? "ναι" : "όχι"}</button>
        <button type="button" className="eve-btn" disabled={!v.supported.output} onClick={() => v.speak("Γεια σου. Είμαι το N7.", true)}>Δοκιμή φωνής</button>
      </div>
      {!v.supported.input && <p className="eve-dim">Το μικρόφωνο δεν υποστηρίζεται σε αυτόν τον browser. Δοκίμασε Chrome ή Edge.</p>}
      <EveDetails><p>Το μικρόφωνο χρησιμοποιεί την αναγνώριση ομιλίας του browser. Η κατάσταση LISTENING / THINKING / SPEAKING ακολουθεί το πραγματικό μικρόφωνο, την αναμονή απάντησης και τον ήχο.</p></EveDetails>
    </EvePanel>
  );
}

export function ProjectsPanel({ sys, onClose, onHistory }: { sys: import("./useSystemStatus").SystemStatusHook; onClose: () => void; onHistory: () => void }) {
  const a = sys.agent;
  const when = (v: unknown) => (typeof v === "string" && v ? new Date(v).toLocaleString("el-GR", { timeZone: "Europe/Athens" }) + " (ώρα Αθήνας)" : "—");
  return (
    <EvePanel title="Έργα" code="PROJECTS" onClose={onClose}>
      <h3 className="eve-h3">Τρέχον έργο</h3>
      {a ? (
        <div className="eve-fields">
          <EveField label="Έργο" value={txt(a.project) || "—"} />
          <EveField label="Κατάσταση" value={txt(a.state) || "—"} tone={a.state === "PASS" ? "ok" : "warn"} />
          <EveField label="Τελευταία ενημέρωση" value={when(a.updated_at)} />
          <EveField label="Νέα αποστολή" value={a.can_dispatch ? "Επιτρέπεται" : "Κλειστή"} tone={a.can_dispatch ? "ok" : "off"} />
        </div>
      ) : <EveEmpty title={sys.agentError ? "Η κατάσταση έργου δεν διαβάστηκε" : "Φόρτωση…"}>{sys.agentError}</EveEmpty>}
      {a && <EveDetails><pre>{JSON.stringify(a, null, 1)}</pre></EveDetails>}
      <h3 className="eve-h3">Συνομιλίες και εργασίες</h3>
      <button type="button" className="eve-btn" onClick={onHistory}>Ιστορικό</button>
    </EvePanel>
  );
}
