#!/usr/bin/env bash
set -euo pipefail
# CI-only, real pinned OpenClaw Gateway with plugins disabled.
# Never contacts, starts, or changes anything on Top.Host.
if [[ $# -ne 1 ]]; then echo 'EXPECTED_CI_INSTALL_ROOT'; exit 2; fi
root="$1"
cli="$root/node_modules/openclaw/openclaw.mjs"
test -f "$cli"
state="$(mktemp -d)"
export OPENCLAW_STATE_DIR="$state"
export OPENCLAW_CONFIG_PATH="$state/openclaw.json"
export OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
export OPENCLAW_NO_AUTO_UPDATE=1
printf '%s\n' '{"gateway":{"mode":"local","bind":"loopback"},"plugins":{"enabled":false}}' > "$OPENCLAW_CONFIG_PATH"
chmod 600 "$OPENCLAW_CONFIG_PATH"
pid=''
cleanup() {
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$state"
}
trap cleanup EXIT
node "$cli" gateway run --allow-unconfigured --bind loopback --port 18891 --auth token --token "$OPENCLAW_GATEWAY_TOKEN" > "$state/gateway.log" 2>&1 &
pid=$!
ready=0
for _ in {1..60}; do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo 'OPENCLAW_MINIMAL_GATEWAY_EXITED_EARLY'
    sed -E 's/[A-Fa-f0-9]{64}/[redacted]/g' "$state/gateway.log" | tail -n 40
    exit 1
  fi
  status="$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 3 http://127.0.0.1:18891/ || true)"
  if [[ "$status" == 200 || "$status" == 401 || "$status" == 403 ]]; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" != 1 ]]; then
  echo 'OPENCLAW_MINIMAL_GATEWAY_NO_HTTP_RESPONSE'
  sed -E 's/[A-Fa-f0-9]{64}/[redacted]/g' "$state/gateway.log" | tail -n 40
  exit 1
fi
node "$cli" gateway call health --port 18891 --token "$OPENCLAW_GATEWAY_TOKEN" --timeout 12000 --json > "$state/health.json"
python3 - "$state/health.json" <<'PY'
import json, pathlib, sys
if not isinstance(json.loads(pathlib.Path(sys.argv[1]).read_text()), dict):
    raise SystemExit('MINIMAL_GATEWAY_RPC_INVALID')
print('OPENCLAW_MINIMAL_GATEWAY_RPC_HEALTH=PASS')
PY
sleep 12
if ! kill -0 "$pid" 2>/dev/null; then
  echo 'OPENCLAW_MINIMAL_GATEWAY_EXITED_BEFORE_MEMORY_SAMPLE'
  exit 1
fi
python3 - "$pid" <<'PY'
import pathlib, re, sys
data=pathlib.Path('/proc/'+str(int(sys.argv[1]))+'/status').read_text().splitlines()
metrics={}
for line in data:
    m=re.match(r'^(VmRSS|VmHWM|VmSize|Threads):\s*(\d+)',line)
    if m: metrics[m.group(1)]=int(m.group(2))
for key in ('VmRSS','VmHWM','VmSize','Threads'):
    if key not in metrics: raise SystemExit('MISSING_PROC_MEMORY_METRIC_'+key)
print('OPENCLAW_MINIMAL_CI_GATEWAY_RSS_MB='+str(round(metrics['VmRSS']/1024)))
print('OPENCLAW_MINIMAL_CI_GATEWAY_PEAK_RSS_MB='+str(round(metrics['VmHWM']/1024)))
print('OPENCLAW_MINIMAL_CI_GATEWAY_VIRTUAL_MB='+str(round(metrics['VmSize']/1024)))
print('OPENCLAW_MINIMAL_CI_GATEWAY_THREADS='+str(metrics['Threads']))
print('OPENCLAW_MINIMAL_CI_DISABLED_PLUGINS=true')
print('OPENCLAW_MINIMAL_CI_NOT_TOPHOST=true')
PY
