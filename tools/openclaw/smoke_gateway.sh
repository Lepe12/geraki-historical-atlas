#!/usr/bin/env bash
set -euo pipefail
# Isolated CI-only runtime proof. Never contacts or alters the Top.Host service.
if [[ $# -ne 1 ]]; then echo "EXPECTED_INSTALL_ROOT"; exit 2; fi
root="$1"
cli="$root/node_modules/openclaw/openclaw.mjs"
test -f "$cli"
node "$cli" --version
state="$(mktemp -d)"
export OPENCLAW_STATE_DIR="$state"
export OPENCLAW_CONFIG_PATH="$state/openclaw.json"
export OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
log="$state/gateway.log"
pid=''
cleanup() {
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$state"
}
trap cleanup EXIT
node "$cli" gateway run --allow-unconfigured --bind loopback --port 18789 --auth token --token "$OPENCLAW_GATEWAY_TOKEN" >"$log" 2>&1 &
pid=$!
healthy=0
for _ in {1..60}; do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "OPENCLAW_GATEWAY_EXITED_EARLY"
    sed -E 's/[A-Fa-f0-9]{64}/[redacted]/g' "$log" | tail -n 45
    exit 1
  fi
  status="$(curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 3 http://127.0.0.1:18789/ || true)"
  if [[ "$status" == 200 || "$status" == 401 || "$status" == 403 ]]; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" != 1 ]]; then
  echo "OPENCLAW_GATEWAY_NO_HTTP_RESPONSE"
  sed -E 's/[A-Fa-f0-9]{64}/[redacted]/g' "$log" | tail -n 45
  exit 1
fi
# Verify the real authenticated Gateway RPC rather than relying on an open TCP port.
node "$cli" gateway call health --port 18789 --token "$OPENCLAW_GATEWAY_TOKEN" --timeout 8000 --json \
  >"$state/health.json"
python3 - "$state/health.json" <<'PY'
import json, pathlib, sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text())
if not isinstance(payload, dict):
    raise SystemExit('Gateway RPC returned invalid JSON')
print('OPENCLAW_GATEWAY_RPC_HEALTH=PASS')
print('OPENCLAW_ISOLATED_RUNTIME_VERIFIED=true')
print('OPENCLAW_TOPHOST_RUNTIME_VERIFIED=false')
PY
# Measure the real RSS and high-water RSS after the Gateway and its plugins settle.
# This is a CI-only process. No Top.Host process is started.
sleep 12
if ! kill -0 "$pid" 2>/dev/null; then
  echo 'OPENCLAW_GATEWAY_EXITED_BEFORE_MEMORY_SAMPLE'
  exit 1
fi
python3 - "$pid" <<'PY'
import pathlib, re, sys
pid=int(sys.argv[1])
lines=pathlib.Path(f'/proc/{pid}/status').read_text().splitlines()
metrics={}
for line in lines:
    match=re.match(r'^(VmRSS|VmHWM|VmSize|Threads):\\s*(\\d+)',line)
    if match: metrics[match.group(1)]=int(match.group(2))
for key in ('VmRSS','VmHWM','VmSize','Threads'):
    if key not in metrics: raise SystemExit('MISSING_PROC_MEMORY_METRIC_'+key)
print('OPENCLAW_CI_GATEWAY_RSS_MB='+str(round(metrics['VmRSS']/1024)))
print('OPENCLAW_CI_GATEWAY_PEAK_RSS_MB='+str(round(metrics['VmHWM']/1024)))
print('OPENCLAW_CI_GATEWAY_VIRTUAL_MB='+str(round(metrics['VmSize']/1024)))
print('OPENCLAW_CI_GATEWAY_THREADS='+str(metrics['Threads']))
print('OPENCLAW_CI_MEMORY_IS_NOT_TOPHOST_QUOTA=true')
PY
