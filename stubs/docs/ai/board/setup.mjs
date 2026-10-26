#!/usr/bin/env node
// One-command setup for the AI board. Run from the Laravel project root. Safe to run again.
//   node docs/ai/board/setup.mjs [--claude-hooks] [--codex-rules] [--no-scripts] [--no-wrap]
// Adds npm scripts (ai:board, ai:log, ai:run, ai:doctor, ai:probe), git-ignores the generated state,
// wraps `npm run e2e` so it is logged by a script, and with --claude-hooks merges the optional Claude Code hooks into .claude/settings.json.
// --codex-rules writes a Codex rule that lets the agent run log.mjs without an approval prompt (so logging is not skipped).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT, STATE_DIR, syncProgress, loadPlan } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const OLD_E2E = 'node docs/ai/board/wrap.mjs --agent qa-playwright --label e2e -- npm run e2e:raw --';
const NEW_E2E = 'node docs/ai/board/wrap.mjs --agent qa-playwright --label e2e --stall 300 --timeout 1800 -- npm run e2e:raw --';
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
    'ai:test': 'node docs/ai/board/wrap.mjs --agent qa-engineer --label pest --stall 1800 --timeout 1800 -- php artisan test',
    'ai:gate': 'node docs/ai/tools/gate.mjs',
    'ai:context': 'node docs/ai/tools/context.mjs',
  };
  let changed = false;
  for (const [k, v] of Object.entries(wanted)) {
    if (pkg.scripts[k] === v) skip(`script ${k} exists`);
    else { pkg.scripts[k] = v; changed = true; ok(`script ${k}`); }
  }
  // Wrapped scripts: the script writes the log, so it is recorded even when the agent forgets.
  if (args.has('--no-wrap')) skip('--no-wrap');
  else if (!pkg.scripts.e2e) skip('script e2e not found (it is wrapped later by the Playwright setup)');
  else if (pkg.scripts.e2e === OLD_E2E) { pkg.scripts.e2e = NEW_E2E; changed = true; ok('script e2e now has Playwright limits (stall 300 s, timeout 1800 s, heartbeat)'); }
  else if (/wrap\.mjs/.test(pkg.scripts.e2e)) skip('script e2e is already logged');
  else if (pkg.scripts['e2e:raw'] && pkg.scripts['e2e:raw'] !== pkg.scripts.e2e) skip('e2e:raw already exists with other content; not touching e2e');
  else {
    pkg.scripts['e2e:raw'] = pkg.scripts.e2e;
    pkg.scripts.e2e = NEW_E2E;
    changed = true; ok('script e2e is now logged by the board (original kept as e2e:raw)');
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

console.log('\n== Codex approval rule (optional)');
if (!args.has('--codex-rules')) skip('not requested. If Codex asks approval for every log command, run: node docs/ai/board/setup.mjs --codex-rules');
else {
  const rulesDir = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'rules');
  const rulesFile = join(rulesDir, 'ai-board.rules');
  const body = `# Written by docs/ai/board/setup.mjs. Lets the agent record plan and status without an approval prompt each time.
# Only log.mjs is allowed (it writes inside docs/ai/ only). wrap.mjs is NOT allowed here because it runs other commands.
prefix_rule(
    pattern = ["node", "docs/ai/board/log.mjs"],
    decision = "allow",
    justification = "Writes plan and status to docs/ai/state and docs/ai/progress.md only",
    match = ["node docs/ai/board/log.mjs task T1 done evidence"],
    not_match = ["node other.mjs docs/ai/board/log.mjs"],
)
prefix_rule(
    pattern = ["npm", "run", "ai:log"],
    decision = "allow",
    justification = "Same as log.mjs",
    match = ["npm run ai:log -- task T1 done evidence"],
)
`;
  try {
    mkdirSync(rulesDir, { recursive: true });
    if (existsSync(rulesFile) && readFileSync(rulesFile, 'utf8') === body) skip(`${rulesFile} is up to date`);
    else { writeFileSync(rulesFile, body); ok(`wrote ${rulesFile}`); }
    console.log('  info  Restart Codex (reload the VS Code window) so it loads the rule. Check it with:');
    console.log(`        codex execpolicy check --pretty --rules "${rulesFile}" -- node docs/ai/board/log.mjs task T1 done x`);
    console.log('  info  Whether the VS Code extension applies these rules is not confirmed in the Codex docs; if it still asks, approve once with "always allow" in the prompt.');
  } catch (e) { fail(`could not write ${rulesFile} (${e.code || e.message})`); }
}

console.log('\n== Next');
console.log('  1. npm run ai:doctor     (checks everything, including whether Codex sessions can be read)');
console.log('  2. npm run ai:board      (opens the live dashboard; in VS Code: Ctrl+Shift+P > Simple Browser: Show)');
console.log('  Agents report with: node docs/ai/board/log.mjs ...   (see docs/ai/BOARD.md)');
