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
