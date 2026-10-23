export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
}

// Use GDELT as primary (no key needed), NewsAPI as fallback (key needed)
export async function fetchNews(
  query: string = 'cybersecurity geopolitical military intelligence',
  limit: number = 20
): Promise<NewsArticle[]> {
  // Try GDELT first (no API key needed)
  try {
    const params = new URLSearchParams({
      query: query,
      mode: 'ArtList',
      maxrecords: String(limit),
      format: 'json',
      sort: 'DateDesc',
    });

    const res = await fetch(
      `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
      { next: { revalidate: 300 } }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.articles?.length) {
        return data.articles.map((a: Record<string, string>) => ({
          title: a.title || 'Untitled',
          description: '',
          url: a.url,
          source: a.domain || 'Unknown',
          publishedAt: a.seendate || new Date().toISOString(),
          imageUrl: a.socialimage || undefined,
        }));
      }
    }
  } catch {
    // Fall through to NewsAPI
  }

  // Try NewsAPI (needs key)
  const newsApiKey = process.env.NEWSAPI_KEY;
  if (newsApiKey) {
    try {
      const params = new URLSearchParams({
        q: query,
        pageSize: String(limit),
        language: 'en',
        sortBy: 'publishedAt',
        apiKey: newsApiKey,
      });

      const res = await fetch(`https://newsapi.org/v2/everything?${params}`);
      if (res.ok) {
        const data = await res.json();
        return (data.articles || []).map((a: Record<string, unknown>) => ({
          title: a.title as string,
          description: (a.description as string) || '',
          url: a.url as string,
          source: (a.source as { name: string })?.name || 'Unknown',
          publishedAt: a.publishedAt as string,
          imageUrl: (a.urlToImage as string) || undefined,
        }));
      }
    } catch {
      // Fall through
    }
  }

  return [];
}
