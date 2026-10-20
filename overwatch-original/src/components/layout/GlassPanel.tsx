'use client';

import { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
  titleColor?: string;
  scanLine?: boolean;
  glowBorder?: boolean;
  padding?: boolean;
}

export default function GlassPanel({
  children,
  className = '',
  title,
  titleColor = 'text-accent-cyan',
  scanLine = false,
  glowBorder = false,
  padding = true,
}: GlassPanelProps) {
  return (
    <div
      className={`glass rounded-lg overflow-hidden ${
        glowBorder ? 'animate-glow-border' : ''
      } ${scanLine ? 'scan-line' : ''} ${className}`}
    >
      {title && (
        <div className="px-4 py-2.5 border-b border-glass-border flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full bg-current ${titleColor}`} />
          <h3 className={`font-mono text-xs font-semibold tracking-wider ${titleColor}`}>
            {title}
          </h3>
        </div>
      )}
      <div className={padding ? 'p-4' : ''}>{children}</div>
    </div>
  );
}
