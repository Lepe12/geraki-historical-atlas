// Bibliographic exports preserve missing fields and provisional evidence states.
const csvCell = (value) => {
  let s = Array.isArray(value)
    ? value.join(" | ")
    : typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
const bibValue = (value) =>
  String(value ?? "")
    .replace(/[\\{}%&#_$^~]/g, (c) => "\\" + c)
    .replace(/[\r\n]+/g, " ");
const year = (b) => {
  const m = String(b.publication_date ?? "").match(/(?:^|\D)(1\d{3}|20\d{2})(?:\D|$)/);
  return m ? Number(m[1]) : null;
};
export function exportResearch(snapshot, format = "json") {
  const p = snapshot.evidence_package || {},
    allSources = p.sources || [],
    passages = p.passages || [],
    lookup = new Map(allSources.map((s) => [s.source_id, s]));
  const consulted = new Set(
    passages.filter((p) => p.usable_as_provisional_reference === true).map((p) => p.source_id),
  );
  const sources = allSources.filter((s) => consulted.has(s.source_id));
  if (format === "csv") {
    const fields = [
      "passage_id",
      "source_id",
      "title",
      "creators",
      "publication_date",
      "source_category",
      "url",
      "printed_page",
      "pdf_pages",
      "start_line",
      "end_line",
      "representation",
      "acquired_text_excerpt",
      "citation_check",
      "identity_status",
      "uncertainties",
      "verified",
    ];
    const rows = passages.map((r) => {
      const s = lookup.get(r.source_id) || {},
        b = s.bibliography || {},
        l = r.locator || {};
      return [
        r.passage_id,
        r.source_id,
        b.title,
        b.creators,
        b.publication_date,
        s.classification?.category,
        b.url,
        l.printed_page,
        r.pdf_pages_1_based,
        l.start_line,
        l.end_line,
        r.representation,
        r.acquired_text_excerpt,
        r.citation_check,
        r.identity_status,
        r.uncertainties,
        false,
      ];
    });
    return {
      extension: "csv",
      mime: "text/csv;charset=utf-8",
      text: "\uFEFF" + [fields, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"),
    };
  }
  if (format === "csl") {
    const rows = sources.map((s) => {
      const b = s.bibliography || {},
        y = year(b),
        r = {
          id: s.source_id,
          type: b.container_title ? "article-journal" : "document",
          title: b.title || undefined,
          URL: /^https?:\/\//.test(b.url || "") ? b.url : undefined,
          author: b.creators?.map((literal) => ({ literal })),
          note:
            "NABOU: provisional metadata; classification " +
            (s.classification?.category || "UNCLASSIFIED") +
            "; not historically verified.",
        };
      if (y) r.issued = { "date-parts": [[y]] };
      if (b.doi) r.DOI = b.doi;
      if (b.container_title) r["container-title"] = b.container_title;
      return r;
    });
    return { extension: "csl.json", mime: "application/json", text: JSON.stringify(rows, null, 2) };
  }
  if (format === "bibtex") {
    const rows = sources.map((s) => {
      const b = s.bibliography || {},
        fields = {
          title: b.title,
          author: b.creators?.join(" and "),
          year: year(b),
          journal: b.container_title,
          doi: b.doi,
          url: /^https?:\/\//.test(b.url || "") ? b.url : null,
          note: "Provisional NABOU metadata; not historically verified. Missing fields require completion.",
        };
      return (
        "@" +
        (b.container_title ? "article" : "misc") +
        "{" +
        s.source_id +
        ",\n" +
        Object.entries(fields)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => "  " + k + " = {" + bibValue(v) + "}")
          .join(",\n") +
        "\n}"
      );
    });
    return { extension: "bib", mime: "application/x-bibtex", text: rows.join("\n\n") };
  }
  return { extension: "json", mime: "application/json", text: JSON.stringify(snapshot, null, 2) };
}
