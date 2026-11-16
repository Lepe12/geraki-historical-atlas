"use client";
// Real service status for the side panels. Each value is what a service returned, or null when it
// could not be read; the UI shows «—» for null and never fills a gap with an invented value.
import { useCallback, useEffect, useState } from "react";
import { loadCatalog, pct, type ApiData } from "./eveApi";

export type SystemStatus = {
  agent: ApiData | null; agentError: string;
  health: ApiData | null; healthError: string;
  library: ApiData | null; libraryError: string;
  sources: number | null; checkedAt: Date | null;
};

export default function useSystemStatus(pollMs = 60000) {
  const [s, setS] = useState<SystemStatus>({ agent: null, agentError: "", health: null, healthError: "", library: null, libraryError: "", sources: null, checkedAt: null });
  const load = useCallback(async () => {
    const [a, h, l, c] = await Promise.all([pct<ApiData>("/n7/status", { timeout: 12000 }), pct<ApiData>("/health", { timeout: 12000 }), pct<ApiData>("/library/status", { timeout: 12000 }), loadCatalog().catch(() => null)]);
    setS({
      agent: a.ok ? a.data : null, agentError: a.ok ? "" : a.error,
      health: h.ok ? h.data : null, healthError: h.ok ? "" : h.error,
      library: l.ok ? l.data : null, libraryError: l.ok ? "" : l.error,
      sources: c && !c.error ? c.books.length + c.added.length : null,
      checkedAt: new Date(),
    });
  }, []);
  useEffect(() => { void load(); const t = window.setInterval(() => void load(), pollMs); return () => window.clearInterval(t); }, [load, pollMs]);
  return { ...s, reload: load };
}
export type SystemStatusHook = ReturnType<typeof useSystemStatus>;
