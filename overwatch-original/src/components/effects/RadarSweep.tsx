'use client';

interface RadarSweepProps {
  size?: number;
  className?: string;
  color?: string;
  active?: boolean;
}

export default function RadarSweep({
  size = 300,
  className = '',
  color = 'rgba(0, 255, 136, 0.15)',
  active = true,
}: RadarSweepProps) {
  if (!active) return null;

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Radar rings */}
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <div
          key={scale}
          className="absolute rounded-full border border-accent-green/10"
          style={{
            width: size * scale,
            height: size * scale,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}

      {/* Cross lines */}
      <div className="absolute top-0 left-1/2 w-px h-full bg-accent-green/10" />
      <div className="absolute top-1/2 left-0 h-px w-full bg-accent-green/10" />

      {/* Sweep */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, ${color} 30deg, transparent 60deg)`,
          animation: active ? 'radarSweep 4s linear infinite' : 'none',
        }}
      />

      {/* Center dot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent-green" />
    </div>
  );
}
