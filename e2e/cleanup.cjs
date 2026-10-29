const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { execFile } = require('node:child_process');
const { temporaryRoot, fail } = require('./safety.cjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const transient = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY']);
const identities = new WeakMap();
function createOwnedRoot() {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ticketing-e2e-'));
  const token = Object.freeze({ directory });
  identities.set(token, fs.lstatSync(directory)); return token;
}
function exactRoot(token) {
  const original = identities.get(token); if (!original) throw fail('ROOT_OWNERSHIP');
  temporaryRoot(token.directory);
  const current = fs.lstatSync(token.directory);
  if (current.dev !== original.dev || current.ino !== original.ino || current.birthtimeMs !== original.birthtimeMs) throw fail('ROOT_IDENTITY');
  return token.directory;
}
function noLinks(directory) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) throw fail('ROOT_LINK');
  if (stat.isDirectory()) for (const entry of fs.readdirSync(directory)) noLinks(path.join(directory, entry));
}
// Four attempts, 50+100+200ms total backoff. No recursive fs internal retries.
async function removeOwnedRoot(token, { remove = fs.rmSync, delay = sleep } = {}) {
  for (let attempt = 0; ; attempt++) {
    const directory = exactRoot(token); noLinks(directory);
    try { remove(directory, { recursive: true, force: false, maxRetries: 0 }); return; }
    catch (error) { if (!transient.has(error.code) || attempt >= 3) throw error; await delay(50 * 2 ** attempt); }
  }
}
async function waitForExit(isGone, { timeoutMs = 5000, delay = sleep, now = Date.now } = {}) {
  const deadline = now() + timeoutMs;
  while (true) {
    if (await isGone(Math.max(1, deadline - now()))) return;
    if (now() >= deadline) throw fail('OWNED_PROCESS_EXIT_TIMEOUT');
    await delay(Math.min(100, deadline - now()));
  }
}
function ownedProcessesGone(directory, timeoutMs = 2000) {
  temporaryRoot(directory);
  if (process.platform !== 'win32') throw fail('PROCESS_INVENTORY_UNSUPPORTED');
  // Match only the exact private run directory in command arguments. Read-only;
  // never terminate by executable name. Do not return any command lines.
  const literal = directory.replace(/'/g, "''");
  const script = `$ErrorActionPreference='Stop'; $root='${literal}'; $p=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($root) }); Write-Output $p.Count`;
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: Math.min(2000, timeoutMs), maxBuffer: 1024 }, (error, stdout) => {
      if (error || !/^\d+\s*$/.test(stdout)) return reject(fail('PROCESS_INVENTORY_UNAVAILABLE'));
      resolve(Number(stdout.trim()) === 0);
    });
  });
}
module.exports = { createOwnedRoot, exactRoot, removeOwnedRoot, waitForExit, ownedProcessesGone };
