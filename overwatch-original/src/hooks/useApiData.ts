'use client';

import { useQuery } from '@tanstack/react-query';
import { GdeltArticle } from '@/lib/api/gdelt';
import { FlightState } from '@/lib/api/opensky';
import { CveItem, ThreatEvent, generateThreatEvents } from '@/lib/api/threats';
import { NewsArticle } from '@/lib/api/news';

export function useGdeltArticles(query?: string) {
  return useQuery<GdeltArticle[]>({
    queryKey: ['gdelt', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const res = await fetch(`/api/gdelt?${params}`);
      const data = await res.json();
      return data.articles || [];
    },
    refetchInterval: 300_000, // 5 min
  });
}

export function useFlights(bounds?: {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
}) {
  return useQuery<FlightState[]>({
    queryKey: ['flights', bounds],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (bounds) {
        Object.entries(bounds).forEach(([k, v]) => params.set(k, String(v)));
      }
      const res = await fetch(`/api/opensky?${params}`);
      const data = await res.json();
      return data.flights || [];
    },
    refetchInterval: 15_000, // 15 sec
  });
}

export function useRecentCves(limit?: number) {
  return useQuery<CveItem[]>({
    queryKey: ['cves', limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      const res = await fetch(`/api/threats?${params}`);
      const data = await res.json();
      return data.cves || [];
    },
    refetchInterval: 120_000, // 2 min
  });
}

export function useThreatEvents() {
  return useQuery<ThreatEvent[]>({
    queryKey: ['threat-events'],
    queryFn: () => generateThreatEvents(50),
    refetchInterval: 30_000,
  });
}

export function useNews(query?: string) {
  return useQuery<NewsArticle[]>({
    queryKey: ['news', query],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const res = await fetch(`/api/news?${params}`);
      const data = await res.json();
      return data.articles || [];
    },
    refetchInterval: 300_000,
  });
}
