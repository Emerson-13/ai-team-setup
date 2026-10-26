import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { project, gate, log, fakeTool, setMode, hasPhp } from './helpers.mjs';

const skip = !hasPhp && 'php not installed';

function laravel({ doctor = false } = {}) {
  const d = project({ scripts: { build: 'node -e "process.exit(0)"', 'type-check': 'node -e "process.exit(0)"' } });
  fakeTool(d, 'pint'); fakeTool(d, 'pest');
  if (!doctor) rmSync(join(d, 'docs/ai/templates/laravel/test-doctor.php'), { force: true }); // the real MySQL preflight needs a database; tested separately below
  mkdirSync(join(d, 'app'), { recursive: true }); writeFileSync(join(d, 'app/A.php'), '<?php\n');
  return d;
}

test('gate: one line per step, passes, writes gate.json', { skip }, () => {
  const d = laravel(); const r = gate(d);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /gate \(default\): pint ok .*\| phpstan - skipped \| pest ok .*\| types ok .*\| build ok/);
  assert.match(r.out, /GATE PASS/);
  assert.ok(existsSync(join(d, 'docs/ai/state/gate.json')));
});

test('gate: unchanged code is cached, --force re-runs', { skip }, () => {
  const d = laravel(); gate(d);
  const again = gate(d); assert.match(again.out, /pint = cached \| .* pest = cached/); assert.match(again.out, /0 run, 4 cached/);
  assert.match(gate(d, ['--force']).out, /pint ok/);
});

test('gate: failure prints only the relevant lines, saves the full log, stops, and is not cached', { skip }, () => {
  const d = laravel(); setMode(d, 'pest', 'fail');
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /pest FAIL/); assert.match(r.out, /FAILED {2}Tests.*BookingTest/); assert.match(r.out, /BookingService\.php:12/);
  assert.doesNotMatch(r.out, /noise line 3\b/);               // the noise before the failure is not echoed
  assert.ok(r.out.length < 2000, `output too long: ${r.out.length}`);
  assert.match(r.out, /stopped at the first failure/);
  assert.match(readFileSync(join(d, 'docs/ai/state/gate/pest.log'), 'utf8'), /noise line 59/); // full log is on disk
  setMode(d, 'pest', 'pass');
  const fixed = gate(d); assert.equal(fixed.code, 0, fixed.out); assert.match(fixed.out, /pint = cached/); assert.match(fixed.out, /pest ok/);
});

test('gate: a stalled step is stopped (exit 124)', { skip }, () => {
  const d = laravel(); setMode(d, 'pest', 'stall');
  const r = gate(d, ['--only', 'pest', '--stall', '2']);
  assert.equal(r.code, 124, r.out); assert.match(r.out, /pest STALLED/);
});

test('gate: --quick skips pest and build; --list explains', { skip }, () => {
  const d = laravel();
  const q = gate(d, ['--quick']); assert.match(q.out, /gate \(quick\): pint ok .*types ok/); assert.doesNotMatch(q.out, /pest/);
  assert.match(gate(d, ['--list']).out, /phpstan\s+skipped \(not set up/);
});

test('finish: Laravel project needs a green default gate for the current code', { skip }, () => {
  const d = laravel();
  log(d, 'plan', 'T', '--task', 'one :: QA'); log(d, 'task', 'T1', 'done', 'proof');
  assert.match(log(d, 'finish').out, /quality gate: the quality gate has never been run/);
  gate(d, ['--quick']); assert.match(log(d, 'finish').out, /only a --quick gate passed/);
  gate(d); const ok = log(d, 'finish'); assert.equal(ok.code, 0, ok.out); assert.match(ok.out, /LOG COVERAGE/);
});

test('finish: code changed after the green gate is refused; --skip-gate is allowed and recorded', { skip }, () => {
  const d = laravel(); log(d, 'plan', 'T', '--task', 'one :: QA'); log(d, 'task', 'T1', 'done', 'proof'); gate(d);
  const f = join(d, 'app/A.php'); writeFileSync(f, '<?php // changed\n'); utimesSync(f, new Date(), new Date(Date.now() + 5000));
  assert.match(log(d, 'finish').out, /code changed after the last green gate run/);
  const s = log(d, 'finish', '--skip-gate', 'docs only'); assert.equal(s.code, 0, s.out); assert.match(s.out, /Gate skipped: docs only/);
});

test('finish: a project without artisan is not gated', () => {
  const d = project({ laravel: false }); log(d, 'plan', 'T', '--task', 'one :: QA'); log(d, 'task', 'T1', 'done', 'proof');
  assert.equal(log(d, 'finish').code, 0);
});

test('gate: a failing preflight is BLOCKED (exit 3), not a test failure', { skip }, () => {
  const d = laravel({ doctor: true });                       // no MySQL configured in this throw-away project
  const r = gate(d, ['--only', 'pest']); assert.equal(r.code, 3, r.out); assert.match(r.out, /pest BLOCKED/); assert.match(r.out, /Report blocked with this output/);
});

// ---- v1.0.14: per-step limits, heartbeat, diagnostics, statuses, summary, cache, cancel, board ----

test('gate: a step that outlives its hard timeout is TIMED_OUT (exit 125), distinct from STALLED', { skip }, () => {
  const d = laravel(); setMode(d, 'pest', 'stall');
  const r = gate(d, ['--only', 'pest', '--timeout', '2', '--stall', '60']);
  assert.equal(r.code, 125, r.out); assert.match(r.out, /pest TIMED_OUT/); assert.doesNotMatch(r.out, /pest STALLED/);
  assert.match(r.out, /GATE FAIL at pest \[TIMED_OUT\]/);
});

test('gate: a stall writes diagnostics BEFORE the kill and names the evidence', { skip }, () => {
  const d = laravel(); setMode(d, 'pest', 'stall');
  mkdirSync(join(d, 'storage/logs'), { recursive: true }); writeFileSync(join(d, 'storage/logs/laravel.log'), 'old line\n');
  writeFileSync(join(d, 'phpunit.xml'), '<phpunit><php><env name="DB_DATABASE" value="app_testing"/></php></phpunit>');
  const r = gate(d, ['--only', 'pest', '--stall', '2']);
  assert.equal(r.code, 124, r.out); assert.match(r.out, /pest STALLED/); assert.match(r.out, /process was still alive/);
  const diag = readFileSync(join(d, 'docs/ai/state/gate/pest.diag.txt'), 'utf8');
  for (const need of [/command: php vendor\/bin\/pest/, /elapsed: \d+s/, /pid: \d+/, /child processes/, /last output:\s+started/, /database: app_testing/, /memory:/, /ports in use/, /laravel log tail/]) assert.match(diag, need);
  assert.doesNotMatch(diag, /--compact/);
});

test('gate: a heartbeat line proves the process is alive while it is silent', { skip }, () => {
  const d = laravel(); setMode(d, 'pest', 'stall');
  const r = gate(d, ['--only', 'pest', '--stall', '4', '--heartbeat', '1']);
  assert.match(r.out, /\[Pest heartbeat\] process alive, elapsed \d+s, last output \d+s ago/);
  assert.equal(r.code, 124);
});

test('gate: the summary lists every step even when the run stops, with "not run"', { skip }, () => {
  const d = laravel(); setMode(d, 'pest', 'fail');
  const r = gate(d);
  assert.match(r.out, /gate \(default\): pint ok .*\| phpstan - skipped \| pest FAILED .*\| types not run \| build not run/);
  assert.match(r.out, /2 later step\(s\) not run/);
});

test('gate: pest runs without --compact and has its own 1800 s limits', { skip }, () => {
  const d = laravel(); const l = gate(d, ['--list']).out;
  assert.match(l, /pest\s+runs: php vendor\/bin\/pest {3}\(stall 1800s, timeout 1800s\)/); assert.doesNotMatch(l, /--compact/);
  assert.match(l, /build\s+runs: npm run build {3}\(stall 300s, timeout 300s\)/); assert.match(l, /types\s+runs: .*\(stall 180s, timeout 180s\)/);
});

test('gate: the cache follows file CONTENT (a touch does not invalidate) and the command/gate/config (they do)', { skip }, () => {
  const d = laravel(); gate(d);
  const f = join(d, 'app/A.php'); utimesSync(f, new Date(), new Date(Date.now() + 9000));
  assert.match(gate(d).out, /pest = cached/, 'same content, new mtime');
  writeFileSync(f, '<?php // really changed\n'); assert.match(gate(d).out, /pest ok/, 'content changed');
  writeFileSync(join(d, '.env.testing'), 'DB_DATABASE=app_testing\n'); assert.match(gate(d).out, /pest ok/, '.env.testing is part of the fingerprint');
  gate(d); const g = join(d, 'docs/ai/tools/gate.mjs'); writeFileSync(g, `${readFileSync(g, 'utf8')}\n// edited\n`);
  assert.match(gate(d).out, /pest ok/, 'a changed gate invalidates cached results');
});

test('gate: a stall marks the agent blocked on the board with exact evidence and the command id', { skip }, () => {
  const d = laravel(); setMode(d, 'pest', 'stall'); log(d, 'plan', 'T', '--task', 'one :: QA', '--task', 'two :: QA');
  const r = gate(d, ['--only', 'pest', '--stall', '2', '--task', 'T2'], { AI_BOARD_AGENT: 'qa-engineer' });
  assert.match(r.out, /board: qa-engineer marked blocked, T2 blocked \(command [0-9a-f]{6}\)/);
  const a = JSON.parse(readFileSync(join(d, 'docs/ai/state/agents.json'), 'utf8')).agents['qa-engineer'];
  assert.equal(a.status, 'blocked'); assert.match(a.evidence, /STALLED after \d+s; log docs\/ai\/state\/gate\/pest\.log, diagnostics .*pest\.diag\.txt/); assert.match(a.needs, /pest STALLED/);
  assert.match(JSON.parse(readFileSync(join(d, 'docs/ai/state/plan.json'), 'utf8')).tasks[1].note, /gate:pest STALLED, command [0-9a-f]{6}/);
  assert.equal(gate(d, ['--only', 'pest', '--stall', '2', '--no-board'], { AI_BOARD_AGENT: 'other' }).out.includes('board:'), false);
});

test('gate: Ctrl+C is CANCELLED (exit 130), shows the whole plan, and finish refuses it', { skip }, async () => {
  const d = laravel(); setMode(d, 'pest', 'stall'); log(d, 'plan', 'T', '--task', 'one :: QA'); log(d, 'task', 'T1', 'done', 'proof');
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [join(d, 'docs/ai/tools/gate.mjs'), '--stall', '60'], { cwd: d, env: { ...process.env, AI_BOARD_ROOT: d } });
  let out = ''; child.stdout.on('data', (c) => { out += c; }); child.stderr.on('data', (c) => { out += c; });
  await new Promise((r) => setTimeout(r, 2500)); child.kill('SIGINT');
  const code = await new Promise((r) => child.on('close', r));
  assert.equal(code, 130, out); assert.match(out, /pest CANCELLED/); assert.match(out, /types not run \| build not run/);
  const f = log(d, 'finish'); assert.notEqual(f.code, 0); assert.match(f.out, /cancelled/);
});

test('gate: a killed gate (no result written) leaves a marker and finish refuses the run', { skip }, () => {
  const d = laravel(); log(d, 'plan', 'T', '--task', 'one :: QA'); log(d, 'task', 'T1', 'done', 'proof'); gate(d);
  writeFileSync(join(d, 'docs/ai/state/gate-live.json'), JSON.stringify({ gatePid: 999999, step: 'pest', status: 'running' }));
  assert.match(log(d, 'finish').out, /a gate run was interrupted at step pest/);
});

test('gate: remembers the last green gate with its code fingerprint; --status prints it', { skip }, () => {
  const d = laravel(); gate(d); setMode(d, 'pest', 'fail'); writeFileSync(join(d, 'app/A.php'), '<?php // v2\n'); const r = gate(d);
  assert.match(r.out, /GATE FAIL at pest \[FAILED\] \| last green: \d{4}-/);
  const g = JSON.parse(readFileSync(join(d, 'docs/ai/state/gate.json'), 'utf8')); assert.match(g.lastGreen.fp, /^[0-9a-f]{16}$/);
  assert.match(gate(d, ['--status']).out, /last green gate: .* current code has changed since/);
  setMode(d, 'pest', 'pass'); assert.match(gate(d).out, /evidence: gate default pass, code fingerprint [0-9a-f]{16}/);
});
