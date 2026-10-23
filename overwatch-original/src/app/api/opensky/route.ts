import { NextResponse } from 'next/server';
import { fetchFlights } from '@/lib/api/opensky';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const bounds = searchParams.has('lamin')
    ? {
        lamin: parseFloat(searchParams.get('lamin')!),
        lomin: parseFloat(searchParams.get('lomin')!),
        lamax: parseFloat(searchParams.get('lamax')!),
        lomax: parseFloat(searchParams.get('lomax')!),
      }
    : undefined;

  const flights = await fetchFlights(bounds);
  return NextResponse.json({ flights });
}
