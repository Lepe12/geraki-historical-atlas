<div align="center">

```
 ██████  ██    ██ ███████ ██████  ██     ██  █████  ████████  ██████ ██   ██
██    ██ ██    ██ ██      ██   ██ ██     ██ ██   ██    ██    ██      ██   ██
██    ██ ██    ██ █████   ██████  ██  █  ██ ███████    ██    ██      ███████
██    ██  ██  ██  ██      ██   ██ ██ ███ ██ ██   ██    ██    ██      ██   ██
 ██████    ████   ███████ ██   ██  ███ ███  ██   ██    ██     ██████ ██   ██
```

### Operational Vigilance & Electronic Reconnaissance

**Real-time geospatial intelligence & cyber threat monitoring dashboard**

<br />

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Mapbox GL](https://img.shields.io/badge/Mapbox_GL-3-000?style=for-the-badge&logo=mapbox&logoColor=white)](https://www.mapbox.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-00ff88?style=for-the-badge)](LICENSE)

<br />

[Features](#features) · [Screenshots](#screenshots) · [Getting Started](#getting-started) · [Support This Project](#-support-this-project)

</div>

---

> **OVERWATCH** is a real-time geospatial intelligence platform that fuses live cyber threat data, flight surveillance, OSINT feeds, and regional security scanning into a single unified command dashboard. Powered by bleeding-edge web technologies with a dark cyberpunk aesthetic — glassmorphism panels, particle effects, radar sweeps, and neon-lit data streams.

---

## Screenshots

<div align="center">

<img src="docs/screenshots/dashboard-overview.png" alt="OVERWATCH Dashboard" width="100%" />

<p><em>Global Threat Overview — Live map with threat markers, sector trends, and intelligence feed</em></p>

<br />

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/geo-tracking.png" alt="Geo Tracking" width="100%" />
<p align="center"><strong>Geo Tracking</strong><br /><sub>Real-time target surveillance with trail visualization</sub></p>
</td>
<td width="50%">
<img src="docs/screenshots/surveillance-satellite.png" alt="Surveillance" width="100%" />
<p align="center"><strong>Aerial Surveillance</strong><br /><sub>Live flight tracking via OpenSky Network</sub></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/sentinel-scan-western-europe.png" alt="Sentinel Scan" width="100%" />
<p align="center"><strong>Sentinel Scan</strong><br /><sub>Regional security analysis with radar sweep</sub></p>
</td>
<td width="50%">
<img src="docs/screenshots/sentinel-scan-northern-europe.png" alt="Sentinel Report" width="100%" />
<p align="center"><strong>Intelligence Report</strong><br /><sub>Typewriter-animated threat assessments</sub></p>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/cyber-threats.png" alt="Cyber Threats" width="100%" />
<p align="center"><strong>Cyber Threats</strong><br /><sub>Live CVE tracking from the National Vulnerability Database</sub></p>
</td>
<td width="50%">
<img src="docs/screenshots/osint-feeds.png" alt="OSINT Feeds" width="100%" />
<p align="center"><strong>OSINT Feeds</strong><br /><sub>Real-time geopolitical intelligence from GDELT</sub></p>
</td>
</tr>
</table>

</div>

## Features

### Command Modules

| Module | Description |
|--------|-------------|
| **Dashboard** | Global threat overview with interactive Mapbox map, live threat markers color-coded by severity, real-time intel feed, sector trend analysis, and system status monitoring |
| **Cyber Threats** | CVE/vulnerability tracking from the National Vulnerability Database with CVSS scoring, severity filtering, and threat heatmap visualization |
| **Geo Tracking** | Real-time target tracking with animated trail lines, target classification (friendly / hostile / neutral / unknown), heading & speed telemetry, and fly-to-target navigation |
| **OSINT Feeds** | Geopolitical intelligence aggregation from GDELT with category filtering, sentiment tone analysis, and source statistics |
| **Sentinel Scan** | Regional security analysis with animated radar sweep, generated threat assessments, multi-domain indicators, and typewriter-animated intelligence reports |
| **Surveillance** | Live flight tracking via OpenSky Network with satellite/dark map toggle, altitude & speed telemetry, and click-to-track interaction |

### Visual & Technical Highlights

- **Glassmorphism UI** — Frosted glass panels with backdrop blur and subtle glow borders
- **Particle System** — Canvas-rendered floating particles with proximity connection lines
- **Radar Sweep** — CSS conic-gradient radar animation for Sentinel scans
- **Scan Line Effects** — Animated horizontal scan lines across intelligence panels
- **Typewriter Text** — Character-by-character rendering for intelligence reports
- **Animated Counters** — Smooth count-up animations for all numeric displays
- **Real-time Data** — TanStack Query with configurable refetch intervals (10s – 5min)
- **Staggered Animations** — Cascading fade-in-up transitions across the UI

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | [Next.js](https://nextjs.org/) (App Router) | 16 |
| **UI Library** | [React](https://react.dev/) | 19 |
| **Language** | [TypeScript](https://typescriptlang.org/) | 5 |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | 4 |
| **Maps** | [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) | 3 |
| **Animation** | [Framer Motion](https://motion.dev/) | 12 |
| **State** | [Zustand](https://zustand.docs.pmnd.rs/) | 5 |
| **Data Fetching** | [TanStack Query](https://tanstack.com/query/) | 5 |
| **Geospatial** | [Turf.js](https://turfjs.org/) | 7 |
| **Icons** | [Lucide React](https://lucide.dev/) | 0.563 |

### Live Data Sources

| Source | Type | Key Required? |
|--------|------|---------------|
| [NVD / NIST](https://nvd.nist.gov/) | CVE Vulnerabilities | No (public API) |
| [GDELT Project](https://www.gdeltproject.org/) | Geopolitical Intelligence | No (public API) |
| [OpenSky Network](https://opensky-network.org/) | Flight Tracking | No (public API) |
| [Mapbox](https://www.mapbox.com/) | Map Tiles | Yes (free tier: 50k loads/mo) |

## Architecture

```
src/
├── app/                        # Next.js App Router
│   ├── api/                    # API proxy endpoints
│   │   ├── gdelt/              #   GDELT article aggregation
│   │   ├── news/               #   News feed proxy
│   │   ├── opensky/            #   Flight data proxy
│   │   └── threats/            #   NVD CVE data proxy
│   ├── cyber-threats/          # CVE tracking page
│   ├── geo-tracking/           # Target tracking page
│   ├── osint-feeds/            # OSINT intelligence page
│   ├── sentinel/               # Regional scan page
│   ├── surveillance/           # Flight surveillance page
│   ├── layout.tsx              # Root layout (sidebar + topbar)
│   └── page.tsx                # Main dashboard
├── components/
│   ├── effects/                # Visual effects
│   │   ├── CountUp.tsx         #   Animated number counter
│   │   ├── ParticleField.tsx   #   Canvas particle system
│   │   ├── RadarSweep.tsx      #   Radar animation
│   │   ├── StatusDot.tsx       #   Pulsing status indicator
│   │   └── TypewriterText.tsx  #   Character-by-character text
│   ├── layout/                 # Layout components
│   │   ├── GlassPanel.tsx      #   Glassmorphism container
│   │   ├── Sidebar.tsx         #   Navigation sidebar
│   │   └── Topbar.tsx          #   Status bar header
│   └── map/
│       └── MapContainer.tsx    # Mapbox GL wrapper
├── hooks/
│   └── useApiData.ts           # TanStack Query hooks
├── lib/api/                    # API client functions
│   ├── gdelt.ts                #   GDELT client
│   ├── news.ts                 #   News aggregation
│   ├── opensky.ts              #   OpenSky client
│   └── threats.ts              #   NVD + threat generation
└── stores/                     # Zustand state stores
    ├── mapStore.ts             #   Map viewport & style
    ├── sentinelStore.ts        #   Sentinel scan state
    ├── trackingStore.ts        #   Geo tracking targets
    └── uiStore.ts              #   UI state (sidebar, etc.)
```

## Getting Started

### Prerequisites

- **Node.js** 18.17 or later
- A free [Mapbox access token](https://account.mapbox.com/access-tokens/)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/deegan4/overwatch.git
   cd overwatch
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.local.example .env.local
   ```

   Add your Mapbox token to `.env.local`:

   ```env
   NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
   ```

4. **Start the dev server**

   ```bash
   npm run dev
   ```

5. **Open** [http://localhost:3000](http://localhost:3000)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | **Yes** | Mapbox GL access token ([get one free](https://account.mapbox.com/access-tokens/)) |
| `NEWSAPI_KEY` | No | NewsAPI key for enhanced news feeds ([register](https://newsapi.org/register)) |
| `OTX_API_KEY` | No | AlienVault OTX key for threat intelligence |
| `ABUSEIPDB_KEY` | No | AbuseIPDB key for IP reputation data |

---

<div align="center">

## ☕ Support This Project

**OVERWATCH is free, open-source, and built with passion.**

If this project is useful to you or you just think it's cool,<br />
consider buying me a coffee to support continued development.

<br />

[![Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-Support_OVERWATCH-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/deegan4)

<br />

</div>

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Built by [deegan4](https://github.com/deegan4)**

<sub>OVERWATCH — Operational Vigilance & Electronic Reconnaissance</sub>

</div>
