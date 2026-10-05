# GERAKI Historical Atlas

Static interactive map generated from the live Airtable tables:

- `PLACES — Historical Atlas`
- `ROUTES — Historical Atlas`

## Data integrity rules

- No automatic geocoding.
- No coordinate replacement.
- Missing information stays unavailable.
- Route lines are schematic straight connections between stored Airtable nodes; they are not asserted historical tracks.
- Planned/not-executed, intelligence/network, and reconstructed routes are visually distinct from depicted travel.

## Run

Serve the `atlas/` directory with any static web server, or deploy it with GitHub Pages.

The map uses Leaflet and OpenStreetMap tiles at runtime.
