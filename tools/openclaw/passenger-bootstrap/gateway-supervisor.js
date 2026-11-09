'use strict';
// Isolated OpenClaw runner for the n7-agent Passenger app.
// The Gateway stays on 127.0.0.1 and is NEVER reverse-proxied by this app.
// All state and secrets stay under the isolated app root (outside public/).
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = __dirname;
const port = 19487; // Intentionally different from the original N7 port (18789).
const stateDir = path.join(root, '.n7-agent-state');
const configPath = path.join(stateDir, 'openclaw.json');
const entries = [
  path.resolve(root, '../bot.piratecartography.com/n7-app/.openclaw-staging/runtime/node_modules/openclaw/openclaw.mjs'),
  path.resolve(root, '../bot.piratecartography.com/n7-app/.openclaw-staging/runtime/node_modules/openclaw/bin/openclaw.js')
];
let child = null;
let launchStatus = 'not_started';
let lastExitCode = null;
let lastSignal = null;
const entry = entries.find((candidate) => {
  try { return fs.statSync(candidate).isFile(); } catch { return false; }
});

function listening() {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      s.destroy();
      resolve(value);
    }
    s.once('connect', () => finish(true));
    s.once('error', () => finish(false));
    s.setTimeout(500, () => finish(false));
  });
}

function prepareIsolatedState() {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(stateDir, 0o700);
  const workspace = path.join(stateDir, 'workspace');
  fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(configPath)) {
    const cfg = {
      gateway: {
        mode: 'local',
        bind: 'loopback',
        port,
        auth: { mode: 'token', token: crypto.randomBytes(32).toString('hex') }
      },
      agents: { defaults: { workspace } },
      update: { auto: { enabled: false } }
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  fs.chmodSync(configPath, 0o600);
}

async function start() {
  // Capture actual host constraints without running Gateway or exposing them over HTTP.
  try { require('./host-diagnostic').save(); } catch { /* restrictions are a diagnostic result */ }
  if (process.env.N7_AGENT_OPENCLAW_DISABLED === '1') {
    launchStatus = 'disabled_by_environment';
    return;
  }
  // A live Top.Host test launched the Gateway but the host killed it with SIGKILL.
  // Fail closed until the host's process/memory limits have been diagnosed.
  if (process.env.N7_AGENT_OPENCLAW_ENABLED !== '1') {
    launchStatus = 'disabled_after_host_sigkill';
    return;
  }
  if (!entry) {
    launchStatus = 'openclaw_package_not_readable';
    return;
  }
  // Never compete with an existing loopback listener (possibly an earlier Passenger child).
  if (await listening()) {
    launchStatus = 'loopback_listener_preexisting';
    return;
  }
  try {
    prepareIsolatedState();
    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
      OPENCLAW_WORKSPACE_DIR: path.join(stateDir, 'workspace'),
      OPENCLAW_GATEWAY_PORT: String(port),
      OPENCLAW_NO_AUTO_UPDATE: '1'
    };
    // This is not the Passenger HTTP listener. It is a separate loopback-only child.
    // No extra public routes, no token forwarded, and no default N7 config reused.
    child = spawn(process.execPath, [entry, 'gateway', 'run', '--bind', 'loopback', '--port', String(port)], {
      cwd: root, env, stdio: 'ignore'
    });
    launchStatus = 'process_spawned';
    child.on('error', (err) => {
      launchStatus = 'spawn_error_' + (err.code || 'unknown');
      lastExitCode = null;
    });
    child.on('exit', (code, signal) => {
      lastExitCode = code;
      lastSignal = signal || null;
      launchStatus = 'process_exited';
      child = null;
    });
  } catch (err) {
    launchStatus = 'startup_error_' + (err.code || 'unknown');
  }
}

async function status() {
  const socketListening = await listening();
  return {
    service: 'n7-agent-passenger-openclaw-supervisor',
    node: process.version,
    passengerResponsive: true,
    openclawPackageReadable: !!entry,
    gatewayProcessSpawned: child !== null && child.exitCode === null,
    gatewaySocketListening: socketListening,
    gatewayPortPubliclyExposed: false,
    gatewayModelConfigured: false,
    gatewayLaunchState: launchStatus,
    gatewayLastExitCode: lastExitCode,
    gatewayLastSignal: lastSignal
  };
}

function stop() {
  if (child && child.exitCode === null) {
    try { child.kill('SIGTERM'); } catch { /* OS may have stopped it already */ }
  }
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

module.exports = { start, status };
