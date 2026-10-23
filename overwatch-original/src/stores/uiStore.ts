import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  activePage: string;
  toggleSidebar: () => void;
  setActivePage: (page: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activePage: '/',
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setActivePage: (page) => set({ activePage: page }),
}));
