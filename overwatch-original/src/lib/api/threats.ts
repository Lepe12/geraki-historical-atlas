export interface CveItem {
  id: string;
  description: string;
  published: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  score: number;
}

export async function fetchRecentCves(limit: number = 20): Promise<CveItem[]> {
  try {
    const res = await fetch(
      `https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=${limit}`,
      { next: { revalidate: 120 } }
    );

    if (!res.ok) return [];

    const data = await res.json();

    return (data.vulnerabilities || []).map((v: Record<string, unknown>) => {
      const cve = v.cve as Record<string, unknown>;
      const descriptions = cve.descriptions as { lang: string; value: string }[];
      const metrics = cve.metrics as Record<string, unknown>;
      const desc = descriptions?.find((d) => d.lang === 'en')?.value || '';

      let severity: CveItem['severity'] = 'MEDIUM';
      let score = 5.0;

      // Try CVSS v3.1
      const cvssV31 = metrics?.cvssMetricV31 as Array<{ cvssData: { baseScore: number; baseSeverity: string } }>;
      if (cvssV31?.[0]) {
        score = cvssV31[0].cvssData.baseScore;
        severity = cvssV31[0].cvssData.baseSeverity as CveItem['severity'];
      }

      return {
        id: cve.id as string,
        description: desc.slice(0, 200),
        published: cve.published as string,
        severity,
        score,
      };
    });
  } catch {
    return [];
  }
}

export interface ThreatEvent {
  id: string;
  type: 'malware' | 'phishing' | 'ddos' | 'ransomware' | 'apt' | 'exploit';
  lat: number;
  lng: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: string;
  source: string;
}

// Descriptions keyed by threat type for realistic event generation
const threatDescriptions: Record<ThreatEvent['type'], string[]> = {
  malware: [
    'Trojan dropper identified exfiltrating credentials via HTTPS beaconing',
    'Polymorphic loader detected injecting into svchost.exe process tree',
    'Info-stealer variant harvesting browser cookies and crypto wallets',
    'Fileless malware executing PowerShell payload from registry key',
    'Worm propagation detected via SMB lateral movement on port 445',
  ],
  phishing: [
    'Credential phishing campaign impersonating cloud provider login portal',
    'Spear-phishing email with macro-enabled document targeting finance dept',
    'BEC attack spoofing C-suite executive requesting wire transfer',
    'SMS phishing (smishing) delivering fake banking app link',
    'OAuth consent phishing attempting mailbox access delegation',
  ],
  ddos: [
    'Volumetric UDP flood exceeding 50 Gbps against edge infrastructure',
    'HTTP/2 rapid-reset attack targeting application layer endpoints',
    'DNS amplification attack leveraging open resolvers as reflectors',
    'SYN flood detected from botnet across 12k unique source IPs',
    'Carpet-bombing DDoS spreading traffic across entire /24 prefix',
  ],
  ransomware: [
    'LockBit variant encrypting network shares with .locked extension',
    'Double-extortion ransomware exfiltrating data before encryption',
    'RaaS affiliate deploying via compromised RDP with valid credentials',
    'Ransomware pre-positioning: shadow copy deletion and backup wipe',
    'Encryptor binary staged via Group Policy Object across domain',
  ],
  apt: [
    'Advanced persistent threat establishing C2 via DNS-over-HTTPS tunneling',
    'Nation-state actor leveraging zero-day in edge appliance firmware',
    'Long-dwell intrusion detected — lateral movement over 90+ day period',
    'Supply-chain compromise injecting backdoor into signed software update',
    'APT group deploying custom implant with anti-forensics capabilities',
  ],
  exploit: [
    'Remote code execution attempt against unpatched Apache Struts endpoint',
    'SQL injection payload targeting authentication bypass on web portal',
    'Deserialization exploit chained with privilege escalation to SYSTEM',
    'Zero-day exploit targeting browser V8 engine sandbox escape',
    'SSRF exploitation pivoting from cloud metadata to internal services',
  ],
};

// Generate realistic-looking threat events for the world map
export function generateThreatEvents(count: number = 40): ThreatEvent[] {
  const types: ThreatEvent['type'][] = ['malware', 'phishing', 'ddos', 'ransomware', 'apt', 'exploit'];
  const severities: ThreatEvent['severity'][] = ['low', 'medium', 'high', 'critical'];
  const sources = ['OTX', 'NVD', 'AbuseIPDB', 'GDELT', 'VirusTotal', 'Shodan'];

  const hotZones = [
    { lat: 37.7749, lng: -122.4194, spread: 5, name: 'US-WEST' },
    { lat: 40.7128, lng: -74.006, spread: 3, name: 'US-EAST' },
    { lat: 51.5074, lng: -0.1278, spread: 4, name: 'UK' },
    { lat: 52.52, lng: 13.405, spread: 3, name: 'EU-CENTRAL' },
    { lat: 55.7558, lng: 37.6173, spread: 5, name: 'RU' },
    { lat: 39.9042, lng: 116.4074, spread: 5, name: 'CN' },
    { lat: 35.6762, lng: 139.6503, spread: 3, name: 'JP' },
    { lat: 1.3521, lng: 103.8198, spread: 2, name: 'SG' },
    { lat: -23.5505, lng: -46.6333, spread: 3, name: 'BR' },
    { lat: 25.2048, lng: 55.2708, spread: 2, name: 'AE' },
  ];

  return Array.from({ length: count }, (_, i) => {
    const zone = hotZones[Math.floor(Math.random() * hotZones.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const descs = threatDescriptions[type];
    return {
      id: `threat-${i}`,
      type,
      lat: zone.lat + (Math.random() - 0.5) * zone.spread * 2,
      lng: zone.lng + (Math.random() - 0.5) * zone.spread * 2,
      severity: severities[Math.floor(Math.random() * severities.length)],
      description: descs[Math.floor(Math.random() * descs.length)],
      timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      source: sources[Math.floor(Math.random() * sources.length)],
    };
  });
}
