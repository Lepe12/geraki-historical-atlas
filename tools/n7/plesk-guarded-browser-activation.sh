#!/usr/bin/env bash
# N7 — one-time, least-privilege guarded Browser Reader activation on Top.Host Plesk.
# This script does NOT install the pending MCP PR #113 or alter WordPress/NABOU.
set -euo pipefail
umask 077

mode="${1:---check}"
case "$mode" in --check|--apply) ;; *) echo 'N7_USAGE: --check | --apply' >&2; exit 2;; esac

if [ "$(id -u)" -eq 0 ]; then
  echo 'N7_REFUSE_ROOT: run as the Plesk subscription system user' >&2; exit 2
fi

NODE_BIN=/opt/plesk/node/22/bin/node
GIT_PARENT=/var/www/vhosts/piratecartography.com/git
INSTALLER_REL=tools/n7/deploy_reconciled_runtime.py
APP_DIR=/var/www/vhosts/piratecartography.com/bot.piratecartography.com/n7-app
PYTHON_BIN=/usr/bin/python3

# Fail closed: never use a different application directory or a globally selected GitHub checkout.
[ -x "$NODE_BIN" ] || { echo 'N7_NODE22_MISSING' >&2; exit 2; }
[ -x "$PYTHON_BIN" ] || { echo 'N7_PYTHON_MISSING' >&2; exit 2; }
[ -d "$APP_DIR" ] || { echo 'N7_APP_ROOT_MISSING' >&2; exit 2; }
[ -d "$GIT_PARENT" ] || { echo 'N7_PLESK_GIT_PARENT_MISSING' >&2; exit 2; }
command -v git >/dev/null || { echo 'N7_GIT_MISSING' >&2; exit 2; }

repo=''
for candidate in "$GIT_PARENT"/*; do
  [ -d "$candidate" ] || continue
  remotes="$(git --git-dir="$candidate" config --get-regexp '^remote\..*\.url$' 2>/dev/null || true)"
  if printf '%s\n' "$remotes" | grep -Eiq 'github\.com[/:]Lepe12/independent-ai-bot(\.git)?/?([[:space:]]|$)'; then
    if [ -n "$repo" ]; then echo 'N7_AMBIGUOUS_GIT_MIRROR' >&2; exit 2; fi
    repo="$candidate"
  fi
done
[ -n "$repo" ] || { echo 'N7_N7_GIT_MIRROR_NOT_FOUND' >&2; exit 2; }

tmp="$(mktemp -d /tmp/n7-guarded.XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
# Clone only the local Plesk mirror. No PAT, no API calls, no GitHub Actions.
git clone --quiet --no-hardlinks --single-branch --branch main "$repo" "$tmp/source"
cd "$tmp/source"
# Required approved Browser Reader activation fix must be present in the local mirror.
git merge-base --is-ancestor 2f1b0217a7e6111fbf4a2bca36d8f34ad7e44b1b HEAD || {
  echo 'N7_MIRROR_OUTDATED_BROWSER_FIX' >&2; exit 2;
}
[ -f "$INSTALLER_REL" ] || { echo 'N7_INSTALLER_NOT_FOUND' >&2; exit 2; }
export PATH="$(dirname "$NODE_BIN"):$PATH"
echo 'N7_PLESK_PREFLIGHT_START'
"$PYTHON_BIN" "$INSTALLER_REL" --plesk --scope browser --dry-run
if [ "$mode" = '--check' ]; then
  echo 'N7_PREFLIGHT_ONLY: no production files changed'
  exit 0
fi
echo 'N7_PLESK_GUARDED_ACTIVATION_START'
"$PYTHON_BIN" "$INSTALLER_REL" --plesk --scope browser --apply
echo 'N7_PLESK_BRIDGE_INSTALLATION_COMPLETED: inspect N7_LIVE_RELEASE_VERIFIED above'
