#!/bin/sh
# Run only from the authorized hosting shell, after confirming the Plesk app root.
set -eu
umask 077
COMMIT=8e35bf4318740261aa3ebcbd33da636d29e0233f
: "${PCT_APP_ROOT:?BLOCKED: set PCT_APP_ROOT to the confirmed live Plesk Node application root}"
APP="$(CDPATH= cd "$PCT_APP_ROOT" && pwd -P)"
ROOT="$(CDPATH= cd "$APP/../.." && pwd -P)"
[ "$APP" = "$ROOT/server/command-center-live" ] || { echo 'BLOCKED: unexpected repository/application layout' >&2; exit 1; }
[ -f "$APP/app.js" ] && [ -f "$APP/package.json" ] || { echo 'BLOCKED: application files missing' >&2; exit 1; }
NODE="${PCT_NODE_BIN:-/opt/plesk/node/24/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node)"
PHP="${PCT_PHP_BIN:-/opt/plesk/php/8.4/bin/php}"
[ -x "$PHP" ] || { echo 'BLOCKED: configured PHP CLI unavailable' >&2; exit 1; }
for program in python3 pdftotext pdfinfo pdftoppm tesseract curl sha256sum; do
  command -v "$program" >/dev/null || { echo "BLOCKED: required program $program unavailable" >&2; exit 1; }
done
"$NODE" -e 'if(Number(process.versions.node.split(".")[0])<18)process.exit(1)'
# No ripgrep dependency on the hosting machine.
LANGUAGES="$(tesseract --list-langs 2>/dev/null)"
for language in eng ell; do
  printf '%s\n' "$LANGUAGES" | grep -qx "$language" || { echo "BLOCKED: OCR language $language unavailable" >&2; exit 1; }
done
LOCK="$APP/.nabou-evidence-deploy.lock"
mkdir "$LOCK" || { echo 'BLOCKED: deployment already running; inspect existing lock' >&2; exit 1; }
TMP=''; BACKUP=''; INSTALLED=0; DONE=0
finish() {
  code="$1"
  trap - 0
  if [ "$INSTALLED" = 1 ] && [ "$DONE" = 0 ]; then
    while IFS= read -r file; do cp -p "$BACKUP/$file" "$ROOT/$file"; done < "$BACKUP/present.paths"
    while IFS= read -r file; do rm -f "$ROOT/$file"; done < "$BACKUP/absent.paths"
    mkdir -p "$APP/tmp"; touch "$APP/tmp/restart.txt"
    echo "ROLLED_BACK_FILES: $BACKUP" >&2
    echo 'The additive schema and its private database backup are preserved.' >&2
  fi
  if [ -n "$TMP" ]; then rm -rf "$TMP"; fi
  rmdir "$LOCK"
  exit "$code"
}
trap 'finish $?' 0
trap 'exit 130' INT
trap 'exit 143' TERM HUP
TMP="$(mktemp -d "$APP/.nabou-evidence-deploy.XXXXXXXX")"
BASE="https://raw.githubusercontent.com/Lepe12/geraki-historical-atlas/$COMMIT"
cat > "$TMP/files.sha256" <<'HASHES'
a804a7f91cd78515c2e69e21aad4c3fe8df21a3537242e1938d2da09dbd2618c server/command-center-live/historical-evidence.js
d77911d3df0477296e13d52ad5d56f904fa8fd0fc45e30912e87b06775e2da77 server/command-center-live/pdf-evidence.js
cb5b6c316321d17c558ae2818110dbbccba82da6e3350e46cf07642f88b77493 server/command-center-live/pdf-evidence.py
ba42b53ea61fa9b897114f0fbb74a85f888a370ed8841e313418336b594a9fb1 server/command-center-live/self-test.js
c5aeca16f3fceef66597cc008aeba5889bc62a08c93bf5a34354247b78cb6f51 server/command-center-live/learning-integration-test.js
455f1824075d739c14baed7448f33fe91d752c0705b47dca99c42e211fdef335 server/command-center-live/package.json
14daf82e6ba3ac69c1f8ca0a6d1d57d0ba6bdb03de0f80f5b369a16f8decf8e2 tools/storage/historical_evidence.php
f24414d2da1395ae3448b0d97009a94968cbdcd94aab61ced61f414ea3767816 tools/storage/historical_evidence_schema.sql
fce0d7f7ea347d1486df1fc70d965229d2172150c76b8254a839502e531756ce tools/storage/schema.sql
72ca86f71cb01b264dc6ee071e0e85fd0857e61f27a5a027b1cfbf164e34eac5 tools/storage/pct_research_store.php
25455ea35e5e1f515262f63371a74a6131247c68d313393d501e0221f1b8f78c server/command-center-live/app.js
HASHES
while read -r hash file; do
  mkdir -p "$TMP/$(dirname "$file")"
  curl --fail --location --proto '=https' --proto-redir '=https' --silent --show-error --max-time 60 "$BASE/$file" --output "$TMP/$file"
  printf '%s  %s\n' "$hash" "$TMP/$file" | sha256sum --check --status
  case "$file" in
    *.js) "$NODE" --check "$TMP/$file" ;;
    *.php) "$PHP" -l "$TMP/$file" ;;
    *.py) python3 -c 'import ast,pathlib,sys;ast.parse(pathlib.Path(sys.argv[1]).read_text())' "$TMP/$file" ;;
  esac
done < "$TMP/files.sha256"
"$NODE" "$TMP/server/command-center-live/self-test.js"
"$NODE" "$TMP/server/command-center-live/learning-integration-test.js"
"$PHP" "$TMP/tools/storage/pct_research_store.php" self-test-parser
mkdir -p "$APP/.deployment-backups"
chmod 700 "$APP/.deployment-backups"
BACKUP="$(mktemp -d "$APP/.deployment-backups/$(date -u +%Y%m%dT%H%M%SZ).XXXXXXXX")"
: > "$BACKUP/present.paths"; : > "$BACKUP/absent.paths"
while read -r hash file; do
  if [ -f "$ROOT/$file" ]; then
    mkdir -p "$BACKUP/$(dirname "$file")";cp -p "$ROOT/$file" "$BACKUP/$file"
    printf '%s\n' "$file" >> "$BACKUP/present.paths"
  else printf '%s\n' "$file" >> "$BACKUP/absent.paths"; fi
done < "$TMP/files.sha256"
if [ -f "$APP/.env" ]; then cp "$APP/.env" "$BACKUP/backend.env";chmod 600 "$BACKUP/backend.env";fi
"$PHP" "$TMP/tools/storage/pct_research_store.php" evidence-prepare > "$BACKUP/database-prepare.json"
INSTALLED=1
while read -r hash file; do
  mkdir -p "$ROOT/$(dirname "$file")"
  cp "$TMP/$file" "$ROOT/$file.new"
  mv "$ROOT/$file.new" "$ROOT/$file"
done < "$TMP/files.sha256"
"$NODE" "$APP/self-test.js"
"$NODE" "$APP/learning-integration-test.js"
"$PHP" "$ROOT/tools/storage/pct_research_store.php" evidence-status > "$BACKUP/database-status.json"
mkdir -p "$APP/tmp";touch "$APP/tmp/restart.txt"
DONE=1
printf 'FILES_UPDATED: %s\nBACKUP_DIRECTORY: %s\nPASSENGER_RESTART_REQUESTED\nPRODUCTION_HTTP_ACCEPTANCE_NOT_YET_VERIFIED\n' "$COMMIT" "$BACKUP"
