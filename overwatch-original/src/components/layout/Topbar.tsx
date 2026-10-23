'use client';

import { usePathname } from 'next/navigation';
import { Clock, Wifi, Signal, Database } from 'lucide-react';
import { useEffect, useState } from 'react';

const pageNames: Record<string, string> = {
  '/': 'GLOBAL OVERVIEW',
  '/geo-tracking': 'GEO TRACKING',
  '/surveillance': 'SURVEILLANCE',
  '/sentinel': 'SENTINEL SCANNING',
  '/cyber-threats': 'CYBER THREATS',
  '/osint-feeds': 'OSINT FEEDS',
};

export default function Topbar() {
  const pathname = usePathname();
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-10 flex items-center justify-between px-6 border-b border-glass-border bg-bg-secondary/50 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <h1 className="font-mono text-xs font-semibold tracking-widest text-accent-cyan">
          {pageNames[pathname] || 'OVERWATCH'}
        </h1>
        <div className="h-4 w-px bg-glass-border" />
        <span className="text-xs text-text-muted font-mono">
          OPERATIONAL
        </span>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Database className="w-3 h-3 text-accent-green" />
          <span className="font-mono">API</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Signal className="w-3 h-3 text-accent-green" />
          <span className="font-mono">LINK</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Wifi className="w-3 h-3 text-accent-green" />
          <span className="font-mono">NET</span>
        </div>
        <div className="h-4 w-px bg-glass-border" />
        <div className="flex items-center gap-1.5 text-xs text-accent-cyan font-mono">
          <Clock className="w-3 h-3" />
          <span>{time}</span>
        </div>
      </div>
    </header>
  );
}
