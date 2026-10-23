import { create } from 'zustand';

export interface Target {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  heading: number;
  status: 'active' | 'idle' | 'lost';
  classification: 'friendly' | 'neutral' | 'hostile' | 'unknown';
  lastSeen: string;
  trail: [number, number][];
}

interface TrackingState {
  targets: Target[];
  selectedTargetId: string | null;
  trackingActive: boolean;
  setTargets: (targets: Target[]) => void;
  addTarget: (target: Target) => void;
  updateTarget: (id: string, updates: Partial<Target>) => void;
  selectTarget: (id: string | null) => void;
  setTrackingActive: (active: boolean) => void;
}

export const useTrackingStore = create<TrackingState>((set) => ({
  targets: [],
  selectedTargetId: null,
  trackingActive: true,
  setTargets: (targets) => set({ targets }),
  addTarget: (target) => set((s) => ({ targets: [...s.targets, target] })),
  updateTarget: (id, updates) =>
    set((s) => ({
      targets: s.targets.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  selectTarget: (id) => set({ selectedTargetId: id }),
  setTrackingActive: (active) => set({ trackingActive: active }),
}));
