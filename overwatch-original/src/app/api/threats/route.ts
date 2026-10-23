import { NextResponse } from 'next/server';
import { fetchRecentCves } from '@/lib/api/threats';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');

  const cves = await fetchRecentCves(limit);
  return NextResponse.json({ cves });
}
