#!/usr/bin/env node
// Quality gate: runs the project's real checks in order, prints ONE line per step, and only the failing lines when something fails.
//   npm run ai:gate                      default: pint, phpstan, pest, types, build   (steps the project does not have are skipped)
//   npm run ai:gate -- --quick           static checks only (pint, phpstan, types): cheap, while you are still coding
//   npm run ai:gate -- --full            default + Playwright e2e + composer audit + npm audit
//   npm run ai:gate -- --only pest,types --keep-going --force --list
// Saves tokens: unchanged code is not re-run (cached pass), full output goes to docs/ai/state/gate/<step>.log (read it only if needed),
// the run stops at the first failure, and a step with no output for 120 s is stopped (exit 124).
// Exit: 0 pass | 1 fail | 3 blocked (preflight failed) | 124 stalled.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, appendEvent, clip, stripAnsi, nowIso } from '../board/lib.mjs';
import { GATE_FILE, GATE_LOGS, fingerprint, hasFile, projectFp, readGate } from './fp.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const mode = flag('quick') ? 'quick' : flag('full') ? 'full' : 'default';
const only = val('only', '') ? val('only', '').split(',').map((s) => s.trim()) : null;
const STALL = Number(val('stall', process.env.AI_STALL_SECONDS || 120)) * 1000;
const TIMEOUT = Number(val('timeout', 900)) * 1000;
const win = process.platform === 'win32';
const agent = process.env.AI_BOARD_AGENT || 'qa-engineer';

let pkg = {}; try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); } catch { /* no package.json */ }
const scripts = pkg.scripts || {};
const hasScript = (n) => !!scripts[n];
const phpstanConfig = ['phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon'].some(hasFile);
const typeScript = ['type-check', 'typecheck', 'types'].find(hasScript);
const OFFLINE = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|getaddrinfo|Could not (?:fetch|resolve)|network|timed out|unable to (?:connect|resolve)|curl error|Failed to (?:open|download)/i;

// name, where it applies, how to run it, which files it depends on (for the cache), how to fix it
const STEPS = [
  { name: 'pint', on: ['quick', 'default', 'full'], ok: () => hasFile('vendor/bin/pint'), cmd: 'php vendor/bin/pint --test', fp: ['php'], fix: 'run `php vendor/bin/pint` (it fixes style), then re-run the gate' },
  { name: 'phpstan', on: ['quick', 'default', 'full'], ok: () => hasFile('vendor/bin/phpstan') && phpstanConfig, cmd: 'php vendor/bin/phpstan analyse --no-progress --error-format=raw --memory-limit=1G', fp: ['php'], fix: 'fix the reported file:line errors; do not add them to the baseline to get green' },
  { name: 'pest', on: ['default', 'full'], ok: () => hasFile('artisan') && (hasFile('vendor/bin/pest') || hasFile('vendor/bin/phpunit')), pre: () => (hasFile('docs/ai/templates/laravel/test-doctor.php') ? 'php docs/ai/templates/laravel/test-doctor.php' : null), cmd: () => (hasFile('vendor/bin/pest') ? 'php vendor/bin/pest --compact' : 'php artisan test'), fp: ['php'], fix: 'fix the failing test or the code it covers; never skip, weaken or delete a test' },
  { name: 'types', on: ['quick', 'default', 'full'], ok: () => !!typeScript, cmd: () => `npm run ${typeScript}`, fp: ['js'], fix: 'fix the reported TypeScript/Vue errors' },
  { name: 'build', on: ['default', 'full'], ok: () => hasScript('build'), cmd: 'npm run build', fp: ['js'], stall: 240, fix: 'fix the build error shown' },
  { name: 'e2e', on: ['full'], ok: () => hasScript('e2e') || hasScript('e2e:raw'), pre: () => (hasScript('e2e:doctor') ? 'npm run e2e:doctor' : null), cmd: () => (hasScript('e2e:raw') ? 'npm run e2e:raw -- --reporter=line' : 'npm run e2e -- --reporter=line'), fp: ['php', 'js', 'e2e'], stall: 180, fix: 'open the trace named in the log; fix the app or the test, never weaken it' },
  { name: 'composer-audit', on: ['full'], ok: () => hasFile('composer.lock'), cmd: 'composer audit --no-interaction', fp: ['composer'], soft: true, fix: 'update the vulnerable package or record why it is accepted' },
  { name: 'npm-audit', on: ['full'], ok: () => hasFile('package-lock.json'), cmd: 'npm audit --audit-level=high', fp: ['npm'], soft: true, fix: 'update the vulnerable package or record why it is accepted' },
];

const pick = (v) => (typeof v === 'function' ? v() : v);

function run(cmd, stallMs) {
  return new Promise((resolve) => {
    mkdirSync(GATE_LOGS, { recursive: true });
    const started = Date.now();
    const id = randomBytes(3).toString('hex');
    let last = Date.now(); let reason = ''; let text = '';
    const child = spawn(cmd, { shell: true, cwd: ROOT, detached: !win, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', AI_WRAPPED: '1', CI: process.env.CI || '1' } });
    const kill = () => { try { if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 10000 }); else process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } };
    const feed = (c) => { last = Date.now(); text += c.toString(); if (text.length > 4e6) text = text.slice(-2e6); };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    const timer = setInterval(() => {
      const now = Date.now();
      if (!reason && stallMs > 0 && now - last > stallMs) { reason = 'stalled'; kill(); }
      else if (!reason && now - started > TIMEOUT) { reason = 'timed_out'; kill(); }
    }, 1000);
    const end = (code, extra = '') => { clearInterval(timer); resolve({ id, code: reason ? 124 : code, reason, ms: Date.now() - started, text: stripAnsi(text) + extra }); };
    child.on('error', (e) => end(127, `\ncould not start: ${e.message}`));
    child.on('close', (code) => end(code ?? 1));
  });
}

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

function logEvent(type, id, name, extra = {}) { appendEvent({ source: 'wrap', agent, type, id, text: `gate:${name}`, data: extra }); }

async function main() {
  const prev = readGate();
  const plan = STEPS.filter((s) => (only ? only.includes(s.name) : s.on.includes(mode)));
  if (flag('list')) {
    for (const s of STEPS) {
      const want = only ? only.includes(s.name) : s.on.includes(mode);
      console.log(`${s.name.padEnd(15)} ${!want ? `not in --${mode}` : s.ok() ? `runs: ${pick(s.cmd)}` : 'skipped (not set up in this project)'}`);
    }
    return 0;
  }

  const t0 = Date.now(); const results = []; let code = 0; let failure = null;
  for (const s of plan) {
    if (!s.ok()) { results.push({ name: s.name, status: 'skipped', note: 'not set up' }); continue; }
    const sfp = fingerprint(s.fp);
    const was = prev?.steps?.find((x) => x.name === s.name);
    if (!flag('force') && was && (was.status === 'pass' || was.status === 'cached') && was.fp === sfp) { results.push({ name: s.name, status: 'cached', fp: sfp, ms: 0 }); continue; }

    // preflight (MySQL for Pest, ports/browser for Playwright): a failure here is "blocked", not a test failure
    const pre = s.pre && s.pre();
    if (pre) {
      const r = await run(pre, 60000);
      if (r.code !== 0) {
        failure = { name: s.name, status: 'blocked', excerpt: excerptKeepLines(s.name, r.text), fix: `preflight failed (${pre}). Report blocked with this output; do not run the suite hoping it works` };
        results.push({ name: s.name, status: 'blocked', fp: sfp }); code = 3; break;
      }
    }

    const cmd = pick(s.cmd); const r = await run(cmd, (s.stall || STALL / 1000) * 1000);
    const logFile = join(GATE_LOGS, `${s.name}.log`);
    try { writeFileSync(logFile, r.text); } catch { /* the log file is a convenience */ }
    const rel = `docs/ai/state/gate/${s.name}.log`;
    let status = r.code === 0 ? 'pass' : r.reason === 'stalled' ? 'stalled' : r.reason === 'timed_out' ? 'stalled' : 'fail';
    if (status === 'fail' && s.soft && OFFLINE.test(r.text)) status = 'skipped';
    logEvent(status === 'stalled' ? 'command_stalled' : 'command_end', r.id, s.name, { code: r.code, durationMs: r.ms, tail: r.text.split(/\r?\n/).filter(Boolean).slice(-6).map((l) => clip(l, 160)) });
    results.push({ name: s.name, status, ms: r.ms, code: r.code, fp: status === 'pass' ? sfp : undefined, log: rel, note: status === 'skipped' ? 'offline' : undefined });
    if (status === 'fail' || status === 'stalled') {
      failure = { name: s.name, status, excerpt: excerptKeepLines(s.name, r.text), fix: status === 'stalled' ? `no output for ${Math.round((s.stall || STALL / 1000))}s, stopped. Run the matching doctor, report blocked, do not repeat the same command` : s.fix, log: rel };
      code = status === 'stalled' ? 124 : 1;
      if (!flag('keep-going')) break;
    }
  }

  const failed = results.filter((r) => ['fail', 'stalled', 'blocked'].includes(r.status));
  const result = failed.length ? 'fail' : 'pass';
  const gate = { t: nowIso(), mode, result, failed: failed.map((f) => f.name).join(','), fp: projectFp(), steps: results };
  // keep old passes for steps this run did not touch, so a later --quick does not forget a green pest
  if (prev?.steps) for (const o of prev.steps) if (!gate.steps.find((x) => x.name === o.name) && (o.status === 'pass' || o.status === 'cached')) gate.steps.push(o);
  try { mkdirSync(join(GATE_FILE, '..'), { recursive: true }); writeFileSync(GATE_FILE, `${JSON.stringify(gate, null, 1)}\n`); } catch { /* ignore */ }

  const sec = (ms) => (ms ? `${(ms / 1000).toFixed(1)}s` : '');
  const mark = { pass: 'ok', cached: '= cached', skipped: '- skipped', fail: 'FAIL', stalled: 'STALLED', blocked: 'BLOCKED' };
  console.log(`gate (${mode}): ${results.map((r) => `${r.name} ${mark[r.status]}${r.status === 'pass' ? ` ${sec(r.ms)}` : r.status === 'skipped' && r.note === 'offline' ? ' (offline)' : r.status === 'fail' ? ` ${sec(r.ms)}` : ''}`).join(' | ')}`);
  if (failure) {
    console.log(`--- ${failure.name} ${failure.status.toUpperCase()}${failure.log ? ` (full log: ${failure.log})` : ''}`);
    console.log(failure.excerpt);
    console.log(`fix: ${failure.fix}`);
    if (!flag('keep-going') && plan.length > results.length) console.log(`stopped at the first failure; ${plan.length - results.length} later step(s) not run.`);
  }
  const cached = results.filter((r) => r.status === 'cached').length;
  console.log(result === 'pass'
    ? `GATE PASS${mode === 'quick' ? ' (quick only: run the default gate before finishing)' : ''}: ${results.filter((r) => r.status === 'pass').length} run, ${cached} cached, ${((Date.now() - t0) / 1000).toFixed(0)}s`
    : `GATE FAIL at ${gate.failed}`);
  return result === 'pass' ? 0 : code || 1;
}

main().then((c) => process.exit(c), (e) => { console.error(`gate crashed: ${e.stack || e}`); process.exit(1); });
