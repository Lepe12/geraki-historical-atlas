"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { N7_EVE_NABOU_URL } from "../N7EveConfig";

// The real NABOU (unchanged), loaded once and kept alive so switching N7 ↔ NABOU is instant.
export default function NabouWorkspace({ visible }: { visible: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <section className="eve-nabou" data-visible={visible} aria-hidden={!visible} aria-label="NABOU · ιστορικός χάρτης">
      {!loaded && <div className="eve-nabou-loading" role="status"><span />Φόρτωση NABOU…</div>}
      <iframe title="NABOU — διαδραστικός ιστορικός χάρτης" src={N7_EVE_NABOU_URL} onLoad={() => setLoaded(true)}
        allow="fullscreen; clipboard-write" referrerPolicy="strict-origin-when-cross-origin" tabIndex={visible ? 0 : -1} />
      <a className="eve-nabou-out" href={N7_EVE_NABOU_URL} target="_blank" rel="noopener noreferrer" tabIndex={visible ? 0 : -1}>
        <ExternalLink size={13} strokeWidth={1.5} /> Άνοιγμα σε νέα καρτέλα</a>
    </section>
  );
}
