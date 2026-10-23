'use client';

import { useUIStore } from '@/stores/uiStore';
import Topbar from './Topbar';

export default function MainContent({ children }: { children: React.ReactNode }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <div
      className={`flex-1 flex flex-col transition-all duration-300 ${
        collapsed ? 'ml-16' : 'ml-56'
      }`}
    >
      <Topbar />
      <main className="flex-1 overflow-hidden relative grid-bg">
        {children}
      </main>
    </div>
  );
}
