"use client";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import EvePanel, { EveDetails, EveEmpty, EveField } from "./EvePanel";
import { n7Api, pct, txt, type ApiData } from "./eveApi";
import type { N7Session, Task } from "./useN7Session";

const when = (iso?: unknown) => {
  if (typeof iso !== "string" || !iso) return "—";
  const d = new Date(iso); if (isNaN(+d)) return String(iso);
  return d.toLocaleString("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " (ώρα Ελλάδας)";
};
const STATE_EL: Record<string, string> = { PASS: "Λειτουργεί", PARTIAL: "Μερική λειτουργία", FAIL: "Σφάλμα", BLOCKED: "Σε αναμονή" };
const TASK_TONE: Record<string, "ok" | "warn" | "off"> = { done: "ok", completed: "ok", failed: "warn", error: "warn", queued: "off", running: "off" };

// Only what the services report. Nothing here is computed into a "progress" or "complete" state.
export default function AgentsPanel({ session, onClose }: { session: N7Session; onClose: () => void }) {
  const [n7, setN7] = useState<ApiData | null>(null), [health, setHealth] = useState<ApiData | null>(null);
  const [agents, setAgents] = useState<ApiData | null>(null), [agentsError, setAgentsError] = useState("");
  const [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(false), [checked, setChecked] = useState<Date | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const [a, b] = await Promise.all([pct<ApiData>("/n7/status"), pct<ApiData>("/health")]);
    const errs: string[] = [];
    if (a.ok) setN7(a.data); else { setN7(null); errs.push("pct-live /n7/status: " + a.error); }
    if (b.ok) setHealth(b.data); else { setHealth(null); errs.push("pct-live /health: " + b.error); }
    if (session.authenticated) {
      try { setAgents(await n7Api("/api/agents")); setAgentsError(""); } catch (e) { setAgents(null); setAgentsError(e instanceof Error ? e.message : String(e)); }
    }
    await session.refresh();
    setErrors(errs); setChecked(new Date()); setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.authenticated]);
  useEffect(() => { void load(); }, [load]);
  const s = session.status;
  const tasks: Task[] = session.tasks;
  return (
    <EvePanel title="Agents" code="AGENTS · ΚΑΤΑΣΤΑΣΗ" onClose={onClose}
      footer={<><button type="button" className="eve-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={13} strokeWidth={1.5} /> {loading ? "Έλεγχος…" : "Ανανέωση"}</button>
        <span className="eve-dim">{checked ? "Έλεγχος " + checked.toLocaleTimeString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}</span></>}>
      <h3 className="eve-h3">N7 runtime</h3>
      {session.online === false ? <EveEmpty title="Μη διαθέσιμο από αυτή τη διεύθυνση">Το N7 runtime απαντά μόνο στον server του N7.</EveEmpty> : (
        <div className="eve-fields">
          <EveField label="Σύνδεση" value={session.online === null ? "…" : session.authenticated ? "Συνδεδεμένο" : "Χωρίς σύνδεση"} tone={session.authenticated ? "ok" : "off"} />
          <EveField label="Μοντέλο" value={s?.modelConfigured ? "Ρυθμισμένο" : s ? "Όχι" : "—"} tone={s?.modelConfigured ? "ok" : "warn"} />
          <EveField label="Ουρά" value={s?.queueModelAvailable ? "Διαθέσιμη" : s ? "Μη διαθέσιμη" : "—"} tone={s?.queueModelAvailable ? "ok" : "warn"} />
        </div>
      )}
      {s?.queueModel && session.online !== false && (
        <EveDetails><p>Μοντέλο ουράς: {txt(s.queueModel)} · Αποστολή ουράς: {s.queueDispatchConfigured ? "ρυθμισμένη" : "όχι"}</p></EveDetails>
      )}
      <h3 className="eve-h3">Ερευνητικός agent (pct-live)</h3>
      {n7 ? (
        <div className="eve-fields">
          <EveField label="Σύνδεση" value={n7.connected ? "Ναι" : "Όχι"} tone={n7.connected ? "ok" : "warn"} />
          <EveField label="Κατάσταση" value={STATE_EL[String(n7.state)] ? `${STATE_EL[String(n7.state)]} (${String(n7.state)})` : String(n7.state ?? "—")} tone={n7.state === "PASS" ? "ok" : "warn"} />
          <EveField label="Νέα αποστολή" value={n7.can_dispatch ? "Επιτρέπεται" : "Κλειστή"} tone={n7.can_dispatch ? "ok" : "off"} />
          <EveField label="Ιστορική επαλήθευση" value={n7.historical_verification ? "Ναι" : "Όχι"} tone={n7.historical_verification ? "ok" : "off"} />
          <EveField label="Τελευταία ενημέρωση" value={when(n7.updated_at)} />
        </div>
      ) : !errors.length && <p className="eve-dim">Φόρτωση…</p>}
      {health && <EveDetails><p>Υπηρεσία: {String(health.service)} · {String(health.status)} · revision {String(health.revision)}</p><pre>{JSON.stringify(n7, null, 1)}</pre></EveDetails>}
      <h3 className="eve-h3">Εργασίες</h3>
      {!session.authenticated ? <EveEmpty title="Οι εργασίες φαίνονται μετά τη σύνδεση στο N7" /> :
        tasks.length === 0 ? <EveEmpty title="Καμία εργασία" /> : (
          <ul className="eve-tasks">
            {tasks.slice(0, 30).map(t => (
              <li key={t.id} data-tone={TASK_TONE[txt(t.status)] || "off"}>
                <span className="eve-task-status">{txt(t.status)}</span><b>{txt(t.prompt)}</b>
                {(t.error || t.result) && <EveDetails summary={t.error ? "Σφάλμα" : "Αποτέλεσμα"}><pre>{txt(t.error || t.result)}</pre></EveDetails>}
              </li>
            ))}
          </ul>
        )}
      {session.authenticated && (agents ? <EveDetails summary="Μητρώο agents (N7)"><pre>{JSON.stringify(agents, null, 1)}</pre></EveDetails>
        : agentsError && <p className="eve-error">Μητρώο agents: {agentsError}</p>)}
      {errors.map(e => <p key={e} className="eve-error" role="alert">{e}</p>)}
    </EvePanel>
  );
}
