'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUIStore } from '@/stores/uiStore';
import {
  LayoutDashboard,
  Crosshair,
  Eye,
  Radar,
  Shield,
  Rss,
  ChevronLeft,
  ChevronRight,
  Activity,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/geo-tracking', label: 'Geo Tracking', icon: Crosshair },
  { href: '/surveillance', label: 'Surveillance', icon: Eye },
  { href: '/sentinel', label: 'Sentinel Scan', icon: Radar },
  { href: '/cyber-threats', label: 'Cyber Threats', icon: Shield },
  { href: '/osint-feeds', label: 'OSINT Feeds', icon: Rss },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-50 flex flex-col transition-all duration-300 ease-in-out ${
        sidebarCollapsed ? 'w-16' : 'w-56'
      } bg-bg-secondary/90 backdrop-blur-xl border-r border-glass-border`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-glass-border">
        <div className="w-8 h-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center flex-shrink-0">
          <Activity className="w-4 h-4 text-accent-cyan" />
        </div>
        {!sidebarCollapsed && (
          <span className="font-mono font-bold text-sm text-accent-cyan tracking-wider text-glow-cyan">
            OVERWATCH
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1 stagger-children">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
                isActive
                  ? 'bg-accent-cyan/10 text-accent-cyan'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-accent-cyan rounded-r" />
              )}
              <Icon
                className={`w-5 h-5 flex-shrink-0 transition-colors ${
                  isActive ? 'text-accent-cyan' : 'group-hover:text-text-primary'
                }`}
              />
              {!sidebarCollapsed && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status */}
      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-t border-glass-border">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span className="font-mono">SYSTEMS ONLINE</span>
          </div>
          <div className="mt-1 text-xs text-text-muted font-mono">
            {new Date().toISOString().split('T')[0]}
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-glass-border text-text-muted hover:text-accent-cyan transition-colors"
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}
