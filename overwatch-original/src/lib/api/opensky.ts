export interface FlightState {
  icao24: string;
  callsign: string | null;
  originCountry: string;
  longitude: number | null;
  latitude: number | null;
  altitude: number | null;
  velocity: number | null;
  heading: number | null;
  verticalRate: number | null;
  onGround: boolean;
}

export async function fetchFlights(
  bounds?: { lamin: number; lomin: number; lamax: number; lomax: number }
): Promise<FlightState[]> {
  let url = 'https://opensky-network.org/api/states/all';

  if (bounds) {
    const params = new URLSearchParams({
      lamin: String(bounds.lamin),
      lomin: String(bounds.lomin),
      lamax: String(bounds.lamax),
      lomax: String(bounds.lomax),
    });
    url += `?${params}`;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 10 } });
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.states) return [];

    return data.states.slice(0, 100).map((s: unknown[]) => ({
      icao24: s[0] as string,
      callsign: (s[1] as string)?.trim() || null,
      originCountry: s[2] as string,
      longitude: s[5] as number | null,
      latitude: s[6] as number | null,
      altitude: s[7] as number | null,
      velocity: s[9] as number | null,
      heading: s[10] as number | null,
      verticalRate: s[11] as number | null,
      onGround: s[8] as boolean,
    }));
  } catch {
    return [];
  }
}
