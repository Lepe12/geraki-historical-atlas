"use client";
import { useState, type ReactNode } from "react";
import { Minus, X } from "lucide-react";

// Glass panel with chamfered corners, a thin glowing cyan edge, caption header and window controls.
export default function EvePanel({ title, code, onClose, children, footer, wide, footClass, className, minimizable = true }: {
  title: string; code?: string; onClose?: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; footClass?: string; className?: string; minimizable?: boolean;
}) {
  const [min, setMin] = useState(false);
  return (
    <section className={"eve-glass" + (className ? " " + className : "")} data-wide={wide || undefined} data-min={min || undefined} aria-label={title}>
      <div className="eve-glass-in">
        <header className="eve-panel-head">
          <i className="eve-accent" aria-hidden="true" />
          <h2>{title}</h2>
          {code && <small>{code}</small>}
          <span className="eve-winctl">
            {minimizable && <button type="button" onClick={() => setMin(m => !m)} aria-label={min ? "Ανάπτυξη" : "Σύμπτυξη"} aria-expanded={!min}><Minus size={11} strokeWidth={1.6} /></button>}
            {onClose && <button type="button" onClick={onClose} aria-label="Κλείσιμο"><X size={11} strokeWidth={1.6} /></button>}
          </span>
        </header>
        {!min && <div className="eve-panel-body">{children}</div>}
        {!min && footer && <footer className={"eve-panel-foot" + (footClass ? " " + footClass : "")}>{footer}</footer>}
      </div>
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
