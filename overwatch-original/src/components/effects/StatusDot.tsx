'use client';

type StatusColor = 'green' | 'cyan' | 'red' | 'yellow' | 'purple' | 'orange';

const colorMap: Record<StatusColor, string> = {
  green: 'bg-accent-green',
  cyan: 'bg-accent-cyan',
  red: 'bg-accent-red',
  yellow: 'bg-accent-yellow',
  purple: 'bg-accent-purple',
  orange: 'bg-accent-orange',
};

const glowMap: Record<StatusColor, string> = {
  green: 'shadow-[0_0_6px_rgba(0,255,136,0.6)]',
  cyan: 'shadow-[0_0_6px_rgba(0,240,255,0.6)]',
  red: 'shadow-[0_0_6px_rgba(255,51,102,0.6)]',
  yellow: 'shadow-[0_0_6px_rgba(255,193,7,0.6)]',
  purple: 'shadow-[0_0_6px_rgba(168,85,247,0.6)]',
  orange: 'shadow-[0_0_6px_rgba(255,107,53,0.6)]',
};

interface StatusDotProps {
  color?: StatusColor;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 'w-1.5 h-1.5', md: 'w-2 h-2', lg: 'w-3 h-3' };

export default function StatusDot({
  color = 'green',
  pulse = true,
  size = 'md',
  className = '',
}: StatusDotProps) {
  return (
    <div
      className={`rounded-full ${colorMap[color]} ${glowMap[color]} ${sizeMap[size]} ${
        pulse ? 'animate-pulse' : ''
      } ${className}`}
    />
  );
}
