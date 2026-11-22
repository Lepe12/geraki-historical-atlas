"use client";
import type { N7State } from "./useN7Session";

const STATES: { id: N7State; label: string; el: string }[] = [
  { id: "idle", label: "IDLE", el: "Αναμονή" },
  { id: "listening", label: "LISTENING", el: "Ακούει" },
  { id: "thinking", label: "THINKING", el: "Σκέφτεται" },
  { id: "speaking", label: "SPEAKING", el: "Μιλά" },
];

// Reflects the real N7 state only (microphone, pending reply, audio playback).
export default function EveStateIndicator({ state, compact }: { state: N7State; compact?: boolean }) {
  const current = STATES.find(s => s.id === state)!;
  return (
    <div className="eve-state" data-state={state} data-compact={compact || undefined} role="status" aria-label={`Κατάσταση N7: ${current.el}`}>
      {STATES.map(s => <span key={s.id} className="eve-state-seg" data-on={s.id === state || undefined}>{s.label}</span>)}
      <span className="eve-state-el">{current.el}</span>
    </div>
  );
}
