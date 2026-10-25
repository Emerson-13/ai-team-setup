#!/usr/bin/env node
// Preflight for the AI board. Run: npm run ai:doctor
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT, STATE_DIR, FILES, ensureDirs, readJson } from './lib.mjs';
import { codexHomes, listRollouts, readFirstLine, sameProject } from './codex.mjs';

let failures = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const warn = (m) => console.log(`  WARN  ${m}`);
const fail = (m, fix) => { failures++; console.log(`  FAIL  ${m}\n        fix: ${fix}`); };

console.log('AI board preflight\n');

Number(process.versions.node.split('.')[0]) >= 18 ? ok(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} is too old`, 'install Node 18 or newer');

for (const f of ['lib.mjs', 'log.mjs', 'wrap.mjs', 'board.mjs', 'board.html', 'codex.mjs', 'hook.mjs', 'watch.mjs', 'setup.mjs', '../tools/gate.mjs', '../tools/context.mjs', '../tools/fp.mjs']) {
  existsSync(join(ROOT, 'docs/ai/board', f)) ? null : fail(`docs/ai/board/${f} is missing`, 'run: php artisan ai-team:install --docs');
}
ok('board scripts present');

try { ensureDirs(); const t = join(STATE_DIR, '.doctor'); writeFileSync(t, 'x'); rmSync(t); ok('docs/ai/state/ is writable'); }
catch (e) { fail(`docs/ai/state/ is not writable (${e.code || e.message})`, 'check folder permissions'); }

for (const [name, f] of [['plan.json', FILES.plan], ['agents.json', FILES.agents]]) {
  if (!existsSync(f)) continue;
  readJson(f, undefined) === undefined ? fail(`${name} is not valid JSON`, `delete it or run: node docs/ai/board/log.mjs reset`) : ok(`${name} is valid`);
}

// package.json scripts
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const need = ['ai:board', 'ai:log', 'ai:run', 'ai:doctor', 'ai:probe', 'ai:test', 'ai:gate', 'ai:context'].filter((s) => !pkg.scripts?.[s]);
  need.length ? warn(`package.json is missing scripts: ${need.join(', ')}. Run: node docs/ai/board/setup.mjs (agents can still call node docs/ai/board/log.mjs directly)`) : ok('npm scripts ai:board, ai:log, ai:run, ai:doctor, ai:probe, ai:test, ai:gate, ai:context');
} catch { warn('package.json not found or not readable'); }

// logged scripts
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  if (pkg.scripts?.e2e) /wrap\.mjs/.test(pkg.scripts.e2e) ? ok('npm run e2e is logged by the board (not by the agent\'s memory)') : warn('npm run e2e is not logged. Run: node docs/ai/board/setup.mjs');
} catch { /* already reported above */ }

// Codex approval rule: without it Codex may ask approval for every log command and logging gets skipped
try {
  const rules = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'rules');
  const has = existsSync(rules) && readdirSync(rules).some((f) => f.endsWith('.rules') && /docs\/ai\/board\/log\.mjs/.test(readFileSync(join(rules, f), 'utf8')));
  has ? ok('Codex rule allows log.mjs without an approval prompt') : console.log('  info  If Codex asks approval for each log command (so logging gets skipped), run: node docs/ai/board/setup.mjs --codex-rules');
} catch { /* ignore */ }

// .gitignore
const gi = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8') : '';
/docs\/ai\/state/.test(gi) && /docs\/ai\/progress\.md/.test(gi) ? ok('.gitignore covers docs/ai/state/ and docs/ai/progress.md') : warn('.gitignore does not cover docs/ai/state/ and docs/ai/progress.md. Run: node docs/ai/board/setup.mjs');

// Codex sessions
const homes = codexHomes();
if (!homes.length) {
  warn('Codex session folder not found (~/.codex/sessions). Only agent reports and wrapped commands will show. If Codex runs in WSL, run this inside WSL or set AI_BOARD_CODEX_HOME.');
} else {
  ok(`Codex home: ${homes.join(', ')}`);
  const files = listRollouts(homes, 24 * 3600 * 1000);
  let mine = 0;
  for (const f of files.slice(0, 20)) {
    try {
      const first = JSON.parse(readFirstLine(f.path));
      if (sameProject(first.payload?.cwd ?? first.cwd)) mine++;
    } catch { /* ignore */ }
  }
  mine ? ok(`${mine} recent Codex session(s) belong to this project`) : warn(`no Codex session from the last 24 h matches this folder (${files.length} other session file(s) found). Start a Codex task here, then run: npm run ai:probe`);
}

// Claude hooks (optional)
try {
  const s = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
  /board\/hook\.mjs/.test(JSON.stringify(s.hooks ?? {})) ? ok('Claude Code hooks installed') : console.log('  info  Claude Code hooks not installed (optional): node docs/ai/board/setup.mjs --claude-hooks');
} catch { console.log('  info  Claude Code hooks not installed (optional): node docs/ai/board/setup.mjs --claude-hooks'); }

console.log(failures ? `\n${failures} problem(s). Fix them first.` : '\nAll required checks passed.');
process.exit(failures ? 1 : 0);
