#!/bin/sh
# Execute from the authenticated Plesk subscription shell/scheduled task.
# Deploy exactly the reviewed PR #54 code, without touching uploaded PDFs.
set -eu
COMMIT=29387a10aa60ae34170acb551525ba63f829338b
APP="${PCT_APP_ROOT:-/var/www/vhosts/piratecartography.com/piratecartography-gateway/server/command-center-live}"
BASE="https://raw.githubusercontent.com/Lepe12/geraki-historical-atlas/$COMMIT/server/command-center-live"
if [ ! -f "$APP/app.js" ] || [ ! -f "$APP/package.json" ]; then
  echo "BLOCKED: PCT_APP_ROOT is not the live Node application root" >&2; exit 1
fi
NODE="${PCT_NODE_BIN:-/opt/plesk/node/24/bin/node}"
if [ ! -x "$NODE" ]; then NODE="$(command -v node)"; fi
TMP="$(mktemp -d "$APP/.nabou-evidence-deploy.XXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
for file in historical-evidence.js app.js; do
  curl --fail --location --silent --show-error --max-time 30 "$BASE/$file" --output "$TMP/$file"
  "$NODE" --check "$TMP/$file"
done
BACKUP="$APP/.deployment-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP"
cp "$APP/app.js" "$BACKUP/app.js"
if [ -f "$APP/historical-evidence.js" ]; then cp "$APP/historical-evidence.js" "$BACKUP/historical-evidence.js"; fi
cp "$TMP/historical-evidence.js" "$APP/historical-evidence.js"
cp "$TMP/app.js" "$APP/app.js"
if ! "$NODE" "$APP/self-test.js"; then
  cp "$BACKUP/app.js" "$APP/app.js"
  if [ -f "$BACKUP/historical-evidence.js" ]; then
    cp "$BACKUP/historical-evidence.js" "$APP/historical-evidence.js"
  else
    rm -f "$APP/historical-evidence.js"
  fi
  echo "ROLLED_BACK: self-test failed" >&2
  exit 1
fi
mkdir -p "$APP/tmp"
touch "$APP/tmp/restart.txt"
echo "FILES_UPDATED: $COMMIT"
echo "BACKUP_DIRECTORY: $BACKUP"
echo "PASSENGER_RESTART_REQUESTED"
echo "Verify new endpoints using the GitHub NABOU Historical Evidence Production Smoke workflow."
