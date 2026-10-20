'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import GlassPanel from '@/components/layout/GlassPanel';
import CountUp from '@/components/effects/CountUp';
import StatusDot from '@/components/effects/StatusDot';
import TypewriterText from '@/components/effects/TypewriterText';
import ParticleField from '@/components/effects/ParticleField';
import { useNews } from '@/hooks/useApiData';
import { useThreatEvents } from '@/hooks/useApiData';
import { ThreatEvent } from '@/lib/api/threats';
import mapboxgl from 'mapbox-gl';
import {
  Shield,
  AlertTriangle,
  Globe,
  Activity,
  TrendingUp,
  Zap,
  Server,
  Wifi,
} from 'lucide-react';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-bg-secondary animate-pulse flex items-center justify-center">
      <span className="font-mono text-xs text-text-muted">LOADING MAP...</span>
    </div>
  ),
});

const severityColors: Record<string, string> = {
  low: '#00ff88',
  medium: '#ffc107',
  high: '#ff6b35',
  critical: '#ff3366',
};

const threatTypeIcons: Record<string, string> = {
  malware: 'MAL',
  phishing: 'PHI',
  ddos: 'DDS',
  ransomware: 'RAN',
  apt: 'APT',
  exploit: 'EXP',
};

const sectorTrends = [
  { name: 'Ransomware', change: 12.5, severity: 'high' as const },
  { name: 'Phishing Campaigns', change: 8.2, severity: 'medium' as const },
  { name: 'APT Groups', change: -3.1, severity: 'critical' as const },
  { name: 'DDoS Attacks', change: 5.7, severity: 'medium' as const },
  { name: 'Supply Chain', change: 15.3, severity: 'high' as const },
  { name: 'Zero-Day Exploits', change: 2.1, severity: 'critical' as const },
];

export default function DashboardPage() {
  const { data: threats = [] } = useThreatEvents();
  const { data: news = [] } = useNews();
  const [mapLoaded, setMapLoaded] = useState(false);

  // Count unique source regions that have active threats
  const uniqueRegions = new Set(threats.map((t) => `${Math.round(t.lat / 5)},${Math.round(t.lng / 5)}`)).size;
  // Count active data feeds (threats always present + news if loaded)
  const activeFeeds = [threats.length > 0, news.length > 0, true /* CVE/NVD */, true /* GDELT */, true /* Mapbox */].filter(Boolean).length;

  const stats = {
    activeThreats: threats.length,
    critical: threats.filter((t) => t.severity === 'critical').length,
    regions: uniqueRegions,
    feeds: activeFeeds,
  };

  return (
    <div className="h-full flex flex-col">
      {/* Stats Bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-glass-border bg-bg-secondary/30">
        <StatChip icon={<Shield className="w-3.5 h-3.5" />} label="ACTIVE THREATS" value={stats.activeThreats} color="text-accent-red" />
        <StatChip icon={<AlertTriangle className="w-3.5 h-3.5" />} label="CRITICAL" value={stats.critical} color="text-accent-orange" />
        <StatChip icon={<Globe className="w-3.5 h-3.5" />} label="REGIONS" value={stats.regions} color="text-accent-cyan" />
        <StatChip icon={<Activity className="w-3.5 h-3.5" />} label="FEEDS ACTIVE" value={stats.feeds} color="text-accent-green" />
        <div className="ml-auto flex items-center gap-2">
          <StatusDot color="green" size="sm" />
          <span className="font-mono text-xs text-text-muted">ALL SYSTEMS NOMINAL</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Sector Trends */}
        <div className="w-72 border-r border-glass-border p-4 overflow-y-auto space-y-3 stagger-children">
          <GlassPanel title="HOT SECTOR TRENDS" titleColor="text-accent-orange" scanLine>
            <div className="space-y-2.5">
              {sectorTrends.map((trend) => (
                <div
                  key={trend.name}
                  className="flex items-center justify-between py-1.5 border-b border-glass-border last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <StatusDot
                      color={
                        trend.severity === 'critical'
                          ? 'red'
                          : trend.severity === 'high'
                          ? 'orange'
                          : 'yellow'
                      }
                      pulse={trend.severity === 'critical'}
                      size="sm"
                    />
                    <span className="text-xs text-text-primary">{trend.name}</span>
                  </div>
                  <span
                    className={`text-xs font-mono ${
                      trend.change > 0 ? 'text-accent-red' : 'text-accent-green'
                    }`}
                  >
                    {trend.change > 0 ? '+' : ''}
                    {trend.change}%
                  </span>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel title="SYSTEM STATUS" titleColor="text-accent-green">
            <div className="space-y-2">
              {[
                { name: 'GDELT Feed', status: 'online' },
                { name: 'OpenSky Network', status: 'online' },
                { name: 'NVD / CVE Feed', status: 'online' },
                { name: 'Threat Intel', status: 'online' },
                { name: 'Mapbox Tiles', status: 'online' },
              ].map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">{s.name}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusDot color="green" size="sm" pulse={false} />
                    <span className="text-xs font-mono text-accent-green uppercase">
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel title="THREAT DISTRIBUTION" titleColor="text-accent-purple">
            <div className="space-y-2">
              {Object.entries(
                threats.reduce((acc, t) => {
                  acc[t.type] = (acc[t.type] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              )
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-accent-cyan w-8">
                      {threatTypeIcons[type] || type.slice(0, 3).toUpperCase()}
                    </span>
                    <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-cyan/60 rounded-full transition-all duration-1000"
                        style={{ width: `${(count / threats.length) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-text-muted w-6 text-right">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </GlassPanel>
        </div>

        {/* Center - Map */}
        <div className="flex-1 relative">
          <ParticleField count={30} className="z-10 opacity-30" />
          <MapContainer
            center={[0, 20]}
            zoom={1.8}
            className="w-full h-full"
            onMapLoad={(map) => {
              setMapLoaded(true);
              // Add threat markers to map
              if (threats.length > 0) {
                addThreatMarkers(map, threats);
              }
            }}
          />

          {/* Map Overlay - Title */}
          <div className="absolute top-4 left-4 z-20">
            <div className="glass px-4 py-2 rounded-lg">
              <h2 className="font-mono text-xs text-accent-cyan tracking-wider text-glow-cyan">
                GLOBAL THREAT OVERVIEW
              </h2>
              <p className="font-mono text-[10px] text-text-muted mt-0.5">
                Real-time cyber incident monitoring
              </p>
            </div>
          </div>

          {/* Map Overlay - Legend */}
          <div className="absolute bottom-4 left-4 z-20">
            <div className="glass px-3 py-2 rounded-lg">
              <div className="flex items-center gap-4">
                {Object.entries(severityColors).map(([level, color]) => (
                  <div key={level} className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono text-[10px] text-text-muted uppercase">
                      {level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Intel Feed */}
        <div className="w-80 border-l border-glass-border p-4 overflow-y-auto space-y-3 stagger-children">
          <GlassPanel title="LIVE INTEL FEED" titleColor="text-accent-cyan" scanLine glowBorder>
            <div className="space-y-3">
              {news.length > 0 ? (
                news.slice(0, 8).map((article, i) => (
                  <div
                    key={i}
                    className="pb-2.5 border-b border-glass-border last:border-0 group"
                  >
                    <div className="flex items-start gap-2">
                      <StatusDot
                        color={i < 2 ? 'red' : i < 5 ? 'yellow' : 'cyan'}
                        size="sm"
                        pulse={i < 2}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-primary leading-relaxed line-clamp-2 group-hover:text-accent-cyan transition-colors">
                          {article.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-[10px] text-accent-cyan">
                            {article.source}
                          </span>
                          <span className="text-[10px] text-text-muted">
                            {formatTimeAgo(article.publishedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center">
                  <div className="animate-pulse">
                    <span className="font-mono text-xs text-text-muted">
                      <TypewriterText text="CONNECTING TO INTEL FEEDS..." speed={30} />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>

          <GlassPanel title="RECENT INCIDENTS" titleColor="text-accent-red">
            <div className="flex justify-end mb-1">
              <span className="font-mono text-[8px] px-1 py-0.5 rounded bg-accent-yellow/10 text-accent-yellow/70 border border-accent-yellow/20">
                SIMULATED
              </span>
            </div>
            <div className="space-y-2">
              {threats.slice(0, 6).map((threat) => (
                <div
                  key={threat.id}
                  className="flex items-center gap-2 py-1 border-b border-glass-border last:border-0"
                >
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-mono font-bold"
                    style={{
                      backgroundColor: `${severityColors[threat.severity]}20`,
                      color: severityColors[threat.severity],
                    }}
                  >
                    {threatTypeIcons[threat.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-primary truncate">
                      {threat.description}
                    </p>
                    <p className="font-mono text-[10px] text-text-muted">
                      {threat.source} · {formatTimeAgo(threat.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-lg">
      <span className={color}>{icon}</span>
      <div>
        <p className="font-mono text-[10px] text-text-muted">{label}</p>
        <p className={`font-mono text-sm font-bold ${color}`}>
          <CountUp end={value} duration={1500} />
        </p>
      </div>
    </div>
  );
}

function addThreatMarkers(map: mapboxgl.Map, threats: ThreatEvent[]) {
  // Add markers using Mapbox native API for performance
  const geojson = {
    type: 'FeatureCollection' as const,
    features: threats
      .filter((t) => t.lat && t.lng)
      .map((t) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [t.lng, t.lat],
        },
        properties: {
          severity: t.severity,
          type: t.type,
          description: t.description,
        },
      })),
  };

  if (map.getSource('threats')) {
    (map.getSource('threats') as mapboxgl.GeoJSONSource).setData(geojson);
  } else {
    map.addSource('threats', { type: 'geojson', data: geojson });

    map.addLayer({
      id: 'threat-glow',
      type: 'circle',
      source: 'threats',
      paint: {
        'circle-radius': 12,
        'circle-color': [
          'match',
          ['get', 'severity'],
          'critical', '#ff3366',
          'high', '#ff6b35',
          'medium', '#ffc107',
          '#00ff88',
        ],
        'circle-opacity': 0.15,
        'circle-blur': 1,
      },
    });

    map.addLayer({
      id: 'threat-points',
      type: 'circle',
      source: 'threats',
      paint: {
        'circle-radius': 4,
        'circle-color': [
          'match',
          ['get', 'severity'],
          'critical', '#ff3366',
          'high', '#ff6b35',
          'medium', '#ffc107',
          '#00ff88',
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': [
          'match',
          ['get', 'severity'],
          'critical', '#ff3366',
          'high', '#ff6b35',
          'medium', '#ffc107',
          '#00ff88',
        ],
        'circle-stroke-opacity': 0.4,
      },
    });
  }
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
