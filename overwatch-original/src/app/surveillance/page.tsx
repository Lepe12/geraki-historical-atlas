'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import GlassPanel from '@/components/layout/GlassPanel';
import StatusDot from '@/components/effects/StatusDot';
import TypewriterText from '@/components/effects/TypewriterText';
import { useFlights } from '@/hooks/useApiData';
import { FlightState } from '@/lib/api/opensky';
import {
  Eye,
  Plane,
  MapPin,
  Layers,
  Navigation,
  Gauge,
  ArrowUp,
  Radio,
} from 'lucide-react';
import mapboxgl from 'mapbox-gl';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-bg-secondary animate-pulse flex items-center justify-center">
      <span className="font-mono text-xs text-text-muted">INITIALIZING SURVEILLANCE...</span>
    </div>
  ),
});

const viewModes = [
  { id: 'dark', label: 'DARK MAP', icon: Layers },
  { id: 'satellite', label: 'SATELLITE', icon: Eye },
] as const;

export default function SurveillancePage() {
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('dark');
  const [selectedFlight, setSelectedFlight] = useState<FlightState | null>(null);
  const [mapRef, setMapRef] = useState<mapboxgl.Map | null>(null);

  // Dynamic bounds from map viewport — wider default view
  const [bounds, setBounds] = useState({ lamin: 25, lomin: -130, lamax: 50, lomax: -60 });

  const { data: flights = [], isLoading } = useFlights(bounds);

  const handleMapLoad = useCallback(
    (map: mapboxgl.Map) => {
      setMapRef(map);
      if (flights.length > 0) {
        addFlightLayers(map, flights);
      }

      // Update bounds when user pans/zooms
      map.on('moveend', () => {
        const b = map.getBounds();
        if (!b) return;
        setBounds({
          lamin: Math.max(-90, b.getSouth()),
          lomin: Math.max(-180, b.getWest()),
          lamax: Math.min(90, b.getNorth()),
          lomax: Math.min(180, b.getEast()),
        });
      });

      map.on('click', 'flight-points', (e) => {
        if (e.features?.[0]) {
          const props = e.features[0].properties;
          const flight = flights.find((f) => f.icao24 === props?.icao24);
          if (flight) setSelectedFlight(flight);
        }
      });

      map.on('mouseenter', 'flight-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'flight-points', () => {
        map.getCanvas().style.cursor = '';
      });
    },
    [flights]
  );

  return (
    <div className="h-full flex">
      {/* Left Panel */}
      <div className="w-64 border-r border-glass-border flex flex-col">
        <div className="px-4 py-3 border-b border-glass-border">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-accent-purple" />
            <span className="font-mono text-xs font-semibold text-accent-purple tracking-wider">
              SURVEILLANCE
            </span>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="px-3 py-2 border-b border-glass-border space-y-1">
          <span className="text-[10px] text-text-muted font-mono uppercase">View Mode</span>
          <div className="flex gap-1">
            {viewModes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setMapStyle(mode.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-mono transition-all ${
                  mapStyle === mode.id
                    ? 'bg-accent-purple/20 text-accent-purple'
                    : 'text-text-muted hover:bg-white/5'
                }`}
              >
                <mode.icon className="w-3 h-3" />
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Flight List */}
        <div className="px-3 py-2 border-b border-glass-border flex items-center justify-between">
          <span className="text-[10px] text-text-muted font-mono">TRACKED FLIGHTS</span>
          <span className="font-mono text-xs text-accent-purple font-bold">
            {flights.filter((f) => !f.onGround).length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center">
              <span className="font-mono text-xs text-text-muted animate-pulse">
                ACQUIRING SIGNALS...
              </span>
            </div>
          ) : (
            flights
              .filter((f) => f.latitude && f.longitude && !f.onGround)
              .slice(0, 20)
              .map((flight) => (
                <button
                  key={flight.icao24}
                  onClick={() => {
                    setSelectedFlight(flight);
                    if (mapRef && flight.latitude && flight.longitude) {
                      mapRef.flyTo({
                        center: [flight.longitude, flight.latitude],
                        zoom: 10,
                        duration: 1500,
                      });
                    }
                  }}
                  className={`w-full px-3 py-2 border-b border-glass-border text-left transition-all hover:bg-white/5 ${
                    selectedFlight?.icao24 === flight.icao24 ? 'bg-accent-purple/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plane className="w-3 h-3 text-accent-purple" />
                      <span className="font-mono text-xs text-text-primary">
                        {flight.callsign || flight.icao24}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-muted font-mono">
                      {flight.originCountry}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted font-mono">
                    <span>ALT: {((flight.altitude || 0) / 1000).toFixed(1)}k ft</span>
                    <span>SPD: {((flight.velocity || 0) * 3.6).toFixed(0)} km/h</span>
                  </div>
                </button>
              ))
          )}
        </div>
      </div>

      {/* Center - Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[-95, 38]}
          zoom={4}
          style={mapStyle}
          className="w-full h-full"
          onMapLoad={handleMapLoad}
        />

        <div className="absolute top-4 left-4 z-20">
          <div className="glass px-4 py-2 rounded-lg">
            <h2 className="font-mono text-xs text-accent-purple tracking-wider">
              AERIAL SURVEILLANCE
            </h2>
            <p className="font-mono text-[10px] text-text-muted mt-0.5">
              Live flight tracking — OpenSky Network
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Flight Detail */}
      <div className="w-72 border-l border-glass-border overflow-y-auto p-4 space-y-3">
        {selectedFlight ? (
          <div className="stagger-children space-y-3">
            <GlassPanel title="FLIGHT DATA" titleColor="text-accent-purple" glowBorder>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 mb-3">
                  <Plane className="w-5 h-5 text-accent-purple" />
                  <span className="font-mono text-lg text-accent-purple font-bold">
                    {selectedFlight.callsign || selectedFlight.icao24}
                  </span>
                </div>
                <DetailRow label="ICAO24" value={selectedFlight.icao24} />
                <DetailRow label="Origin" value={selectedFlight.originCountry} />
                <DetailRow
                  label="Position"
                  value={`${selectedFlight.latitude?.toFixed(4)}°, ${selectedFlight.longitude?.toFixed(4)}°`}
                />
                <DetailRow
                  label="Altitude"
                  value={`${((selectedFlight.altitude || 0) / 1000).toFixed(1)}k ft`}
                />
                <DetailRow
                  label="Speed"
                  value={`${((selectedFlight.velocity || 0) * 3.6).toFixed(0)} km/h`}
                />
                <DetailRow
                  label="Heading"
                  value={`${(selectedFlight.heading || 0).toFixed(0)}°`}
                />
                <DetailRow
                  label="Vertical Rate"
                  value={`${(selectedFlight.verticalRate || 0).toFixed(1)} m/s`}
                />
                <DetailRow
                  label="On Ground"
                  value={selectedFlight.onGround ? 'YES' : 'NO'}
                />
              </div>
            </GlassPanel>

            <GlassPanel title="SIGNAL INTELLIGENCE" titleColor="text-accent-cyan" scanLine>
              <div className="font-mono text-[10px] text-text-muted leading-relaxed">
                <TypewriterText
                  text={`Tracking ${selectedFlight.callsign || selectedFlight.icao24} — ${selectedFlight.originCountry} origin. Aircraft maintaining ${((selectedFlight.altitude || 0) / 1000).toFixed(1)}k ft altitude at ${((selectedFlight.velocity || 0) * 3.6).toFixed(0)} km/h. Heading ${(selectedFlight.heading || 0).toFixed(0)}° — transponder active.`}
                  speed={15}
                />
              </div>
            </GlassPanel>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Eye className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
              <p className="text-xs text-text-muted font-mono">SELECT A FLIGHT</p>
              <p className="text-[10px] text-text-muted mt-1">
                Click a flight from the list to view details
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className="font-mono text-xs text-text-primary">{value}</span>
    </div>
  );
}

function addFlightLayers(map: mapboxgl.Map, flights: FlightState[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: flights
      .filter((f) => f.latitude && f.longitude)
      .map((f) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [f.longitude!, f.latitude!],
        },
        properties: {
          icao24: f.icao24,
          callsign: f.callsign || f.icao24,
          heading: f.heading || 0,
          altitude: f.altitude || 0,
          onGround: f.onGround,
        },
      })),
  };

  map.addSource('flights', { type: 'geojson', data: geojson });

  map.addLayer({
    id: 'flight-glow',
    type: 'circle',
    source: 'flights',
    paint: {
      'circle-radius': 10,
      'circle-color': '#a855f7',
      'circle-opacity': 0.15,
      'circle-blur': 1,
    },
  });

  map.addLayer({
    id: 'flight-points',
    type: 'circle',
    source: 'flights',
    paint: {
      'circle-radius': 4,
      'circle-color': ['case', ['get', 'onGround'], '#ffc107', '#a855f7'],
      'circle-opacity': 0.9,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#0a0e17',
    },
  });

  map.addLayer({
    id: 'flight-labels',
    type: 'symbol',
    source: 'flights',
    layout: {
      'text-field': ['get', 'callsign'],
      'text-size': 9,
      'text-offset': [0, 1.2],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
    },
    paint: {
      'text-color': '#a855f7',
      'text-halo-color': '#0a0e17',
      'text-halo-width': 1,
      'text-opacity': 0.7,
    },
  });
}
