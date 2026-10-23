'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import GlassPanel from '@/components/layout/GlassPanel';
import StatusDot from '@/components/effects/StatusDot';
import CountUp from '@/components/effects/CountUp';
import { useTrackingStore, Target } from '@/stores/trackingStore';
import { mockTargets, classificationColors, statusColors } from '@/lib/mockData';
import {
  Crosshair,
  MapPin,
  Navigation,
  Gauge,
  Clock,
  Radio,
  ChevronRight,
} from 'lucide-react';
import mapboxgl from 'mapbox-gl';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-bg-secondary animate-pulse flex items-center justify-center">
      <span className="font-mono text-xs text-text-muted">INITIALIZING TRACKING SYSTEM...</span>
    </div>
  ),
});

export default function GeoTrackingPage() {
  const { targets, setTargets, selectedTargetId, selectTarget, trackingActive } =
    useTrackingStore();
  const [mapRef, setMapRef] = useState<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (targets.length === 0) {
      setTargets(mockTargets);
    }
  }, [targets.length, setTargets]);

  // Simulate target movement
  useEffect(() => {
    if (!trackingActive) return;

    const interval = setInterval(() => {
      setTargets(
        targets.map((t) => {
          if (t.status !== 'active') return t;
          const newLat = t.lat + (Math.random() - 0.5) * 0.001;
          const newLng = t.lng + (Math.random() - 0.5) * 0.001;
          return {
            ...t,
            lat: newLat,
            lng: newLng,
            speed: Math.max(0, t.speed + (Math.random() - 0.5) * 5),
            heading: (t.heading + (Math.random() - 0.5) * 10 + 360) % 360,
            trail: [...t.trail.slice(-10), [newLng, newLat] as [number, number]],
            lastSeen: new Date().toISOString(),
          };
        })
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [targets, trackingActive, setTargets]);

  const selectedTarget = targets.find((t) => t.id === selectedTargetId);

  const handleMapLoad = useCallback(
    (map: mapboxgl.Map) => {
      setMapRef(map);
      addTargetLayers(map, targets);
    },
    [targets]
  );

  // Update markers when targets change
  useEffect(() => {
    if (!mapRef) return;
    updateTargetData(mapRef, targets);
  }, [mapRef, targets]);

  return (
    <div className="h-full flex">
      {/* Left Panel - Target List */}
      <div className="w-72 border-r border-glass-border flex flex-col">
        <div className="px-4 py-3 border-b border-glass-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-accent-cyan" />
            <span className="font-mono text-xs font-semibold text-accent-cyan tracking-wider">
              SRC TRACKING
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot color={trackingActive ? 'green' : 'red'} size="sm" />
            <span className="font-mono text-[10px] text-text-muted">
              {trackingActive ? 'ACTIVE' : 'PAUSED'}
            </span>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-glass-border flex items-center justify-between">
          <span className="text-xs text-text-muted">Active Targets</span>
          <span className="font-mono text-xs text-accent-cyan font-bold">
            {targets.filter((t) => t.status === 'active').length}/{targets.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto stagger-children">
          {targets.map((target) => (
            <button
              key={target.id}
              onClick={() => {
                selectTarget(target.id);
                if (mapRef) {
                  mapRef.flyTo({
                    center: [target.lng, target.lat],
                    zoom: 15,
                    duration: 1500,
                  });
                }
              }}
              className={`w-full px-3 py-2.5 border-b border-glass-border text-left transition-all duration-200 hover:bg-white/5 ${
                selectedTargetId === target.id ? 'bg-accent-cyan/10 border-l-2 border-l-accent-cyan' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: classificationColors[target.classification].color }}
                  />
                  <span className="font-mono text-xs font-semibold text-text-primary">
                    #{target.id}
                  </span>
                </div>
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${statusColors[target.status].color}20`,
                    color: statusColors[target.status].color,
                  }}
                >
                  {statusColors[target.status].label}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] text-text-muted font-mono">
                  {target.lat.toFixed(4)}, {target.lng.toFixed(4)}
                </span>
                {target.speed > 0 && (
                  <span className="text-[10px] text-text-muted font-mono">
                    {target.speed.toFixed(0)} km/h
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Center - Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[-122.4194, 37.7749]}
          zoom={13}
          className="w-full h-full"
          onMapLoad={handleMapLoad}
        />

        {/* Map Overlay */}
        <div className="absolute top-4 left-4 z-20">
          <div className="glass px-4 py-2 rounded-lg">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xs text-accent-cyan tracking-wider text-glow-cyan">
                GEO TRACKING SYSTEM
              </h2>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/30">
                SIMULATION
              </span>
            </div>
            <p className="font-mono text-[10px] text-text-muted mt-0.5">
              Simulated target surveillance and geospatial intelligence
            </p>
          </div>
        </div>

        {/* Classification Legend */}
        <div className="absolute bottom-4 left-4 z-20">
          <div className="glass px-3 py-2 rounded-lg">
            <div className="flex items-center gap-4">
              {Object.entries(classificationColors).map(([key, { color, label }]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="font-mono text-[10px] text-text-muted">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Target Detail */}
      <div className="w-80 border-l border-glass-border overflow-y-auto">
        {selectedTarget ? (
          <div className="stagger-children">
            <div className="px-4 py-3 border-b border-glass-border">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-accent-cyan" />
                <span className="font-mono text-sm font-bold text-accent-cyan">
                  #{selectedTarget.id}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${classificationColors[selectedTarget.classification].color}20`,
                    color: classificationColors[selectedTarget.classification].color,
                  }}
                >
                  {classificationColors[selectedTarget.classification].label}
                </span>
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${statusColors[selectedTarget.status].color}20`,
                    color: statusColors[selectedTarget.status].color,
                  }}
                >
                  {statusColors[selectedTarget.status].label}
                </span>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <GlassPanel title="LOCATION DATA" titleColor="text-accent-cyan">
                <div className="space-y-2">
                  <DataRow icon={<MapPin className="w-3 h-3" />} label="Coordinates" value={`${selectedTarget.lat.toFixed(6)}, ${selectedTarget.lng.toFixed(6)}`} />
                  <DataRow icon={<Navigation className="w-3 h-3" />} label="Heading" value={`${selectedTarget.heading.toFixed(0)}°`} />
                  <DataRow icon={<Gauge className="w-3 h-3" />} label="Speed" value={`${selectedTarget.speed.toFixed(1)} km/h`} />
                  <DataRow icon={<Clock className="w-3 h-3" />} label="Last Seen" value={formatRelativeTime(selectedTarget.lastSeen)} />
                </div>
              </GlassPanel>

              <GlassPanel title="CALLSIGN" titleColor="text-accent-green">
                <span className="font-mono text-lg text-accent-green text-glow-green">
                  {selectedTarget.callsign}
                </span>
              </GlassPanel>

              <GlassPanel title="TRAIL LOG" titleColor="text-accent-purple" scanLine>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {selectedTarget.trail.slice(-8).reverse().map((point, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-[10px] font-mono text-text-muted"
                    >
                      <ChevronRight className="w-2.5 h-2.5 text-accent-purple" />
                      <span>
                        {point[1].toFixed(6)}, {point[0].toFixed(6)}
                      </span>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center p-8">
              <Crosshair className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
              <p className="text-xs text-text-muted font-mono">SELECT A TARGET</p>
              <p className="text-[10px] text-text-muted mt-1">
                Click a target from the list to view details
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DataRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-text-muted">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <span className="font-mono text-xs text-text-primary">{value}</span>
    </div>
  );
}

function addTargetLayers(map: mapboxgl.Map, targets: Target[]) {
  const geojson = targetsToGeoJSON(targets);

  map.addSource('targets', { type: 'geojson', data: geojson });

  // Trail lines
  const trailGeojson = {
    type: 'FeatureCollection' as const,
    features: targets
      .filter((t) => t.trail.length > 1)
      .map((t) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: t.trail,
        },
        properties: { classification: t.classification },
      })),
  };

  map.addSource('trails', { type: 'geojson', data: trailGeojson });

  map.addLayer({
    id: 'target-trails',
    type: 'line',
    source: 'trails',
    paint: {
      'line-color': [
        'match',
        ['get', 'classification'],
        'hostile', '#ff3366',
        'friendly', '#00ff88',
        'neutral', '#ffc107',
        '#a855f7',
      ],
      'line-width': 2,
      'line-opacity': 0.4,
      'line-dasharray': [2, 2],
    },
  });

  // Glow layer
  map.addLayer({
    id: 'target-glow',
    type: 'circle',
    source: 'targets',
    paint: {
      'circle-radius': 16,
      'circle-color': [
        'match',
        ['get', 'classification'],
        'hostile', '#ff3366',
        'friendly', '#00ff88',
        'neutral', '#ffc107',
        '#a855f7',
      ],
      'circle-opacity': 0.12,
      'circle-blur': 1,
    },
  });

  // Point layer
  map.addLayer({
    id: 'target-points',
    type: 'circle',
    source: 'targets',
    paint: {
      'circle-radius': 6,
      'circle-color': [
        'match',
        ['get', 'classification'],
        'hostile', '#ff3366',
        'friendly', '#00ff88',
        'neutral', '#ffc107',
        '#a855f7',
      ],
      'circle-opacity': 0.9,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0a0e17',
    },
  });

  // Labels
  map.addLayer({
    id: 'target-labels',
    type: 'symbol',
    source: 'targets',
    layout: {
      'text-field': ['get', 'id'],
      'text-size': 10,
      'text-offset': [0, 1.5],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
    },
    paint: {
      'text-color': '#e2e8f0',
      'text-halo-color': '#0a0e17',
      'text-halo-width': 1,
    },
  });
}

function updateTargetData(map: mapboxgl.Map, targets: Target[]) {
  const source = map.getSource('targets') as mapboxgl.GeoJSONSource;
  if (source) {
    source.setData(targetsToGeoJSON(targets));
  }

  const trailSource = map.getSource('trails') as mapboxgl.GeoJSONSource;
  if (trailSource) {
    trailSource.setData({
      type: 'FeatureCollection',
      features: targets
        .filter((t) => t.trail.length > 1)
        .map((t) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: t.trail,
          },
          properties: { classification: t.classification },
        })),
    });
  }
}

function targetsToGeoJSON(targets: Target[]) {
  return {
    type: 'FeatureCollection' as const,
    features: targets.map((t) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [t.lng, t.lat],
      },
      properties: {
        id: t.id,
        callsign: t.callsign,
        classification: t.classification,
        status: t.status,
      },
    })),
  };
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}
