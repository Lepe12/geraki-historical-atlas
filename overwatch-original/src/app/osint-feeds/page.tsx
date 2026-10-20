'use client';

import { useState } from 'react';
import GlassPanel from '@/components/layout/GlassPanel';
import StatusDot from '@/components/effects/StatusDot';
import TypewriterText from '@/components/effects/TypewriterText';
import { useNews, useGdeltArticles } from '@/hooks/useApiData';
import { Rss, Search, Filter, Globe, Clock, ExternalLink, TrendingUp } from 'lucide-react';

const categories = [
  { id: 'all', label: 'ALL FEEDS', query: 'cybersecurity geopolitical military intelligence' },
  { id: 'cyber', label: 'CYBER', query: 'cybersecurity hacking data breach ransomware' },
  { id: 'geo', label: 'GEOPOLITICAL', query: 'geopolitical conflict military diplomacy' },
  { id: 'intel', label: 'INTELLIGENCE', query: 'intelligence espionage surveillance' },
  { id: 'tech', label: 'TECHNOLOGY', query: 'artificial intelligence technology infrastructure' },
  { id: 'finance', label: 'ECONOMIC', query: 'economic sanctions trade finance' },
];

export default function OsintFeedsPage() {
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: articles = [], isLoading } = useGdeltArticles(
    searchQuery || activeCategory.query
  );

  return (
    <div className="h-full flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-glass-border bg-bg-secondary/30">
        <div className="flex items-center gap-2">
          <Rss className="w-4 h-4 text-accent-cyan" />
          <span className="font-mono text-xs font-semibold text-accent-cyan tracking-wider">
            OSINT FEEDS
          </span>
        </div>
        <div className="h-4 w-px bg-glass-border" />

        {/* Category Tabs */}
        <div className="flex items-center gap-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat);
                setSearchQuery('');
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-mono transition-all ${
                activeCategory.id === cat.id
                  ? 'bg-accent-cyan/20 text-accent-cyan'
                  : 'text-text-muted hover:bg-white/5 hover:text-text-primary'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="ml-auto flex items-center gap-2 glass px-3 py-1 rounded-lg w-64">
          <Search className="w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search intelligence..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none flex-1 font-mono"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Feed */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-pulse mb-3">
                  <Rss className="w-8 h-8 text-accent-cyan mx-auto" />
                </div>
                <TypewriterText
                  text="ACQUIRING INTEL FEEDS..."
                  speed={30}
                  className="text-xs text-text-muted"
                />
              </div>
            </div>
          ) : articles.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Globe className="w-8 h-8 text-text-muted/30 mx-auto mb-3" />
                <p className="font-mono text-xs text-text-muted">NO ARTICLES FOUND</p>
                <p className="text-[10px] text-text-muted mt-1">Try a different search query</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 stagger-children">
              {articles.map((article, i) => (
                <div
                  key={i}
                  className="glass rounded-lg overflow-hidden glass-hover transition-all duration-300 group"
                >
                  {article.socialimage && (
                    <div className="h-32 bg-bg-tertiary overflow-hidden">
                      <img
                        src={article.socialimage}
                        alt=""
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusDot
                        color={i < 3 ? 'red' : i < 8 ? 'yellow' : 'green'}
                        size="sm"
                        pulse={i < 2}
                      />
                      <span className="font-mono text-[9px] text-accent-cyan uppercase">
                        {article.domain}
                      </span>
                      <span className="text-[9px] text-text-muted">
                        {article.sourcecountry || 'INT'}
                      </span>
                    </div>
                    <h3 className="text-xs text-text-primary leading-relaxed line-clamp-2 group-hover:text-accent-cyan transition-colors">
                      {article.title}
                    </h3>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5 text-[9px] text-text-muted">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDate(article.seendate)}
                      </div>
                      {article.tone !== undefined && (
                        <span
                          className={`font-mono text-[9px] ${
                            article.tone < -2
                              ? 'text-accent-red'
                              : article.tone > 2
                              ? 'text-accent-green'
                              : 'text-accent-yellow'
                          }`}
                        >
                          TONE: {Number(article.tone).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar - Stats */}
        <div className="w-64 border-l border-glass-border p-4 overflow-y-auto space-y-3 stagger-children">
          <GlassPanel title="FEED STATS" titleColor="text-accent-cyan">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Articles</span>
                <span className="font-mono text-xs text-accent-cyan font-bold">
                  {articles.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Sources</span>
                <span className="font-mono text-xs text-accent-cyan font-bold">
                  {new Set(articles.map((a) => a.domain)).size}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Countries</span>
                <span className="font-mono text-xs text-accent-cyan font-bold">
                  {new Set(articles.map((a) => a.sourcecountry).filter(Boolean)).size}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Avg Tone</span>
                <span
                  className={`font-mono text-xs font-bold ${
                    articles.length > 0
                      ? articles.reduce((s, a) => s + (a.tone || 0), 0) / articles.length < 0
                        ? 'text-accent-red'
                        : 'text-accent-green'
                      : 'text-text-muted'
                  }`}
                >
                  {articles.length > 0
                    ? (articles.reduce((s, a) => s + (a.tone || 0), 0) / articles.length).toFixed(2)
                    : 'N/A'}
                </span>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel title="TOP SOURCES" titleColor="text-accent-green">
            <div className="space-y-1.5">
              {Object.entries(
                articles.reduce((acc, a) => {
                  acc[a.domain] = (acc[a.domain] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              )
                .sort(([, a], [, b]) => b - a)
                .slice(0, 8)
                .map(([domain, count]) => (
                  <div key={domain} className="flex items-center justify-between py-0.5">
                    <span className="text-[10px] text-text-muted truncate flex-1 mr-2">
                      {domain}
                    </span>
                    <span className="font-mono text-[10px] text-accent-green">{count}</span>
                  </div>
                ))}
            </div>
          </GlassPanel>

          <GlassPanel title="LANGUAGES" titleColor="text-accent-purple">
            <div className="space-y-1.5">
              {Object.entries(
                articles.reduce((acc, a) => {
                  const lang = a.language || 'unknown';
                  acc[lang] = (acc[lang] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              )
                .sort(([, a], [, b]) => b - a)
                .slice(0, 6)
                .map(([lang, count]) => (
                  <div key={lang} className="flex items-center justify-between py-0.5">
                    <span className="text-[10px] text-text-muted uppercase">{lang}</span>
                    <span className="font-mono text-[10px] text-accent-purple">{count}</span>
                  </div>
                ))}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    // GDELT dates come as "20260118T123456Z" format
    const d = new Date(
      dateStr.length === 15
        ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(9, 11)}:${dateStr.slice(11, 13)}:${dateStr.slice(13, 15)}Z`
        : dateStr
    );
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}
