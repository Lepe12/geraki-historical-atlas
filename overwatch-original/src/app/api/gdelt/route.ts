import { NextResponse } from 'next/server';
import { fetchGdeltArticles } from '@/lib/api/gdelt';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || 'cybersecurity OR geopolitical OR conflict';
  const limit = parseInt(searchParams.get('limit') || '25');

  const articles = await fetchGdeltArticles(query, limit);
  return NextResponse.json({ articles });
}
