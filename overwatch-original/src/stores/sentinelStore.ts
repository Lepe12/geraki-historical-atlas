import { create } from 'zustand';

export interface ScanRegion {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
}

export interface ThreatIndicator {
  category: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  value: number;
}

export interface SentinelReport {
  region: string;
  timestamp: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  indicators: ThreatIndicator[];
  articles: { title: string; source: string; sentiment: number }[];
}

interface SentinelState {
  scanning: boolean;
  scanProgress: number;
  selectedRegion: ScanRegion | null;
  currentReport: SentinelReport | null;
  regions: ScanRegion[];
  startScan: (region: ScanRegion) => void;
  setScanProgress: (progress: number) => void;
  completeScan: (report: SentinelReport) => void;
  stopScan: () => void;
}

const defaultRegions: ScanRegion[] = [
  { id: 'eu-west', name: 'Western Europe', lat: 48.8566, lng: 2.3522, zoom: 4 },
  { id: 'eu-north', name: 'Northern Europe', lat: 60.1699, lng: 24.9384, zoom: 4 },
  { id: 'na-east', name: 'North America East', lat: 40.7128, lng: -74.006, zoom: 4 },
  { id: 'asia-east', name: 'East Asia', lat: 35.6762, lng: 139.6503, zoom: 4 },
  { id: 'me', name: 'Middle East', lat: 25.2048, lng: 55.2708, zoom: 4 },
  { id: 'africa', name: 'Sub-Saharan Africa', lat: -1.2921, lng: 36.8219, zoom: 4 },
  { id: 'sa', name: 'South America', lat: -23.5505, lng: -46.6333, zoom: 4 },
  { id: 'oceania', name: 'Oceania', lat: -33.8688, lng: 151.2093, zoom: 4 },
];

export const useSentinelStore = create<SentinelState>((set) => ({
  scanning: false,
  scanProgress: 0,
  selectedRegion: null,
  currentReport: null,
  regions: defaultRegions,
  startScan: (region) =>
    set({ scanning: true, scanProgress: 0, selectedRegion: region, currentReport: null }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  completeScan: (report) =>
    set({ scanning: false, scanProgress: 100, currentReport: report }),
  stopScan: () =>
    set({ scanning: false, scanProgress: 0 }),
}));
