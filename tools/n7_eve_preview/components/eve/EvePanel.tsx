"use client";
import { X } from "lucide-react";
import type { ReactNode } from "react";

// One frame for every side panel: thin luminous edge, a title strip, scrollable body.
export default function EvePanel({ title, code, onClose, children, footer, wide, footClass }: {
  title: string; code: string; onClose?: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; footClass?: string;
}) {
  return (
    <section className="eve-panel" data-wide={wide || undefined} aria-label={title}>
      <header className="eve-panel-head">
        <div><small>{code}</small><h2>{title}</h2></div>
        {onClose && <button type="button" className="eve-icon-btn" onClick={onClose} aria-label="Κλείσιμο">
          <X size={16} strokeWidth={1.4} /></button>}
      </header>
      <div className="eve-panel-body">{children}</div>
      {footer && <footer className={"eve-panel-foot" + (footClass ? " " + footClass : "")}>{footer}</footer>}
    </section>
  );
}

export function EveEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="eve-empty" role="status"><span className="eve-empty-line" aria-hidden="true" /><b>{title}</b>{children && <p>{children}</p>}</div>;
}

export function EveDetails({ summary = "Λεπτομέρειες", children }: { summary?: string; children: ReactNode }) {
  return <details className="eve-details"><summary>{summary}</summary><div>{children}</div></details>;
}

export function EveField({ label, value, tone }: { label: string; value: ReactNode; tone?: "ok" | "warn" | "off" }) {
  return <div className="eve-field" data-tone={tone}><span>{label}</span><b>{value}</b></div>;
}
