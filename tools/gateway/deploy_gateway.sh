#!/bin/sh
# Piratecartography: publish ONLY the reviewed read-only PHP gateway.
# Intended for Plesk Git additional deployment actions after repository
# checkout to a directory OUTSIDE httpdocs. No credentials in this script.
set -eu
SOURCE_ROOT="${1:?Usage: deploy_gateway.sh /absolute/path/to/checked-out/repo}"
VHOST="/var/www/vhosts/piratecartography.com"
SOURCE="$SOURCE_ROOT/tools/gateway/pct-staging-gateway.php"
DEST_DIR="$VHOST/httpdocs/pct-api"
DEST="$DEST_DIR/pct-staging-gateway.php"
PRIVATE="$VHOST/piratecartography-system"
case "$SOURCE_ROOT" in
  "$VHOST"/*) ;;
  *) echo "BLOCKED: source is outside expected vhost" >&2; exit 1 ;;
esac
case "$SOURCE_ROOT" in
  "$VHOST/httpdocs"|"$VHOST/httpdocs/"*) echo "BLOCKED: Git checkout must remain outside httpdocs" >&2; exit 1 ;;
esac
[ -f "$SOURCE" ] || { echo "BLOCKED: missing gateway source" >&2; exit 1; }
[ -f "$PRIVATE/pct_db_config.php" ] || { echo "BLOCKED: missing private DB config" >&2; exit 1; }
[ -f "$PRIVATE/pct_gateway_secret.php" ] || { echo "BLOCKED: missing private secret loader" >&2; exit 1; }
[ -d "$DEST_DIR" ] || { echo "BLOCKED: pct-api directory not found" >&2; exit 1; }
[ ! -L "$DEST_DIR" ] || { echo "BLOCKED: pct-api is a symlink" >&2; exit 1; }
[ ! -L "$DEST" ] || { echo "BLOCKED: gateway destination is a symlink" >&2; exit 1; }
php -l "$SOURCE" >/dev/null || { echo "BLOCKED: PHP syntax invalid" >&2; exit 1; }
# Atomic replace in the same directory. No other public files are touched.
TMP="$(mktemp "$DEST_DIR/.pct-gateway.XXXXXXXX")"
trap 'rm -f "$TMP"' EXIT HUP INT TERM
cat "$SOURCE" > "$TMP"
chmod 0644 "$TMP"
mv -f "$TMP" "$DEST"
trap - EXIT HUP INT TERM
echo "PASS: gateway file published (remote authentication not yet verified)"
