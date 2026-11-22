"use client";
import { Mic, MicOff, SendHorizontal, CircleStop } from "lucide-react";
import type { N7Session } from "./useN7Session";
import EveStateIndicator from "./EveStateIndicator";

export default function EveCommandBar({ session, placeholder, compact }: { session: N7Session; placeholder?: string; compact?: boolean }) {
  const { draft, setDraft, send, busy, waiting, voice, state, authenticated } = session;
  const blocked = busy || waiting;
  const micOn = voice.conversation || voice.phase === "listening";
  const mic = () => {
    if (micOn) { voice.suspend(); return; }
    // Signed in: hands-free conversation with N7. Signed out: dictation into the field only.
    if (authenticated && voice.supported.output) voice.startConversation(); else voice.listen();
  };
  return (
    <form className="eve-command" data-compact={compact || undefined}
      onSubmit={e => { e.preventDefault(); void send(); }} aria-label="Συνομιλία με το N7">
      <EveStateIndicator state={state} compact={compact} />
      <div className="eve-command-row">
        <button type="button" className="eve-mic" aria-pressed={micOn} onClick={mic}
          disabled={!voice.supported.input || (blocked && !micOn)}
          aria-label={micOn ? "Σταμάτημα μικροφώνου" : "Μικρόφωνο"} title={!voice.supported.input ? "Το μικρόφωνο δεν υποστηρίζεται σε αυτόν τον browser" : undefined}>
          {micOn ? <MicOff size={17} strokeWidth={1.5} /> : <Mic size={17} strokeWidth={1.5} />}
        </button>
        <textarea rows={1} value={draft} readOnly={voice.conversation} aria-label="Μήνυμα προς το N7"
          placeholder={placeholder || (authenticated ? "Ρώτα το N7…" : "Ρώτα τη βιβλιοθήκη…")}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        {voice.phase === "speaking"
          ? <button type="button" className="eve-send" onClick={() => voice.stop()} aria-label="Διακοπή ομιλίας"><CircleStop size={17} strokeWidth={1.5} /></button>
          : <button type="submit" className="eve-send" disabled={blocked || !draft.trim()} aria-label="Αποστολή"><SendHorizontal size={17} strokeWidth={1.5} /></button>}
      </div>
      {voice.status && (voice.phase || voice.conversation || draft.trim()) && <p className="eve-command-note" aria-live="polite">{voice.status}</p>}
    </form>
  );
}
