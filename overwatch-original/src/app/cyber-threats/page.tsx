'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import GlassPanel from '@/components/layout/GlassPanel';
import StatusDot from '@/components/effects/StatusDot';
import CountUp from '@/components/effects/CountUp';
import { useRecentCves, useThreatEvents } from '@/hooks/useApiData';
import { CveItem } from '@/lib/api/threats';
import {
  Shield,
  Bug,
  AlertTriangle,
  Lock,
  Database,
  Search,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-bg-secondary animate-pulse flex items-center justify-center">
      <span className="font-mono text-xs text-text-muted">LOADING THREAT MAP...</span>
    </div>
  ),
});

const severityColors: Record<string, { color: string; bg: string }> = {
  CRITICAL: { color: '#ff3366', bg: 'bg-accent-red/10' },
  HIGH: { color: '#ff6b35', bg: 'bg-accent-orange/10' },
  MEDIUM: { color: '#ffc107', bg: 'bg-accent-yellow/10' },
  LOW: { color: '#00ff88', bg: 'bg-accent-green/10' },
};

export default function CyberThreatsPage() {
  const { data: cves = [], isLoading: cvesLoading } = useRecentCves(20);
  const { data: threats = [] } = useThreatEvents();
  const [selectedCve, setSelectedCve] = useState<CveItem | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');

  const filteredCves =
    filterSeverity === 'ALL'
      ? cves
      : cves.filter((c) => c.severity === filterSeverity);

  const stats = {
    total: cves.length,
    critical: cves.filter((c) => c.severity === 'CRITICAL').length,
    high: cves.filter((c) => c.severity === 'HIGH').length,
    avgScore: cves.length > 0
      ? (cves.reduce((sum, c) => sum + c.score, 0) / cves.length)
      : 0,
  };

  return (
    <div className="h-full flex flex-col">
      {/* Stats Bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-glass-border bg-bg-secondary/30">
        <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-lg">
          <Bug className="w-3.5 h-3.5 text-accent-red" />
          <div>
            <p className="font-mono text-[10px] text-text-muted">TOTAL CVEs</p>
            <p className="font-mono text-sm font-bold text-accent-red">
              <CountUp end={stats.total} duration={1000} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-lg">
          <AlertTriangle className="w-3.5 h-3.5 text-accent-orange" />
          <div>
            <p className="font-mono text-[10px] text-text-muted">CRITICAL</p>
            <p className="font-mono text-sm font-bold text-accent-orange">
              <CountUp end={stats.critical} duration={1000} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-lg">
          <Shield className="w-3.5 h-3.5 text-accent-yellow" />
          <div>
            <p className="font-mono text-[10px] text-text-muted">AVG CVSS</p>
            <p className="font-mono text-sm font-bold text-accent-yellow">
              <CountUp end={stats.avgScore} duration={1000} decimals={1} />
            </p>
          </div>
        </div>

        {/* Severity Filter */}
        <div className="ml-auto flex items-center gap-1">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                filterSeverity === sev
                  ? sev === 'ALL'
                    ? 'bg-accent-cyan/20 text-accent-cyan'
                    : `${severityColors[sev]?.bg || ''} text-text-primary`
                  : 'text-text-muted hover:bg-white/5'
              }`}
              style={
                filterSeverity === sev && sev !== 'ALL'
                  ? { color: severityColors[sev]?.color }
                  : undefined
              }
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left - Threat Map */}
        <div className="flex-1 relative">
          <MapContainer
            center={[0, 20]}
            zoom={1.8}
            className="w-full h-full"
            onMapLoad={(map) => {
              addThreatHeatmap(map, threats);
            }}
          />

          <div className="absolute top-4 left-4 z-20">
            <div className="glass px-4 py-2 rounded-lg">
              <h2 className="font-mono text-xs text-accent-red tracking-wider">
                CYBER THREAT MAP
              </h2>
              <p className="font-mono text-[10px] text-text-muted mt-0.5">
                Global threat event distribution
              </p>
            </div>
          </div>
        </div>

        {/* Right - CVE Feed */}
        <div className="w-96 border-l border-glass-border flex flex-col">
          <div className="px-4 py-2.5 border-b border-glass-border flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-accent-red" />
            <span className="font-mono text-xs font-semibold text-accent-red tracking-wider">
              NVD / CVE FEED
            </span>
            <span className="ml-auto text-[10px] text-text-muted font-mono">
              LIVE
            </span>
            <StatusDot color="red" size="sm" />
          </div>

          <div className="flex-1 overflow-y-auto stagger-children">
            {cvesLoading ? (
              <div className="p-8 text-center">
                <span className="font-mono text-xs text-text-muted animate-pulse">
                  FETCHING CVE DATA...
                </span>
              </div>
            ) : (
              filteredCves.map((cve) => (
                <button
                  key={cve.id}
                  onClick={() => setSelectedCve(selectedCve?.id === cve.id ? null : cve)}
                  className={`w-full px-4 py-3 border-b border-glass-border text-left transition-all hover:bg-white/5 ${
                    selectedCve?.id === cve.id ? 'bg-accent-red/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-accent-cyan">
                          {cve.id}
                        </span>
                        <span
                          className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${severityColors[cve.severity]?.color || '#ffc107'}20`,
                            color: severityColors[cve.severity]?.color || '#ffc107',
                          }}
                        >
                          {cve.severity}
                        </span>
                      </div>
                      <p className={`text-[11px] text-text-muted mt-1 leading-relaxed ${
                        selectedCve?.id === cve.id ? '' : 'line-clamp-2'
                      }`}>
                        {cve.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="font-mono text-[10px] text-text-muted">
                          CVSS: {cve.score.toFixed(1)}
                        </span>
                        <span className="font-mono text-[10px] text-text-muted">
                          {new Date(cve.published).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div
                        className="w-10 h-10 rounded flex items-center justify-center font-mono text-sm font-bold"
                        style={{
                          backgroundColor: `${severityColors[cve.severity]?.color || '#ffc107'}15`,
                          color: severityColors[cve.severity]?.color || '#ffc107',
                        }}
                      >
                        {cve.score.toFixed(1)}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function addThreatHeatmap(map: mapboxgl.Map, threats: { lat: number; lng: number; severity: string }[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: threats.map((t) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [t.lng, t.lat] },
      properties: { severity: t.severity },
    })),
  };

  map.addSource('threat-heat', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'threat-heatmap',
    type: 'heatmap',
    source: 'threat-heat',
    paint: {
      'heatmap-weight': [
        'match',
        ['get', 'severity'],
        'critical', 1,
        'high', 0.7,
        'medium', 0.4,
        0.2,
      ],
      'heatmap-intensity': 0.6,
      'heatmap-radius': 30,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.2, 'rgba(0,240,255,0.2)',
        0.4, 'rgba(0,255,136,0.4)',
        0.6, 'rgba(255,193,7,0.5)',
        0.8, 'rgba(255,107,53,0.6)',
        1, 'rgba(255,51,102,0.8)',
      ],
    },
  });

  map.addLayer({
    id: 'threat-points-cyber',
    type: 'circle',
    source: 'threat-heat',
    paint: {
      'circle-radius': 3,
      'circle-color': [
        'match',
        ['get', 'severity'],
        'critical', '#ff3366',
        'high', '#ff6b35',
        'medium', '#ffc107',
        '#00ff88',
      ],
      'circle-opacity': 0.6,
    },
  });
}
