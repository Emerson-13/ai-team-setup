#!/usr/bin/env node
// Quality gate: runs the project's real checks in order, prints ONE line per step, and only the failing lines when something fails.
//   npm run ai:gate                      default: pint, phpstan, pest, types, build   (steps the project does not have are skipped)
//   npm run ai:gate -- --quick           static checks only (pint, phpstan, types): cheap, while you are still coding
//   npm run ai:gate -- --full            default + Playwright e2e + composer audit + npm audit
//   npm run ai:gate -- --only pest,types --keep-going --force --list --status
//   npm run ai:gate -- --stall 60 --timeout 300 --heartbeat 10     override the per-step limits for this run (seconds)
// v1.0.14, what a long run looks like:
//   * every step has its OWN stall (no output) and hard timeout (Pest 1800 s, Playwright 1800 s, build 300 s, PHPStan 180 s, TypeScript 180 s)
//   * every 30 s a heartbeat line proves the process is alive: "[Pest heartbeat] process alive, elapsed 180s, last output 12s ago"
//   * "no output" alone is NOT enough to kill: the process must still exist when the stall limit is reached. Before anything is killed the
//     gate writes docs/ai/state/gate/<step>.diag.txt (command, elapsed, PID, child processes, last output, database, memory, ports, Laravel log tail)
//   * distinct statuses: FAILED (real test/code failure) | BLOCKED (preflight) | STALLED (no output past the limit) | TIMED_OUT (hard limit) | CANCELLED (Ctrl+C / killed)
//   * the one-line summary is printed even when a step stops the run: steps that did not run say "not run"
//   * a stall, timeout, block or cancel marks the agent `blocked` on the board automatically (--no-board to turn that off)
// Saves tokens: unchanged code is not re-run (cached pass, keyed by file CONTENT + gate version + command), full output goes to
// docs/ai/state/gate/<step>.log (read it only if needed), and the run stops at the first failure.
// Exit: 0 pass | 1 failed | 3 blocked | 124 stalled | 125 timed out | 130 cancelled.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { join } from 'node:path';
import { ROOT, STATE_DIR, appendEvent, clip, stripAnsi, nowIso } from '../board/lib.mjs';
import { GATE_FILE, GATE_LOGS, fingerprint, hasFile, projectFp, readGate } from './fp.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const mode = flag('quick') ? 'quick' : flag('full') ? 'full' : 'default';
const only = val('only', '') ? val('only', '').split(',').map((s) => s.trim()) : null;
const numOpt = (name, env) => { const v = val(name, env ? process.env[env] : undefined); return v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v); };
const STALL_OVERRIDE = numOpt('stall', 'AI_STALL_SECONDS');       // seconds, applies to every selected step
const TIMEOUT_OVERRIDE = numOpt('timeout', 'AI_TIMEOUT_SECONDS'); // seconds, applies to every selected step
const HEARTBEAT = (numOpt('heartbeat', 'AI_HEARTBEAT_SECONDS') ?? 30) * 1000; // 0 = off
const win = process.platform === 'win32';
const agent = process.env.AI_BOARD_AGENT || 'qa-engineer';
const taskId = val('task', process.env.AI_BOARD_TASK || '');
const LIVE_FILE = join(STATE_DIR, 'gate-live.json');

let pkg = {}; try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); } catch { /* no package.json */ }
const scripts = pkg.scripts || {};
const hasScript = (n) => !!scripts[n];
const phpstanConfig = ['phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon'].some(hasFile);
const typeScript = ['type-check', 'typecheck', 'types'].find(hasScript);
const OFFLINE = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|getaddrinfo|Could not (?:fetch|resolve)|network|timed out|unable to (?:connect|resolve)|curl error|Failed to (?:open|download)/i;

// name | title (used in heartbeat lines) | where it applies | how to run it | files it depends on (cache) | stall = seconds without output | timeout = hard limit in seconds
const STEPS = [
  { name: 'pint', title: 'Pint', on: ['quick', 'default', 'full'], ok: () => hasFile('vendor/bin/pint'), cmd: 'php vendor/bin/pint --test', fp: ['php'], stall: 120, timeout: 120, fix: 'run `php vendor/bin/pint` (it fixes style), then re-run the gate' },
  { name: 'phpstan', title: 'PHPStan', on: ['quick', 'default', 'full'], ok: () => hasFile('vendor/bin/phpstan') && phpstanConfig, cmd: 'php vendor/bin/phpstan analyse --no-progress --error-format=raw --memory-limit=1G', fp: ['php'], stall: 180, timeout: 180, fix: 'fix the reported file:line errors; do not add them to the baseline to get green' },
  { name: 'pest', title: 'Pest', on: ['default', 'full'], ok: () => hasFile('artisan') && (hasFile('vendor/bin/pest') || hasFile('vendor/bin/phpunit')), pre: () => (hasFile('docs/ai/templates/laravel/test-doctor.php') ? 'php docs/ai/templates/laravel/test-doctor.php' : null), cmd: () => (hasFile('vendor/bin/pest') ? 'php vendor/bin/pest' : 'php artisan test'), fp: ['php'], stall: 1800, timeout: 1800, db: ['phpunit.xml', 'phpunit.xml.dist', '.env.testing'], fix: 'fix the failing test or the code it covers; never skip, weaken or delete a test' },
  { name: 'types', title: 'TypeScript', on: ['quick', 'default', 'full'], ok: () => !!typeScript, cmd: () => `npm run ${typeScript}`, fp: ['js'], stall: 180, timeout: 180, fix: 'fix the reported TypeScript/Vue errors' },
  { name: 'build', title: 'Build', on: ['default', 'full'], ok: () => hasScript('build'), cmd: 'npm run build', fp: ['js'], stall: 300, timeout: 300, fix: 'fix the build error shown' },
  { name: 'e2e', title: 'Playwright', on: ['full'], ok: () => hasScript('e2e') || hasScript('e2e:raw'), pre: () => (hasScript('e2e:doctor') ? 'npm run e2e:doctor' : null), cmd: () => (hasScript('e2e:raw') ? 'npm run e2e:raw -- --reporter=line' : 'npm run e2e -- --reporter=line'), fp: ['php', 'js', 'e2e'], stall: 300, timeout: 1800, preTimeout: 120, db: ['.env.e2e'], fix: 'open the trace named in the log; fix the app or the test, never weaken it' },
  { name: 'composer-audit', title: 'Composer audit', on: ['full'], ok: () => hasFile('composer.lock'), cmd: 'composer audit --no-interaction', fp: ['composer'], stall: 120, timeout: 120, soft: true, fix: 'update the vulnerable package or record why it is accepted' },
  { name: 'npm-audit', title: 'npm audit', on: ['full'], ok: () => hasFile('package-lock.json'), cmd: 'npm audit --audit-level=high', fp: ['npm'], stall: 120, timeout: 120, soft: true, fix: 'update the vulnerable package or record why it is accepted' },
];

const pick = (v) => (typeof v === 'function' ? v() : v);
const LABEL = { pass: 'ok', cached: '= cached', skipped: '- skipped', fail: 'FAILED', blocked: 'BLOCKED', stalled: 'STALLED', timed_out: 'TIMED_OUT', cancelled: 'CANCELLED', not_run: 'not run' };
const BAD = ['fail', 'stalled', 'blocked', 'timed_out', 'cancelled'];
const EXIT = { fail: 1, blocked: 3, stalled: 124, timed_out: 125, cancelled: 130 };
const secs = (ms) => Math.round(ms / 1000);

// ---------- process helpers ----------
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Every process in the machine's table as {pid, ppid, rssKb, name, age}, so the children of a step can be listed.
function processTable() {
  try {
    if (win) {
      const r = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,Name | ConvertTo-Csv -NoTypeInformation'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
      return (r.stdout || '').split(/\r?\n/).slice(1).map((l) => l.replace(/"/g, '').split(',')).filter((p) => p.length >= 4).map((p) => ({ pid: Number(p[0]), ppid: Number(p[1]), rssKb: Math.round(Number(p[2]) / 1024) || 0, name: p[3], age: '' }));
    }
    const r = spawnSync('ps', ['-eo', 'pid=,ppid=,rss=,etime=,comm='], { encoding: 'utf8', timeout: 8000 });
    return (r.stdout || '').split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 5).map((p) => ({ pid: Number(p[0]), ppid: Number(p[1]), rssKb: Number(p[2]) || 0, age: p[3], name: p.slice(4).join(' ') }));
  } catch { return []; }
}
function descendants(pid) {
  const all = processTable(); const out = []; const queue = [pid];
  while (queue.length) { const cur = queue.shift(); for (const p of all) if (p.ppid === cur && !out.find((x) => x.pid === p.pid)) { out.push(p); queue.push(p.pid); } }
  return { root: all.find((p) => p.pid === pid), kids: out };
}
const portOpen = (port) => new Promise((resolve) => { const s = net.connect({ port, host: '127.0.0.1' }); const done = (v) => { s.destroy(); resolve(v); }; s.setTimeout(500, () => done(false)); s.on('connect', () => done(true)); s.on('error', () => done(false)); });

function dbName(step) {
  for (const f of step.db || []) {
    try {
      const t = readFileSync(join(ROOT, f), 'utf8');
      const m = t.match(/name="DB_DATABASE"\s+value="([^"]*)"/) || t.match(/^\s*DB_DATABASE\s*=\s*"?([^"\r\n#]+)"?/m);
      if (m) return `${m[1].trim()} (${f})`;
    } catch { /* file absent */ }
  }
  return '(not found in ' + ((step.db || []).join(', ') || 'this step') + ')';
}
function envPorts() {
  const ports = new Set([8000, 8002, 5173]);
  for (const f of ['.env.e2e', '.env']) { try { const t = readFileSync(join(ROOT, f), 'utf8'); for (const m of t.matchAll(/(?:PORT|APP_URL|VITE_DEV_SERVER_URL)\s*=\s*\S*?:(\d{2,5})\b/g)) ports.add(Number(m[1])); for (const m of t.matchAll(/^\s*\w*PORT\s*=\s*(\d{2,5})\s*$/gm)) ports.add(Number(m[1])); } catch { /* absent */ } }
  return [...ports].filter((p) => p !== 3306 && p < 65536).slice(0, 8);
}
function laravelLogTail(sinceMs) {
  const f = join(ROOT, 'storage/logs/laravel.log');
  try {
    const s = statSync(f); if (s.mtimeMs < sinceMs) return ['(laravel.log was not written during this step)'];
    return readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).slice(-12).map((l) => clip(l, 200));
  } catch { return ['(no storage/logs/laravel.log)']; }
}

// Everything worth knowing about a step that is about to be stopped. Written to <step>.diag.txt; a short version is printed.
async function collectDiag({ step, cmd, pid, started, text, why }) {
  const { root, kids } = descendants(pid);
  const treeKb = (root?.rssKb || 0) + kids.reduce((a, k) => a + k.rssKb, 0);
  const open = []; for (const p of envPorts()) if (await portOpen(p)) open.push(p);
  const lastLines = text.split(/\r?\n/).filter((l) => l.trim()).slice(-15).map((l) => clip(l, 200));
  const lines = [
    `step: ${step.name}   reason: ${why}`,
    `command: ${cmd}`,
    `time: ${nowIso()}   elapsed: ${secs(Date.now() - started)}s`,
    `pid: ${pid} (${alive(pid) ? 'alive' : 'gone'})`,
    `child processes (${kids.length}): ${kids.length ? kids.slice(0, 12).map((k) => `${k.pid}:${k.name}${k.age ? `(${k.age})` : ''}`).join(', ') : 'none'}`,
    `memory: process tree ${Math.round(treeKb / 1024)} MB, gate ${Math.round(process.memoryUsage().rss / 1048576)} MB, system free ${Math.round(os.freemem() / 1048576)} of ${Math.round(os.totalmem() / 1048576)} MB`,
    `database: ${dbName(step)}`,
    `ports in use: ${open.length ? open.join(', ') : 'none of ' + envPorts().join(', ')}`,
    'last output:', ...(lastLines.length ? lastLines.map((l) => `  ${l}`) : ['  (no output at all)']),
    'laravel log tail:', ...laravelLogTail(started).map((l) => `  ${l}`),
  ];
  mkdirSync(GATE_LOGS, { recursive: true });
  const rel = `docs/ai/state/gate/${step.name}.diag.txt`;
  try { writeFileSync(join(ROOT, rel), `${lines.join('\n')}\n`); } catch { /* convenience */ }
  const short = [lines[3], lines[4], lines[5], lines[6], lines[7]];
  return { rel, short };
}

// ---------- running one command ----------
let current = null; // { kill, cancel } of the command running now, so Ctrl+C can stop it
let cancelled = false;

function run(step, cmd, { stallS, timeoutS, heartbeat = true, title, onStart }) {
  return new Promise((resolve) => {
    mkdirSync(GATE_LOGS, { recursive: true });
    const started = Date.now(); const id = randomBytes(3).toString('hex');
    let last = Date.now(); let reason = ''; let text = ''; let deciding = false; let finished = false; let diag = null;
    const child = spawn(cmd, { shell: true, cwd: ROOT, detached: !win, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', AI_WRAPPED: '1', AI_GATE_STEP: step.name, CI: process.env.CI || '1' } });
    const kill = () => { try { if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 10000 }); else process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } };
    const feed = (c) => { last = Date.now(); text += c.toString(); if (text.length > 4e6) text = text.slice(-2e6); };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    current = { kill, cancel: () => { reason = 'cancelled'; kill(); } };

    const live = (extra = {}) => { try { writeFileSync(LIVE_FILE, `${JSON.stringify({ gatePid: process.pid, step: step.name, id, pid: child.pid, startedAt: new Date(started).toISOString(), heartbeatAt: nowIso(), lastOutputAt: new Date(last).toISOString(), elapsedS: secs(Date.now() - started), stallS, timeoutS, status: 'running', ...extra })}\n`); } catch { /* ignore */ } };
    live();
    if (onStart) onStart(id);

    const decide = async (why) => {
      if (deciding || finished) return;
      if (!alive(child.pid)) return;            // already gone: let 'close' report the real exit code instead of guessing
      deciding = true;
      try { diag = await collectDiag({ step, cmd, pid: child.pid, started, text, why }); } catch { /* diagnostics are best effort */ }
      reason = why; kill();
    };
    const tick = setInterval(() => {
      if (reason || deciding || finished) return;
      const now = Date.now();
      if (stallS > 0 && now - last > stallS * 1000) decide('stalled');
      else if (timeoutS > 0 && now - started > timeoutS * 1000) decide('timed_out');
    }, 1000);
    const beat = heartbeat && HEARTBEAT > 0 ? setInterval(() => {
      if (reason || finished) return;
      const up = alive(child.pid);
      console.error(`[${title} heartbeat] process ${up ? 'alive' : 'gone, waiting for exit'}, elapsed ${secs(Date.now() - started)}s, last output ${secs(Date.now() - last)}s ago`);
      live();
    }, HEARTBEAT) : null;

    const end = (code, extra = '') => {
      if (finished) return; finished = true; clearInterval(tick); if (beat) clearInterval(beat); current = null;
      try { writeFileSync(LIVE_FILE, `${JSON.stringify({ gatePid: process.pid, step: step.name, id, status: reason || (code === 0 ? 'done' : 'failed'), endedAt: nowIso() })}\n`); } catch { /* ignore */ }
      resolve({ id, code, reason, ms: Date.now() - started, text: stripAnsi(text) + extra, diag, pid: child.pid, cmd });
    };
    child.on('error', (e) => end(127, `\ncould not start: ${e.message}`));
    child.on('close', (code) => end(code ?? 1));
  });
}

// ---------- reporting ----------
// the few lines that matter, not the whole log (the full output is in the log file)
const excerptKeepLines = (name, text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return '(no output)';
  const hot = /(FAIL|FAILED|✕|×|⨯|✗|Error|ERROR|error TS|Exception|Fatal|Parse error|Expected|Failed asserting|\.php:\d+|\.(ts|vue|js):\d+|^\s*\d+\) )/;
  const idx = lines.findIndex((l) => hot.test(l));
  const from = idx < 0 ? Math.max(0, lines.length - 20) : Math.max(0, idx - 1);
  const out = lines.slice(from, from + 22).map((l) => (l.length > 220 ? `${l.slice(0, 219)}…` : l));
  for (const s of lines.filter((l) => /^\s*(Tests:|Duration:)/.test(l)).slice(-2)) if (!out.includes(s)) out.push(s);
  let joined = out.join('\n');
  if (joined.length > 2400) joined = `${joined.slice(0, 2399)}…`;
  return joined;
};
const tailExcerpt = (text) => { const l = text.split(/\r?\n/).filter((x) => x.trim()).slice(-6).map((x) => clip(x, 200)); return l.length ? `last output:\n${l.join('\n')}` : 'last output: (none at all)'; };

function logEvent(type, id, name, extra = {}) { appendEvent({ source: 'wrap', agent, type, id, text: `gate:${name}`, data: extra }); }

// A stall, timeout, block or cancel is reported on the board without the agent having to remember: agent -> blocked, with exact evidence.
function boardBlock(name, status, id, evidence, needs) {
  if (flag('no-board')) return null;
  const log = join(ROOT, 'docs/ai/board/log.mjs');
  if (!existsSync(log)) return null;
  const env = { ...process.env, AI_BOARD_AGENT: agent };
  try {
    spawnSync(process.execPath, [log, 'agent', agent, 'blocked', `gate:${name} ${LABEL[status]} (cmd ${id})`, '--evidence', clip(evidence, 280), '--needs', clip(needs, 280)], { cwd: ROOT, env, stdio: 'ignore', timeout: 15000 });
    if (taskId) spawnSync(process.execPath, [log, 'task', taskId, 'blocked', clip(`gate:${name} ${LABEL[status]}, command ${id}, ${evidence}`, 280)], { cwd: ROOT, env, stdio: 'ignore', timeout: 15000 });
    return `board: ${agent} marked blocked${taskId ? `, ${taskId} blocked` : ''} (command ${id})`;
  } catch { return null; }
}
function boardRunning(name, id) {
  if (!taskId || flag('no-board')) return;
  const log = join(ROOT, 'docs/ai/board/log.mjs');
  if (!existsSync(log)) return;
  try { spawnSync(process.execPath, [log, 'task', taskId, 'in_progress', `gate:${name} running (cmd ${id})`], { cwd: ROOT, env: { ...process.env, AI_BOARD_AGENT: agent }, stdio: 'ignore', timeout: 15000 }); } catch { /* ignore */ }
}

const limits = (s) => ({ stallS: STALL_OVERRIDE ?? s.stall ?? 300, timeoutS: TIMEOUT_OVERRIDE ?? s.timeout ?? 900 });

async function main() {
  const prev = readGate();
  const plan = STEPS.filter((s) => (only ? only.includes(s.name) : s.on.includes(mode)));
  if (flag('list')) {
    for (const s of STEPS) {
      const want = only ? only.includes(s.name) : s.on.includes(mode);
      const l = limits(s);
      console.log(`${s.name.padEnd(15)} ${!want ? `not in --${mode}` : s.ok() ? `runs: ${pick(s.cmd)}   (stall ${l.stallS}s, timeout ${l.timeoutS}s)` : 'skipped (not set up in this project)'}`);
    }
    return 0;
  }
  if (flag('status')) {
    const g = prev?.lastGreen;
    console.log(g ? `last green gate: ${g.t} (${g.mode}), code fingerprint ${g.fp}, current code ${g.fp === projectFp() ? 'is the same' : 'has changed since'}` : 'no green gate has been recorded yet');
    if (prev && prev.result !== 'pass') console.log(`last run: ${prev.mode} ${prev.result} at ${prev.failed || '?'} (${prev.t})`);
    return 0;
  }

  const t0 = Date.now(); const results = []; let code = 0; let failure = null; let boardLine = null;
  const onSignal = (sig) => { cancelled = true; if (current) current.cancel(); else { /* between steps: main loop sees the flag */ } void sig; };
  process.on('SIGINT', () => onSignal('SIGINT')); process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('exit', () => { if (current) current.kill(); });

  for (const s of plan) {
    if (cancelled) break;
    if (!s.ok()) { results.push({ name: s.name, status: 'skipped', note: 'not set up' }); continue; }
    const cmd = pick(s.cmd);
    const sfp = fingerprint(s.fp, cmd);
    const was = prev?.steps?.find((x) => x.name === s.name);
    if (!flag('force') && was && (was.status === 'pass' || was.status === 'cached') && was.fp === sfp) { results.push({ name: s.name, status: 'cached', fp: sfp, ms: 0 }); continue; }

    // preflight (MySQL for Pest, ports/browser for Playwright): a failure here is "blocked", not a test failure
    const pre = s.pre && s.pre();
    if (pre) {
      const pl = limits({ stall: s.preTimeout || 60, timeout: s.preTimeout || 60 });
      const r = await run({ ...s, name: `${s.name}-preflight` }, pre, { stallS: STALL_OVERRIDE ? Math.min(STALL_OVERRIDE, pl.stallS) : pl.stallS, timeoutS: pl.timeoutS, heartbeat: false, title: `${s.title} preflight` });
      if (r.reason === 'cancelled' || cancelled) { results.push({ name: s.name, status: 'cancelled', fp: sfp }); code = 130; failure = { name: s.name, status: 'cancelled', excerpt: tailExcerpt(r.text), fix: 'the run was stopped by hand; it does not count as passed or failed. Re-run when ready' }; break; }
      if (r.code !== 0) {
        failure = { name: s.name, status: 'blocked', excerpt: excerptKeepLines(s.name, r.text), fix: `preflight failed (${pre}). Report blocked with this output; do not run the suite hoping it works` };
        results.push({ name: s.name, status: 'blocked', fp: sfp }); code = 3;
        boardLine = boardBlock(s.name, 'blocked', r.id, `preflight failed: ${pre}`, 'fix what the preflight lists, then re-run the gate');
        break;
      }
    }

    const l = limits(s);
    const r = await run(s, cmd, { ...l, title: s.title, onStart: (id) => boardRunning(s.name, id) });
    const logFile = join(GATE_LOGS, `${s.name}.log`);
    try { writeFileSync(logFile, r.text); } catch { /* the log file is a convenience */ }
    const rel = `docs/ai/state/gate/${s.name}.log`;
    let status = r.reason === 'cancelled' ? 'cancelled' : r.reason === 'stalled' ? 'stalled' : r.reason === 'timed_out' ? 'timed_out' : r.code === 0 ? 'pass' : 'fail';
    if (status === 'fail' && s.soft && OFFLINE.test(r.text)) status = 'skipped';
    logEvent(status === 'stalled' || status === 'timed_out' ? 'command_stalled' : 'command_end', r.id, s.name, { status, code: r.code, durationMs: r.ms, tail: r.text.split(/\r?\n/).filter(Boolean).slice(-6).map((x) => clip(x, 160)) });
    results.push({ name: s.name, status, ms: r.ms, code: r.code, id: r.id, fp: status === 'pass' ? sfp : undefined, log: rel, diag: r.diag?.rel, note: status === 'skipped' ? 'offline' : undefined });
    if (BAD.includes(status)) {
      const why = {
        fail: s.fix,
        stalled: `no output for ${l.stallS}s while the process was still alive, so it was stopped. Read ${r.diag?.rel || 'the diagnostics'} first, run the matching doctor, report blocked, do not repeat the same command`,
        timed_out: `hard limit of ${l.timeoutS}s reached (the process was still running), so it was stopped. Read ${r.diag?.rel || 'the diagnostics'}, report timed_out/blocked, do not repeat the same command`,
        cancelled: 'the run was stopped by hand (Ctrl+C or a kill). It does not count as passed or failed; re-run when ready',
      }[status];
      const body = status === 'fail' ? excerptKeepLines(s.name, r.text) : `${tailExcerpt(r.text)}${r.diag ? `\n${r.diag.short.join('\n')}` : ''}`;
      failure = { name: s.name, status, excerpt: body, fix: why, log: rel, cmdId: r.id };
      code = EXIT[status];
      if (status !== 'fail') boardLine = boardBlock(s.name, status, r.id, `${LABEL[status]} after ${secs(r.ms)}s; log ${rel}${r.diag ? `, diagnostics ${r.diag.rel}` : ''}`, status === 'cancelled' ? 'the gate was stopped manually; run it again before finishing' : `${s.name} ${LABEL[status]}; read the diagnostics, run the doctor, do not repeat blindly`);
      if (status === 'cancelled' || !flag('keep-going')) break;
    }
  }
  if (cancelled && !results.find((r) => r.status === 'cancelled')) { code = 130; results.push({ name: plan[results.length]?.name || 'gate', status: 'cancelled' }); failure ||= { name: results[results.length - 1].name, status: 'cancelled', excerpt: '(between steps)', fix: 'the run was stopped by hand; re-run when ready' }; }

  // steps that never started are listed too, so the summary always shows the whole plan
  for (const s of plan) if (!results.find((r) => r.name === s.name)) results.push({ name: s.name, status: 'not_run' });
  results.sort((a, b) => plan.findIndex((s) => s.name === a.name) - plan.findIndex((s) => s.name === b.name));

  const failed = results.filter((r) => BAD.includes(r.status));
  const result = failed.length ? 'fail' : 'pass';
  const fp = projectFp();
  const gate = { t: nowIso(), mode, result, failed: failed.map((f) => f.name).join(','), failedStatus: failed[0]?.status, fp, steps: results.filter((r) => r.status !== 'not_run'), lastGreen: prev?.lastGreen };
  if (result === 'pass' && mode !== 'quick') gate.lastGreen = { t: gate.t, mode, fp };
  // keep old passes for steps this run did not touch, so a later --quick does not forget a green pest
  if (prev?.steps) for (const o of prev.steps) if (!gate.steps.find((x) => x.name === o.name) && (o.status === 'pass' || o.status === 'cached')) gate.steps.push(o);
  try { mkdirSync(join(GATE_FILE, '..'), { recursive: true }); writeFileSync(GATE_FILE, `${JSON.stringify(gate, null, 1)}\n`); } catch { /* ignore */ }

  const sec = (ms) => (ms ? `${(ms / 1000).toFixed(1)}s` : '');
  console.log(`gate (${mode}): ${results.map((r) => `${r.name} ${LABEL[r.status]}${r.status === 'pass' ? ` ${sec(r.ms)}` : r.status === 'skipped' && r.note === 'offline' ? ' (offline)' : ['fail', 'stalled', 'timed_out'].includes(r.status) ? ` ${sec(r.ms)}` : ''}`).join(' | ')}`);
  if (failure) {
    console.log(`--- ${failure.name} ${LABEL[failure.status]}${failure.log ? ` (full log: ${failure.log})` : ''}${failure.cmdId ? ` [command ${failure.cmdId}]` : ''}`);
    console.log(failure.excerpt);
    console.log(`fix: ${failure.fix}`);
    if (boardLine) console.log(boardLine);
    const notRun = results.filter((r) => r.status === 'not_run').length;
    if (!flag('keep-going') && notRun) console.log(`stopped at the first failure; ${notRun} later step(s) not run.`);
  }
  const cached = results.filter((r) => r.status === 'cached').length;
  console.log(result === 'pass'
    ? `GATE PASS${mode === 'quick' ? ' (quick only: run the default gate before finishing)' : ''}: ${results.filter((r) => r.status === 'pass').length} run, ${cached} cached, ${((Date.now() - t0) / 1000).toFixed(0)}s | evidence: gate ${mode} pass, code fingerprint ${fp}, ${gate.t}`
    : `GATE FAIL at ${gate.failed} [${LABEL[failed[0]?.status || 'fail']}]${gate.lastGreen ? ` | last green: ${gate.lastGreen.t}${gate.lastGreen.fp === fp ? ' (same code)' : ''}` : ''}`);
  return result === 'pass' ? 0 : code || 1;
}

main().then((c) => process.exit(c), (e) => { console.error(`gate crashed: ${e.stack || e}`); process.exit(1); });
