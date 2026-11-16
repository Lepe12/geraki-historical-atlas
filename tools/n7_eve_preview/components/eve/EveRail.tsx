"use client";
import { ScanFace, MessagesSquare, Telescope, BookMarked, Map, Network, Library, FolderKanban, Settings2, type LucideIcon } from "lucide-react";

export type Section = "n7" | "chat" | "research" | "sources" | "nabou" | "agents" | "library" | "projects" | "settings" | "history";
export const SECTIONS: { id: Section; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "n7", label: "N7", hint: "Αρχική οθόνη του N7", icon: ScanFace },
  { id: "chat", label: "Συνομιλία", hint: "Συζήτηση με το N7", icon: MessagesSquare },
  { id: "research", label: "Έρευνα", hint: "Ιστορική έρευνα", icon: Telescope },
  { id: "sources", label: "Πηγές", hint: "Κατάλογος δημοσιευμένων πηγών", icon: BookMarked },
  { id: "nabou", label: "Χάρτης NABOU", hint: "Διαδραστικός ιστορικός χάρτης", icon: Map },
  { id: "agents", label: "Agents", hint: "Κατάσταση των agents", icon: Network },
  { id: "library", label: "Βιβλιοθήκη", hint: "Αναζήτηση στη βιβλιοθήκη", icon: Library },
  { id: "projects", label: "Έργα", hint: "Τρέχον έργο και ιστορικό", icon: FolderKanban },
  { id: "settings", label: "Ρυθμίσεις", hint: "Φωνή, εμφάνιση, σύνδεση", icon: Settings2 },
];

export default function EveRail({ active, onSelect, mobileOpen }: { active: Section; onSelect: (s: Section) => void; mobileOpen: boolean }) {
  return (
    <nav className="eve-rail" data-mobile-open={mobileOpen} aria-label="Πλοήγηση N7">
      <ul>
        {SECTIONS.map(({ id, label, hint, icon: Icon }) => (
          <li key={id} className={id === "settings" ? "eve-rail-bottom" : undefined}>
            <button type="button" className="eve-rail-item" aria-current={active === id ? "page" : undefined}
              title={hint} data-section={id} onClick={() => onSelect(id)}>
              <span className="eve-rail-ico"><Icon size={17} strokeWidth={1.5} aria-hidden="true" /></span>
              <span className="eve-rail-label">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
