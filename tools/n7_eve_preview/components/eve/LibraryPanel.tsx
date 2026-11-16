"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import EvePanel, { EveDetails, EveEmpty } from "./EvePanel";
import { EveHit } from "./EveSources";
import { loadCatalog, pct, searchLibrary, type CatalogBook, type LibrarySearch } from "./eveApi";

export default function LibraryPanel({ onClose, initialQuery, view = "search" }: { onClose: () => void; initialQuery?: string; view?: "search" | "sources" }) {
  const [query, setQuery] = useState(initialQuery || "");
  const [result, setResult] = useState<LibrarySearch | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");
  const [books, setBooks] = useState<CatalogBook[] | null>(null);
  const [added, setAdded] = useState<CatalogBook[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [libStatus, setLibStatus] = useState<Record<string, unknown> | null>(null);
  const catalog = useMemo(() => new Map((books || []).concat(added).map(b => [b.id, b])), [books, added]);
  useEffect(() => {
    void loadCatalog().then(c => { setBooks(c.books); setAdded(c.added); if (c.error) setCatalogError(c.error); });
    void pct<Record<string, unknown>>("/library/status").then(r => setLibStatus(r.ok ? r.data : { error: r.error }));
  }, []);
  async function run(q = query) {
    const text = q.trim(); if (!text || state === "busy") return;
    setState("busy"); setError(""); setResult(null);
    const r = await searchLibrary(text);
    if (r.ok) { setResult(r.data); setState("idle"); }
    else { setError(r.error === "timeout" ? "Η βιβλιοθήκη δεν απάντησε εγκαίρως. Δοκίμασε ξανά." : "Η αναζήτηση απέτυχε (" + r.error + ")."); setState("error"); }
  }
  useEffect(() => { if (initialQuery) { setQuery(initialQuery); void run(initialQuery); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initialQuery]);
  const hits = result?.hits || [];
  return (
    <EvePanel title={view === "sources" ? "Πηγές" : "Βιβλιοθήκη"} code={view === "sources" ? "SOURCES · ΚΑΤΑΛΟΓΟΣ" : "LIBRARY · ΑΝΑΖΗΤΗΣΗ"} onClose={onClose} wide>
      {view === "search" && <form className="eve-search" role="search" onSubmit={e => { e.preventDefault(); void run(); }}>
        <Search size={15} strokeWidth={1.4} aria-hidden="true" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Όνομα, τόπος ή φράση — π.χ. Λάντζας" aria-label="Αναζήτηση στη βιβλιοθήκη" />
        <button type="submit" disabled={state === "busy" || !query.trim()}>{state === "busy" ? "Αναζήτηση…" : "Αναζήτηση"}</button>
      </form>}
      {state === "busy" && <div className="eve-progress" role="status"><span />Ψάχνω σε όλες τις πηγές της βιβλιοθήκης…</div>}
      {error && <p className="eve-error" role="alert">{error}</p>}
      {result && (
        <section className="eve-results" aria-label="Αποτελέσματα αναζήτησης">
          <h3 className="eve-h3">{hits.length ? `${hits.length} αποσπάσματα για «${result.query}»` : `Τίποτα για «${result.query}»`}</h3>
          {hits.map((h, i) => <EveHit key={i} hit={h} index={i} catalog={catalog} />)}
          <p className="eve-dim">Τα αποσπάσματα είναι ευρήματα κειμένου, όχι ιστορικά επιβεβαιωμένα συμπεράσματα.</p>
          <EveDetails>
            <p>Χρόνος: {result.took_ms ?? "—"} ms · Αποθήκες: {Object.entries(result.stores || {}).map(([k, v]) => `${k} ${v}`).join(", ") || "—"}</p>
            {result.verdict != null && <pre>{JSON.stringify({ verdict: result.verdict, reason: result.reason ?? null, historically_verified: result.historically_verified ?? false }, null, 1)}</pre>}
          </EveDetails>
        </section>
      )}
      <section aria-label="Κατάλογος πηγών">
        <h3 className="eve-h3">Πηγές {books ? `· ${books.length + added.length}` : ""}</h3>
        {!books && !catalogError && <p className="eve-dim">Φόρτωση καταλόγου…</p>}
        {catalogError && !books?.length && <EveEmpty title="Ο κατάλογος δεν φορτώθηκε">{catalogError}</EveEmpty>}
        <ul className="eve-books">
          {(books || []).concat(added).map(b => (
            <li key={b.id}>
              <b>{b.title || b.short}</b>
              <span>{[b.author, b.where || b.year, b.pages ? b.pages + " σελ." : ""].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
        {libStatus && <EveDetails><pre>{JSON.stringify(libStatus, null, 1)}</pre></EveDetails>}
      </section>
    </EvePanel>
  );
}
