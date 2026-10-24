#!/usr/bin/env node
// One-command setup for the AI board. Run from the Laravel project root. Safe to run again.
//   node docs/ai/board/setup.mjs [--claude-hooks] [--no-scripts]
// Adds npm scripts (ai:board, ai:log, ai:run, ai:doctor, ai:probe), git-ignores the generated state,
// and with --claude-hooks merges the optional Claude Code hooks into .claude/settings.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, STATE_DIR, syncProgress, loadPlan } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const ok = (m) => console.log(`  ok    ${m}`);
const skip = (m) => console.log(`  skip  ${m}`);
const fail = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1; };

console.log('AI board setup');

console.log('\n== Project');
if (!existsSync(join(ROOT, 'artisan')) || !existsSync(join(ROOT, 'package.json'))) {
  fail(`run this inside the Laravel project (artisan and package.json not found in ${ROOT})`);
  process.exit(1);
}
ok(`project root ${ROOT}`);
mkdirSync(STATE_DIR, { recursive: true });
ok('docs/ai/state/ ready');
if (!loadPlan()) syncProgress();

console.log('\n== package.json scripts');
if (args.has('--no-scripts')) skip('--no-scripts');
else {
  const pkgPath = join(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts ??= {};
  const wanted = {
    'ai:board': 'node docs/ai/board/board.mjs',
    'ai:log': 'node docs/ai/board/log.mjs',
    'ai:run': 'node docs/ai/board/wrap.mjs',
    'ai:doctor': 'node docs/ai/board/doctor.mjs',
    'ai:probe': 'node docs/ai/board/codex.mjs --probe',
  };
  let changed = false;
  for (const [k, v] of Object.entries(wanted)) {
    if (pkg.scripts[k] === v) skip(`script ${k} exists`);
    else { pkg.scripts[k] = v; changed = true; ok(`script ${k}`); }
  }
  if (changed) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log('\n== .gitignore');
const giPath = join(ROOT, '.gitignore');
let gi = existsSync(giPath) ? readFileSync(giPath, 'utf8') : '';
const add = ['/docs/ai/progress.md', '/docs/ai/state/'].filter((l) => !gi.split(/\r?\n/).map((x) => x.trim()).includes(l));
if (add.length) { writeFileSync(giPath, `${gi.replace(/\n*$/, '\n')}${add.join('\n')}\n`); ok(`added ${add.join(', ')}`); } else skip('already ignored');

console.log('\n== Claude Code hooks (optional)');
if (!args.has('--claude-hooks')) skip('not requested (Codex needs no hooks). Add with: node docs/ai/board/setup.mjs --claude-hooks');
else {
  const settingsPath = join(ROOT, '.claude', 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) { try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { fail('.claude/settings.json is not valid JSON, not touching it'); process.exit(1); } }
  const command = 'node "$CLAUDE_PROJECT_DIR/docs/ai/board/hook.mjs"';
  settings.hooks ??= {};
  for (const [event, matcher] of [['PostToolUse', '*'], ['SubagentStop', undefined]]) {
    const list = (settings.hooks[event] ??= []);
    const has = list.some((g) => (g.hooks ?? []).some((h) => h.command === command));
    if (has) { skip(`${event} hook exists`); continue; }
    list.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command }] });
    ok(`${event} hook added`);
  }
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

console.log('\n== Next');
console.log('  1. npm run ai:doctor     (checks everything, including whether Codex sessions can be read)');
console.log('  2. npm run ai:board      (opens the live dashboard; in VS Code: Ctrl+Shift+P > Simple Browser: Show)');
console.log('  Agents report with: node docs/ai/board/log.mjs ...   (see docs/ai/BOARD.md)');
