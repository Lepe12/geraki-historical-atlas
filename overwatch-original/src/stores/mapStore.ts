import { create } from 'zustand';

interface MapViewport {
  lng: number;
  lat: number;
  zoom: number;
}

interface MapState {
  viewport: MapViewport;
  mapStyle: 'dark' | 'satellite';
  selectedMarkerId: string | null;
  setViewport: (viewport: Partial<MapViewport>) => void;
  setMapStyle: (style: 'dark' | 'satellite') => void;
  setSelectedMarker: (id: string | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  viewport: { lng: -122.4194, lat: 37.7749, zoom: 12 },
  mapStyle: 'dark',
  selectedMarkerId: null,
  setViewport: (viewport) =>
    set((s) => ({ viewport: { ...s.viewport, ...viewport } })),
  setMapStyle: (mapStyle) => set({ mapStyle }),
  setSelectedMarker: (id) => set({ selectedMarkerId: id }),
}));
