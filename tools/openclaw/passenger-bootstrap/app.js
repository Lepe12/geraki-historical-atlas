'use strict';
// Plesk Passenger owns the public HTTP listener for the NEW agent subdomain only.
// The OpenClaw child, if available, stays on separate 127.0.0.1:19487.
const http = require('node:http');
const supervisor = require('./gateway-supervisor');

const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  if ((req.method === 'GET' || req.method === 'HEAD') &&
      (req.url === '/health' || req.url === '/')) {
    try {
      const data = await supervisor.status();
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(req.method === 'HEAD' ? '' : JSON.stringify(data));
    } catch {
      res.writeHead(503, {'Content-Type': 'application/json; charset=utf-8'});
      res.end('{"error":"health_unavailable"}');
    }
    return;
  }
  res.writeHead(404, {'Content-Type': 'application/json; charset=utf-8'});
  res.end('{"error":"not_found"}');
});

server.listen(process.env.PORT || 3000, '0.0.0.0');
void supervisor.start();
