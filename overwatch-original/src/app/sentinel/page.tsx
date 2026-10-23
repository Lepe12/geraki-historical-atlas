'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import GlassPanel from '@/components/layout/GlassPanel';
import RadarSweep from '@/components/effects/RadarSweep';
import TypewriterText from '@/components/effects/TypewriterText';
import StatusDot from '@/components/effects/StatusDot';
import { useSentinelStore, ScanRegion, SentinelReport } from '@/stores/sentinelStore';
import { useGdeltArticles } from '@/hooks/useApiData';
import {
  Radar,
  Globe,
  Shield,
  AlertTriangle,
  TrendingUp,
  Zap,
  MapPin,
  FileText,
} from 'lucide-react';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-bg-secondary animate-pulse flex items-center justify-center">
      <span className="font-mono text-xs text-text-muted">INITIALIZING SENTINEL...</span>
    </div>
  ),
});

const severityConfig = {
  low: { color: '#00ff88', label: 'LOW', bg: 'bg-accent-green/10' },
  medium: { color: '#ffc107', label: 'MEDIUM', bg: 'bg-accent-yellow/10' },
  high: { color: '#ff6b35', label: 'HIGH', bg: 'bg-accent-orange/10' },
  critical: { color: '#ff3366', label: 'CRITICAL', bg: 'bg-accent-red/10' },
};

// Keyword categories for article title analysis
const indicatorKeywords: Record<string, string[]> = {
  'Military Activity': ['military', 'army', 'troops', 'defense', 'weapons', 'missile', 'nato', 'navy', 'airforce', 'war'],
  'Cyber Operations': ['cyber', 'hack', 'breach', 'malware', 'ransomware', 'data leak', 'phishing', 'vulnerability'],
  'Political Stability': ['election', 'protest', 'government', 'coup', 'sanctions', 'diplomacy', 'political', 'opposition'],
  'Economic Indicators': ['economy', 'trade', 'tariff', 'inflation', 'market', 'gdp', 'recession', 'currency', 'oil'],
  'Social Unrest': ['protest', 'riot', 'strike', 'unrest', 'demonstration', 'violence', 'civilian', 'refugee'],
  'Infrastructure': ['infrastructure', 'power grid', 'pipeline', 'transport', 'supply chain', 'energy', 'dam', 'port'],
  'Maritime Activity': ['maritime', 'naval', 'shipping', 'strait', 'piracy', 'blockade', 'submarine', 'fleet'],
  'Border Security': ['border', 'migration', 'smuggling', 'trafficking', 'checkpoint', 'territorial', 'incursion'],
};

function generateSentinelReport(region: ScanRegion, articles: { title: string; domain: string; tone: number }[]): SentinelReport {
  const avgTone = articles.length > 0
    ? articles.reduce((sum, a) => sum + (a.tone || 0), 0) / articles.length
    : 0;
  const uniqueSources = new Set(articles.map((a) => a.domain)).size;

  // Derive threat level from article volume and sentiment
  let threatLevel: SentinelReport['threatLevel'] = 'low';
  if (articles.length >= 20 && avgTone < -3) threatLevel = 'critical';
  else if (articles.length >= 10 && avgTone < -1) threatLevel = 'high';
  else if (articles.length >= 5 || avgTone < 0) threatLevel = 'medium';

  // Score each indicator category by keyword hits in article titles
  const indicators = Object.entries(indicatorKeywords).map(([category, keywords]) => {
    const matchingArticles = articles.filter((a) =>
      keywords.some((kw) => a.title.toLowerCase().includes(kw))
    );
    const hits = matchingArticles.length;
    const catTone = matchingArticles.length > 0
      ? matchingArticles.reduce((s, a) => s + (a.tone || 0), 0) / matchingArticles.length
      : 0;

    // Score 0-100 based on hit ratio and negativity
    const hitScore = Math.min(100, (hits / Math.max(articles.length, 1)) * 200);
    const toneScore = Math.min(100, Math.max(0, (-catTone) * 10));
    const value = Math.round((hitScore * 0.6 + toneScore * 0.4));

    let level: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (value >= 70) level = 'critical';
    else if (value >= 45) level = 'high';
    else if (value >= 20) level = 'medium';

    return { category, level, description: `${category} assessment for ${region.name}`, value };
  }).sort((a, b) => b.value - a.value);

  const topIndicators = indicators.filter((i) => i.value > 0).slice(0, 5);
  const topConcerns = topIndicators.length > 0
    ? topIndicators.map((i) => i.category).join(', ')
    : 'No specific threat categories detected';

  const summaryLines = [
    `SENTINEL SCAN COMPLETE — ${region.name.toUpperCase()}`,
    ``,
    `THREAT ASSESSMENT: ${threatLevel.toUpperCase()}`,
    `Scan timestamp: ${new Date().toISOString()}`,
    ``,
    `REGIONAL ANALYSIS:`,
    `The ${region.name} sector shows ${threatLevel === 'critical' ? 'elevated' : threatLevel === 'high' ? 'notable' : threatLevel === 'medium' ? 'moderate' : 'baseline'} threat indicators.`,
    `Analysis based on ${articles.length} intelligence articles from ${uniqueSources} sources.`,
    ``,
    `KEY FINDINGS:`,
    `• Average sentiment tone: ${avgTone.toFixed(2)} ${avgTone < -2 ? '(HOSTILE)' : avgTone < 0 ? '(NEGATIVE)' : '(NEUTRAL)'}`,
    `• Article volume: ${articles.length} ${articles.length >= 15 ? '(HIGH)' : articles.length >= 5 ? '(MODERATE)' : '(LOW)'}`,
    `• Source diversity: ${uniqueSources} unique outlets`,
    `• Top concern areas: ${topConcerns}`,
    ``,
    `INTELLIGENCE SOURCES: ${articles.length} articles analyzed`,
  ];

  return {
    region: region.name,
    timestamp: new Date().toISOString(),
    threatLevel,
    summary: summaryLines.join('\n'),
    indicators,
    articles: articles.slice(0, 5).map((a) => ({
      title: a.title,
      source: a.domain,
      sentiment: a.tone || 0,
    })),
  };
}

export default function SentinelPage() {
  const {
    scanning,
    scanProgress,
    selectedRegion,
    currentReport,
    regions,
    startScan,
    setScanProgress,
    completeScan,
  } = useSentinelStore();

  const { data: articles = [] } = useGdeltArticles(
    selectedRegion ? `${selectedRegion.name} security threat` : undefined
  );

  const [displayedSummary, setDisplayedSummary] = useState('');

  // Simulate scan progress
  useEffect(() => {
    if (!scanning) return;

    const interval = setInterval(() => {
      setScanProgress(scanProgress + Math.random() * 8 + 2);

      if (scanProgress >= 100) {
        const report = generateSentinelReport(
          selectedRegion!,
          articles.map((a) => ({ title: a.title, domain: a.domain, tone: a.tone }))
        );
        completeScan(report);
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [scanning, scanProgress, selectedRegion, articles, setScanProgress, completeScan]);

  const handleStartScan = useCallback(
    (region: ScanRegion) => {
      setDisplayedSummary('');
      startScan(region);
    },
    [startScan]
  );

  return (
    <div className="h-full flex">
      {/* Left Panel - Region Selector */}
      <div className="w-64 border-r border-glass-border flex flex-col">
        <div className="px-4 py-3 border-b border-glass-border">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-accent-green" />
            <span className="font-mono text-xs font-semibold text-accent-green tracking-wider text-glow-green">
              SENTINEL CONTROL
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto stagger-children">
          <div className="px-3 py-2 border-b border-glass-border">
            <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">
              Select Region to Scan
            </span>
          </div>
          {regions.map((region) => (
            <button
              key={region.id}
              onClick={() => handleStartScan(region)}
              disabled={scanning}
              className={`w-full px-3 py-2.5 border-b border-glass-border text-left transition-all duration-200 hover:bg-accent-green/5 ${
                selectedRegion?.id === region.id
                  ? 'bg-accent-green/10 border-l-2 border-l-accent-green'
                  : ''
              } ${scanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs text-text-primary">{region.name}</span>
              </div>
              <span className="text-[10px] text-text-muted font-mono mt-0.5 block">
                {region.lat.toFixed(2)}°, {region.lng.toFixed(2)}°
              </span>
            </button>
          ))}
        </div>

        {/* Scan Status */}
        <div className="p-4 border-t border-glass-border">
          {scanning ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] text-accent-green animate-pulse">
                  SCANNING...
                </span>
                <span className="font-mono text-[10px] text-accent-green">
                  {Math.min(100, scanProgress).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-green rounded-full transition-all duration-200"
                  style={{ width: `${Math.min(100, scanProgress)}%` }}
                />
              </div>
            </div>
          ) : currentReport ? (
            <div className="flex items-center gap-2">
              <StatusDot color="green" size="sm" pulse={false} />
              <span className="font-mono text-[10px] text-accent-green">SCAN COMPLETE</span>
            </div>
          ) : (
            <span className="font-mono text-[10px] text-text-muted">READY TO SCAN</span>
          )}
        </div>
      </div>

      {/* Center - Map with Radar */}
      <div className="flex-1 relative">
        <MapContainer
          center={
            selectedRegion
              ? [selectedRegion.lng, selectedRegion.lat]
              : [0, 20]
          }
          zoom={selectedRegion?.zoom || 2}
          className="w-full h-full"
        />

        {/* Radar Sweep Overlay */}
        {scanning && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <RadarSweep size={400} active={scanning} />
          </div>
        )}

        {/* Scan Status Overlay */}
        <div className="absolute top-4 left-4 z-20">
          <div className="glass px-4 py-2 rounded-lg">
            <h2 className="font-mono text-xs text-accent-green tracking-wider text-glow-green">
              {scanning
                ? 'SENTINEL SCANNING...'
                : currentReport
                ? `SCAN COMPLETE — ${currentReport.region.toUpperCase()}`
                : 'SENTINEL READY'}
            </h2>
            {selectedRegion && (
              <p className="font-mono text-[10px] text-text-muted mt-0.5">
                Region: {selectedRegion.name} | {selectedRegion.lat.toFixed(4)}°, {selectedRegion.lng.toFixed(4)}°
              </p>
            )}
          </div>
        </div>

        {/* Report Overlay (Center Panel) */}
        {currentReport && !scanning && (
          <div className="absolute top-20 left-4 right-4 bottom-4 z-20 flex gap-4 pointer-events-none">
            <div className="flex-1 pointer-events-auto max-w-lg">
              <GlassPanel title="SENTINEL REPORT" titleColor="text-accent-green" scanLine glowBorder>
                <div className="max-h-[60vh] overflow-y-auto">
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="font-mono text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: `${severityConfig[currentReport.threatLevel].color}20`,
                        color: severityConfig[currentReport.threatLevel].color,
                      }}
                    >
                      THREAT LEVEL: {severityConfig[currentReport.threatLevel].label}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
                    <TypewriterText
                      text={currentReport.summary}
                      speed={10}
                    />
                  </div>
                </div>
              </GlassPanel>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Indicators */}
      <div className="w-72 border-l border-glass-border overflow-y-auto stagger-children p-4 space-y-3">
        {currentReport ? (
          <>
            <GlassPanel title="THREAT INDICATORS" titleColor="text-accent-cyan">
              <div className="space-y-2">
                {currentReport.indicators.map((ind, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-glass-border last:border-0">
                    <span className="text-[10px] text-text-primary">{ind.category}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{
                            width: `${ind.value}%`,
                            backgroundColor: severityConfig[ind.level].color,
                          }}
                        />
                      </div>
                      <span
                        className="font-mono text-[10px] w-7 text-right"
                        style={{ color: severityConfig[ind.level].color }}
                      >
                        {ind.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>

            <GlassPanel title="INTEL SOURCES" titleColor="text-accent-purple" scanLine>
              <div className="space-y-2">
                {currentReport.articles.map((article, i) => (
                  <div key={i} className="pb-2 border-b border-glass-border last:border-0">
                    <p className="text-[10px] text-text-primary leading-relaxed line-clamp-2">
                      {article.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[9px] text-accent-cyan">
                        {article.source}
                      </span>
                      <span
                        className={`font-mono text-[9px] ${
                          article.sentiment < -2
                            ? 'text-accent-red'
                            : article.sentiment > 2
                            ? 'text-accent-green'
                            : 'text-accent-yellow'
                        }`}
                      >
                        TONE: {article.sentiment.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Radar className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
              <p className="text-xs text-text-muted font-mono">SELECT A REGION</p>
              <p className="text-[10px] text-text-muted mt-1">
                Choose a region to begin sentinel scan
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
