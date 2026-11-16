"use client";
// Real data sources only. Nothing in this file invents a status, a result or a source.
// - N7 runtime (same origin, owner session): /api/status, /api/login, /api/conversations, /api/tasks,
//   /api/agents, /api/n7/job/:id, /api/research/missions — the contract N7Workspace already uses.
// - pct-live (public NABOU backend): /library/search, /library/books, /library/status, /n7/status, /health.
import { N7_EVE_PCT_API, N7_EVE_ATLAS_BASE } from "../N7EveConfig";

export type ApiData = Record<string, unknown>;

export async function n7Api(path: string, payload?: Record<string, unknown>): Promise<ApiData> {
  if (!path.startsWith("/api/") || path.startsWith("//")) throw Error("Unsafe N7 API path");
  const response = await fetch(path, {
    method: payload ? "POST" : "GET",
    credentials: "same-origin",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: "no-store",
  });
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw Error("Το N7 δεν απαντά σε αυτή τη διεύθυνση (το περιβάλλον πρέπει να τρέχει στον server του N7).");
  }
  const data = (await response.json()) as ApiData;
  if (!response.ok) {
    const e = Error(String(data.error || "N7 HTTP " + response.status)) as Error & { status?: number };
    e.status = response.status;
    throw e;
  }
  return data;
}

export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw Error("Invalid ID");
  return encodeURIComponent(id);
}

export type PctResult<T> = { ok: true; data: T; status: number } | { ok: false; status: number; error: string };

export async function pct<T = ApiData>(path: string, init: { method?: string; body?: unknown; timeout?: number } = {}): Promise<PctResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeout ?? 25000);
  try {
    const r = await fetch(N7_EVE_PCT_API + path, {
      method: init.method || (init.body ? "POST" : "GET"),
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    let data: unknown = null;
    try { data = await r.json(); } catch { /* not JSON */ }
    if (!r.ok) return { ok: false, status: r.status, error: String((data as ApiData | null)?.error || "HTTP " + r.status) };
    return { ok: true, status: r.status, data: data as T };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error)?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export type LibraryHit = { book: { id: string; kind?: string; title?: string; short?: string }; page?: string; text?: string };
export type LibrarySearch = {
  schema?: string; query?: string; took_ms?: number; hits?: LibraryHit[];
  stores?: Record<string, string>; verdict?: unknown; reason?: unknown; historically_verified?: boolean;
};
export type CatalogBook = { id: string; short?: string; author?: string; year?: string; title?: string; where?: string; pages?: number | null; kind?: string };

export function searchLibrary(query: string) {
  return pct<LibrarySearch>("/library/search", { body: { query }, timeout: 30000 });
}

export async function loadCatalog(): Promise<{ books: CatalogBook[]; added: CatalogBook[]; error?: string }> {
  const [meta, live] = await Promise.all([
    fetch(N7_EVE_ATLAS_BASE + "jarvis-intelligence-chamber/data/published-library.json", { cache: "no-cache" })
      .then(r => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ books?: CatalogBook[] } | null>,
    pct<{ published?: CatalogBook[]; added?: CatalogBook[] }>("/library/books", { timeout: 10000 }),
  ]);
  const pages = new Map((live.ok ? live.data.published || [] : []).map(b => [b.id, b.pages ?? null]));
  const base = meta?.books || (live.ok ? live.data.published || [] : []);
  return {
    books: base.map(b => ({ ...b, pages: pages.get(b.id) ?? b.pages ?? null })),
    added: live.ok ? live.data.added || [] : [],
    error: live.ok ? undefined : live.error,
  };
}

// API values are shown as text only; an unexpected object never breaks the page.
export const txt = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v));
