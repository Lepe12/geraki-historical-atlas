"use client";
import { useEffect, useRef } from "react";
import type { N7Session } from "./useN7Session";
import { EveHit } from "./EveSources";
import { EveEmpty } from "./EvePanel";
import { txt } from "./eveApi";

export default function EveConversation({ session, onLogin, onLibrary }: { session: N7Session; onLogin?: () => void; onLibrary?: (q: string) => void }) {
  const { messages, authenticated, online, waiting, busy, error } = session;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, waiting, busy]);
  return (
    <div className="eve-log" aria-live="polite" aria-label="Συνομιλία">
      {!authenticated && (
        <div className="eve-note">
          {online === false
            ? <>Το N7 δεν είναι διαθέσιμο από εδώ. Οι ερωτήσεις πηγαίνουν στη βιβλιοθήκη.</>
            : <>Χωρίς σύνδεση, οι ερωτήσεις ψάχνουν στη βιβλιοθήκη. Για απάντηση από το N7 χρειάζεται <button type="button" className="eve-link" onClick={onLogin}>σύνδεση</button>.</>}
        </div>
      )}
      {messages.length === 0 && <EveEmpty title="Καμία συνομιλία ακόμη">Γράψε ή πάτησε το μικρόφωνο.</EveEmpty>}
      {messages.map((m, i) => m.kind === "library" ? (
        <div key={i} className="eve-msg" data-role="library">
          <small>ΒΙΒΛΙΟΘΗΚΗ · «{m.query}»</small>
          <p>{m.content}</p>
          {(m.hits || []).slice(0, 3).map((h, j) => <EveHit key={j} hit={h} index={j} />)}
          {(m.hits || []).length > 0 && onLibrary && <button type="button" className="eve-link" onClick={() => onLibrary(m.query || "")}>Όλα τα αποτελέσματα στη βιβλιοθήκη →</button>}
        </div>
      ) : (
        <div key={i} className="eve-msg" data-role={m.role === "user" ? "user" : "n7"}>
          <small>{m.role === "user" ? "ΕΣΥ" : "N7"}</small>
          <p>{txt(m.content)}</p>
        </div>
      ))}
      {(busy || waiting) && <div className="eve-msg" data-role="pending"><small>{authenticated ? "N7" : "ΒΙΒΛΙΟΘΗΚΗ"}</small><p className="eve-dim">{authenticated ? "Ετοιμάζει απάντηση…" : "Αναζήτηση…"}</p></div>}
      {error && <p className="eve-error" role="alert">{error}</p>}
      <div ref={end} />
    </div>
  );
}
