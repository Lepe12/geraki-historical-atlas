'use client';

import { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapContainerProps {
  center?: [number, number];
  zoom?: number;
  style?: 'dark' | 'satellite';
  className?: string;
  onMapLoad?: (map: mapboxgl.Map) => void;
  interactive?: boolean;
  children?: React.ReactNode;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const styleUrls = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export default function MapContainer({
  center = [-122.4194, 37.7749],
  zoom = 12,
  style = 'dark',
  className = '',
  onMapLoad,
  interactive = true,
}: MapContainerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [noToken, setNoToken] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;

    if (!MAPBOX_TOKEN) {
      setNoToken(true);
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: styleUrls[style],
      center,
      zoom,
      interactive,
      attributionControl: true,
      antialias: true,
    });

    map.current.on('load', () => {
      if (map.current) {
        onMapLoad?.(map.current);
      }
    });

    return () => {
      map.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  if (noToken) {
    return (
      <div className={`relative bg-bg-secondary flex items-center justify-center ${className}`}>
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-cyan/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-accent-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <h3 className="font-mono text-accent-cyan text-sm mb-2">MAPBOX TOKEN REQUIRED</h3>
          <p className="text-text-muted text-xs leading-relaxed">
            Add your free Mapbox token to <code className="text-accent-cyan">.env.local</code>
          </p>
          <p className="text-text-muted text-xs mt-2">
            NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
          </p>
          <FallbackMap />
        </div>
      </div>
    );
  }

  return (
    <div ref={mapContainer} className={`relative ${className}`} />
  );
}

function FallbackMap() {
  return (
    <div className="mt-6 w-full h-48 relative overflow-hidden rounded-lg border border-glass-border">
      {/* Simple SVG world map outline */}
      <svg viewBox="0 0 800 400" className="w-full h-full opacity-20">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,240,255,0.1)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="800" height="400" fill="url(#grid)" />
        {/* Simplified continent outlines */}
        <ellipse cx="200" cy="180" rx="80" ry="60" fill="none" stroke="rgba(0,240,255,0.3)" strokeWidth="1" />
        <ellipse cx="420" cy="160" rx="60" ry="70" fill="none" stroke="rgba(0,240,255,0.3)" strokeWidth="1" />
        <ellipse cx="480" cy="250" rx="40" ry="50" fill="none" stroke="rgba(0,240,255,0.3)" strokeWidth="1" />
        <ellipse cx="600" cy="180" rx="70" ry="60" fill="none" stroke="rgba(0,240,255,0.3)" strokeWidth="1" />
        <ellipse cx="680" cy="300" rx="40" ry="30" fill="none" stroke="rgba(0,240,255,0.3)" strokeWidth="1" />
      </svg>
      {/* Animated dots */}
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-accent-cyan/50 animate-pulse"
          style={{
            top: `${20 + Math.random() * 60}%`,
            left: `${10 + Math.random() * 80}%`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}
