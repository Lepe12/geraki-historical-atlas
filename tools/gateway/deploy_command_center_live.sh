#!/bin/sh
set -eu
ROOT="${1:-/var/www/vhosts/piratecartography.com/piratecartography-gateway}"
APP="$ROOT/server/command-center-live"
[ -f "$APP/app.js" ] || { echo "BLOCKED: app.js missing" >&2; exit 1; }
[ -f "$APP/package.json" ] || { echo "BLOCKED: package.json missing" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "BLOCKED: Node.js not available in deployment shell" >&2; exit 1; }
node "$APP/self-test.js"
echo "PASS: Command Center live service code is ready."
echo "Plesk Node.js application root: $APP"
echo "Startup file: app.js"
echo "Application URL should be mounted at /pct-api/live"
echo "The service binds 127.0.0.1:$PORT supplied by Plesk/Passenger."
