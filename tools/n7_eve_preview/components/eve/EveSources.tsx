"use client";
import type { CatalogBook, LibraryHit } from "./eveApi";

// A citation line built only from fields the library returned.
export function citeHit(hit: LibraryHit, catalog?: Map<string, CatalogBook>) {
  const b = catalog?.get(hit.book.id);
  return [b?.author, hit.book.title || b?.title, b?.where || b?.year, hit.page ? "σ. " + hit.page.replace(/^PDF\s*/i, "PDF ") : ""].filter(Boolean).join(" · ");
}

export function EveHit({ hit, catalog, index }: { hit: LibraryHit; catalog?: Map<string, CatalogBook>; index: number }) {
  const text = (hit.text || "").replace(/\s+/g, " ").trim();
  return (
    <article className="eve-hit">
      <header><span className="eve-hit-n">{String(index + 1).padStart(2, "0")}</span>
        <b>{hit.book.short || hit.book.title || hit.book.id}</b>
        {hit.page && <span className="eve-hit-page">{hit.page}</span>}
      </header>
      <blockquote>{text.length > 420 ? text.slice(0, 420) + "…" : text}</blockquote>
      <cite>{citeHit(hit, catalog)}</cite>
    </article>
  );
}
