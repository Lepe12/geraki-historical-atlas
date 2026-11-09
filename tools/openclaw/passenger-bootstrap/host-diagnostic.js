'use strict';
// A no-spawn, no-privilege, read-only resource probe for the isolated agent app.
// No environment values, credentials, paths, PIDs or sensitive process data are logged.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const R = '/sys/fs/cgroup';
function textFile(file, limit = 8192) {
  try {
    return fs.readFileSync(file, 'utf8').slice(0, limit);
  } catch { return null; }
}
function bytesOrNull(s) {
  if (s === null || !/^\d+$/.test(s.trim())) return null;
  const n = Number(s.trim());
  return Number.isSafeInteger(n) ? n : null;
}
function mb(n) { return n === null ? null : Math.round(n / 1048576); }
function readMem(file) {
  const s = textFile(file, 128);
  if (s === null || s.trim() === 'max') return null;
  return mb(bytesOrNull(s));
}
function readCount(file) {
  const s = textFile(file, 128);
  return s === null || s.trim() === 'max' ? null : bytesOrNull(s);
}
function kv(file, allow) {
  const data = textFile(file) || '';
  const out = {};
  for (const line of data.split('\n')) {
    const match = line.match(/^([a-z_]+)\s+(\d+)$/);
    if (match && allow.includes(match[1])) out[match[1]] = Number(match[2]);
  }
  return out;
}
function procLimit(name) {
  const data = textFile('/proc/self/limits');
  const line = data?.split('\n').find(x => x.startsWith(name + ' '));
  if (!line) return null;
  const parts = line.slice(name.length).trim().split(/\s{2,}/);
  return parts[0] === 'unlimited' ? null : Number(parts[0]) || null;
}
function procStatus(name) {
  const data = textFile('/proc/self/status');
  const line = data?.split('\n').find(x => x.startsWith(name + ':'));
  if (!line) return null;
  const match = line.match(/:\s*(\d+)\s*kB/);
  return match ? Math.round(Number(match[1]) / 1024) : null;
}
function snapshot() {
  const usage = process.memoryUsage();
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    nodeVersion: process.version,
    sourceAvailable: {
      cgroupV2: textFile(R + '/cgroup.controllers', 1024) !== null,
      cgroupV1Memory: textFile(R + '/memory/memory.limit_in_bytes', 128) !== null,
      procLimits: textFile('/proc/self/limits', 1024) !== null
    },
    memory: {
      cgroupV2LimitMB: readMem(R + '/memory.max'),
      cgroupV2CurrentMB: readMem(R + '/memory.current'),
      cgroupV2PeakMB: readMem(R + '/memory.peak'),
      cgroupV2Events: kv(R + '/memory.events', ['low', 'high', 'max', 'oom', 'oom_kill', 'oom_group_kill']),
      cgroupV1LimitMB: readMem(R + '/memory/memory.limit_in_bytes'),
      cgroupV1UsageMB: readMem(R + '/memory/memory.usage_in_bytes'),
      cgroupV1FailCount: readCount(R + '/memory/memory.failcnt'),
      processRssMB: mb(usage.rss),
      processHeapUsedMB: mb(usage.heapUsed),
      processPeakVmRssMB: procStatus('VmHWM'),
      processVmPeakMB: procStatus('VmPeak'),
      hostReportedTotalMB: mb(os.totalmem()),
      hostReportedFreeMB: mb(os.freemem()),
      procMaxResidentMB: procLimit('Max resident set') === null ? null : mb(procLimit('Max resident set')),
      procMaxAddressSpaceMB: procLimit('Max address space') === null ? null : mb(procLimit('Max address space'))
    },
    processLimits: {
      cgroupV2Current: readCount(R + '/pids.current'),
      cgroupV2Max: readCount(R + '/pids.max'),
      cgroupV1Current: readCount(R + '/pids/pids.current'),
      cgroupV1Max: readCount(R + '/pids/pids.max'),
      procMaxProcesses: procLimit('Max processes')
    }
  };
}
function save() {
  const destDir = path.join(__dirname, '.n7-agent-state');
  fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(destDir, 0o700);
  const output = path.join(destDir, 'host-limits.json');
  const content = JSON.stringify(snapshot(), null, 2) + '\n';
  fs.writeFileSync(output, content, { flag: 'w', mode: 0o600 });
  fs.chmodSync(output, 0o600);
}
module.exports = { snapshot, save };
