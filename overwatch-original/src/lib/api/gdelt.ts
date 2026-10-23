export interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
  tone: number;
}

export interface GdeltResponse {
  articles: GdeltArticle[];
}

export async function fetchGdeltArticles(
  query: string = 'cybersecurity OR geopolitical OR military',
  maxRecords: number = 25,
  mode: string = 'ArtList'
): Promise<GdeltArticle[]> {
  const params = new URLSearchParams({
    query: query,
    mode,
    maxrecords: String(maxRecords),
    format: 'json',
    sort: 'DateDesc',
  });

  const res = await fetch(
    `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
    { next: { revalidate: 300 } }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return data.articles || [];
}

export async function fetchGdeltGeoEvents(
  query: string = 'conflict OR protest OR military'
): Promise<GdeltArticle[]> {
  const params = new URLSearchParams({
    query: query,
    mode: 'ArtList',
    maxrecords: '50',
    format: 'json',
    sort: 'DateDesc',
  });

  const res = await fetch(
    `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
    { next: { revalidate: 300 } }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return data.articles || [];
}
