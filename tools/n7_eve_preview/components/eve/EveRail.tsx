"use client";
import { ScanFace, Map, Library, Network, Telescope, Newspaper, CloudSun, History, Settings2, ChevronsRight, ChevronsLeft, type LucideIcon } from "lucide-react";

export type Section = "n7" | "nabou" | "library" | "agents" | "research" | "news" | "weather" | "history" | "settings";
export const SECTIONS: { id: Section; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "n7", label: "N7", hint: "Κεντρική συνομιλία με το N7", icon: ScanFace },
  { id: "nabou", label: "NABOU", hint: "Διαδραστικός ιστορικός χάρτης", icon: Map },
  { id: "library", label: "LIBRARY", hint: "Πηγές, βιβλία και αναζήτηση τεκμηρίων", icon: Library },
  { id: "agents", label: "AGENTS", hint: "Κατάσταση και εργασίες των agents", icon: Network },
  { id: "research", label: "RESEARCH", hint: "Ιστορική και διαδικτυακή έρευνα", icon: Telescope },
  { id: "news", label: "NEWS", hint: "Ειδήσεις και γεωπολιτική", icon: Newspaper },
  { id: "weather", label: "WEATHER", hint: "Καιρός", icon: CloudSun },
  { id: "history", label: "HISTORY", hint: "Ιστορικό συνομιλιών και εργασιών", icon: History },
  { id: "settings", label: "SETTINGS", hint: "Ρυθμίσεις", icon: Settings2 },
];

export default function EveRail({ active, onSelect, expanded, onToggle, mobileOpen }: {
  active: Section; onSelect: (s: Section) => void; expanded: boolean; onToggle: () => void; mobileOpen: boolean;
}) {
  return (
    <nav className="eve-rail" data-expanded={expanded} data-mobile-open={mobileOpen} aria-label="Πλοήγηση N7">
      <div className="eve-rail-mark" aria-hidden="true"><span>N7</span></div>
      <ul>
        {SECTIONS.map(({ id, label, hint, icon: Icon }) => (
          <li key={id} className={id === "settings" ? "eve-rail-bottom" : undefined}>
            <button type="button" className="eve-rail-item" aria-current={active === id ? "page" : undefined}
              aria-label={`${label} — ${hint}`} data-section={id} onClick={() => onSelect(id)}>
              <Icon size={18} strokeWidth={1.4} aria-hidden="true" />
              <span className="eve-rail-label">{label}</span>
              <span className="eve-tip" role="tooltip"><b>{label}</b>{hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="eve-rail-toggle" onClick={onToggle} aria-expanded={expanded}
        aria-label={expanded ? "Σύμπτυξη μενού" : "Επέκταση μενού"}>
        {expanded ? <ChevronsLeft size={15} strokeWidth={1.4} /> : <ChevronsRight size={15} strokeWidth={1.4} />}
      </button>
    </nav>
  );
}
