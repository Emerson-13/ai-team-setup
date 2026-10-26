import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, node, log } from './helpers.mjs';

test('log: plan, tasks, agents, progress line and progress.md', () => {
  const d = project({ laravel: false });
  assert.match(log(d, 'plan', 'Orders', '--task', 'Schema :: DB', '--task', 'API :: Backend').out, /PROGRESS 0\/2 tasks \(0%\)/);
  assert.match(log(d, 'task', 'T1', 'done', 'migration ok').out, /PROGRESS 1\/2 tasks \(50%\)/);
  assert.match(log(d, 'agent', 'qa-playwright', 'blocked', 'E2E', '--needs', 'MySQL down').out, /STOP: qa-playwright is blocked/);
  assert.notEqual(log(d, 'task', 'T1', 'finished-ish').code, 0);                 // invalid status is refused with the allowed list
  const md = readFileSync(join(d, 'docs/ai/progress.md'), 'utf8'); assert.match(md, /Progress: 1\/2 tasks \(50%\)/); assert.match(md, /qa-playwright \| E2E \| blocked/);
  assert.notEqual(log(d, 'finish').code, 0);                                      // open task and blocked agent
});

test('wrap: logs ok, failure, and stops a stalled command (exit 124)', () => {
  const d = project({ laravel: false }); const w = (...a) => node(d, 'docs/ai/board/wrap.mjs', a);
  assert.equal(w('--label', 'ok', '--', process.execPath, '-e', 'console.log(1)').code, 0);
  assert.equal(w('--label', 'bad', '--', process.execPath, '-e', 'process.exit(3)').code, 3);
  const s = w('--label', 'stall', '--stall', '2', '--', process.execPath, '-e', 'console.log("go");setTimeout(()=>{},30000)');
  assert.equal(s.code, 124); assert.match(s.out, /BLOCKED: no output for 2s/);
  const ev = readFileSync(join(d, 'docs/ai/state/events.jsonl'), 'utf8'); assert.match(ev, /command_stalled/); assert.equal((ev.match(/command_start/g) || []).length, 3);
});

test('wrap: a nested wrapper logs once', () => {
  const d = project({ laravel: false });
  node(d, 'docs/ai/board/wrap.mjs', ['--label', 'outer', '--', process.execPath, join(d, 'docs/ai/board/wrap.mjs'), '--label', 'inner', '--', process.execPath, '-e', 'console.log(1)'], { AI_BOARD_ROOT: d });
  const ev = readFileSync(join(d, 'docs/ai/state/events.jsonl'), 'utf8'); assert.equal((ev.match(/command_start/g) || []).length, 1);
});

test('setup: adds scripts, wraps e2e, is idempotent', () => {
  const d = project({ scripts: { e2e: 'playwright test' } });
  const first = node(d, 'docs/ai/board/setup.mjs'); assert.match(first.out, /script ai:gate/); assert.match(first.out, /script ai:context/);
  const pkg = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.e2e, /wrap\.mjs/); assert.equal(pkg.scripts['e2e:raw'], 'playwright test');
  assert.match(pkg.scripts['ai:gate'], /tools\/gate\.mjs/); assert.match(pkg.scripts['ai:context'], /tools\/context\.mjs/);
  const second = node(d, 'docs/ai/board/setup.mjs'); assert.doesNotMatch(second.out, /\bok {4}script/);
  assert.match(readFileSync(join(d, '.gitignore'), 'utf8'), /docs\/ai\/state/);
});

test('wrap: a silent but alive command shows a heartbeat, and a hard timeout is reported as TIME LIMIT', () => {
  const d = project({ laravel: false }); const w = (...a) => node(d, 'docs/ai/board/wrap.mjs', a);
  const h = w('--stall', '5', '--heartbeat', '1', '--', process.execPath, '-e', 'console.log("go");setTimeout(()=>{},30000)');
  assert.equal(h.code, 124); assert.match(h.out, /\[ai:run [0-9a-f]{6} heartbeat\] process alive, elapsed \d+s, last output \d+s ago/); assert.match(h.out, /last output:\s+go/);
  const t = w('--timeout', '2', '--stall', '0', '--heartbeat', '0', '--', process.execPath, '-e', 'setInterval(()=>console.log("tick"),300)');
  assert.equal(t.code, 124); assert.match(t.out, /BLOCKED: time limit of 2s reached/); assert.doesNotMatch(t.out, /heartbeat/);
});

test('setup: ai:test and e2e get long-suite limits; an old wrapped e2e is upgraded once', () => {
  const d = project({ scripts: { e2e: 'node docs/ai/board/wrap.mjs --agent qa-playwright --label e2e -- npm run e2e:raw --', 'e2e:raw': 'playwright test' } });
  node(d, 'docs/ai/board/setup.mjs');
  const pkg = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['ai:test'], /--stall 1800 --timeout 1800/); assert.match(pkg.scripts.e2e, /--stall 300 --timeout 1800/);
  assert.doesNotMatch(node(d, 'docs/ai/board/setup.mjs').out, /Playwright limits/);
});
