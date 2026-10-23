import { NextResponse } from 'next/server';
import { fetchNews } from '@/lib/api/news';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || 'cybersecurity geopolitical military intelligence';
  const limit = parseInt(searchParams.get('limit') || '20');

  const articles = await fetchNews(query, limit);
  return NextResponse.json({ articles });
}
