'use strict';
// Independent Plesk/Passenger Node readiness bootstrap for n7-agent only.
// This intentionally does not launch OpenClaw or expose its configuration.
const http = require('node:http');

const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    res.end(JSON.stringify({
      service: 'n7-agent-passenger-bootstrap',
      node: process.version,
      passengerResponsive: true,
      openclawGatewayRunning: false
    }));
    return;
  }
  res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
  res.end('{"error":"not_found"}');
});
server.listen(process.env.PORT || 3000, '0.0.0.0');
