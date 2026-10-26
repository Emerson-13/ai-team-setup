// Shared by gate.mjs, context.mjs and log.mjs: a fingerprint of the files a check depends on.
// Same fingerprint = nothing relevant changed = the last result is still true, so nothing needs to be re-run or re-read.
// v1.0.14: the fingerprint is based on file CONTENT (sha1), with path+size as a cheap pre-key, so a touched-but-identical file
// does not invalidate the cache, and a change to the gate itself, .env.testing, phpunit.xml or the lock files always does.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, STATE_DIR } from '../board/lib.mjs';

const SKIP = new Set(['node_modules', 'vendor', '.git', 'storage', 'playwright-report', 'test-results', 'dist', '.vite']);
const MAX_HASH_BYTES = 2 * 1024 * 1024; // larger files (dumps, bundles) are keyed by size+mtime instead of content

// Files that change what a check MEANS, so every group depends on them.
const GATE_SELF = ['docs/ai/tools/gate.mjs', 'docs/ai/tools/fp.mjs', 'docs/ai/templates/laravel/test-doctor.php'];

export const GROUPS = {
  php: { dirs: ['app', 'routes', 'database', 'config', 'bootstrap', 'tests', 'lang'], files: ['artisan', 'composer.json', 'composer.lock', 'phpunit.xml', 'phpunit.xml.dist', '.env.testing', 'phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon', 'pint.json', ...GATE_SELF] },
  js: { dirs: ['resources'], files: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'vite.config.js', 'vite.config.ts', 'tsconfig.json', 'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', 'components.json', ...GATE_SELF] },
  e2e: { dirs: ['tests/e2e'], files: ['playwright.config.ts', 'playwright.config.js', '.env.e2e', ...GATE_SELF] },
  composer: { dirs: [], files: ['composer.json', 'composer.lock'] },
  npm: { dirs: [], files: ['package.json', 'package-lock.json'] },
  context: { dirs: ['app', 'routes', 'database/migrations', 'database/seeders', 'resources/js', 'resources/views', 'tests'], files: ['composer.json', 'package.json'] },
};

function entry(p, rel, out) {
  try {
    const s = statSync(p);
    if (s.size > MAX_HASH_BYTES) { out.push(`${rel}:big:${Math.round(s.mtimeMs)}:${s.size}`); return; }
    out.push(`${rel}:${createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 12)}:${s.size}`);
  } catch { /* vanished */ }
}

function collect(dir, out) {
  let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) collect(p, out); continue; }
    if (e.isFile()) entry(p, p.slice(ROOT.length).replace(/\\/g, '/'), out);
  }
}

export function fingerprint(groups, extra = '') {
  const out = [];
  for (const g of groups) {
    const spec = GROUPS[g]; if (!spec) continue;
    for (const d of spec.dirs) collect(join(ROOT, d), out);
    for (const f of spec.files) entry(join(ROOT, f), `/${f}`, out);
  }
  return createHash('sha1').update([...new Set(out)].sort().join('\n')).update(String(extra)).digest('hex').slice(0, 16);
}

export const GATE_FILE = join(STATE_DIR, 'gate.json');
export const GATE_LOGS = join(STATE_DIR, 'gate');
export const projectFp = () => fingerprint(['php', 'js', 'e2e']);

export function readGate() { try { return JSON.parse(readFileSync(GATE_FILE, 'utf8')); } catch { return null; } }

// Is there a green gate for exactly the code that exists now?
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export function gateStatus() {
  const g = readGate();
  if (!g) return { state: 'none', detail: 'the quality gate has never been run' };
  // a run that was killed before it could write its result leaves a "running" marker whose gate process is gone
  try {
    const live = JSON.parse(readFileSync(join(STATE_DIR, 'gate-live.json'), 'utf8'));
    if (live.status === 'running' && live.gatePid && !pidAlive(live.gatePid)) return { state: 'cancelled', detail: `a gate run was interrupted at step ${live.step} (process stopped by hand or killed). Run: npm run ai:gate` };
  } catch { /* no live marker */ }
  if (g.failedStatus === 'cancelled') return { state: 'cancelled', detail: `the last gate run was cancelled at ${g.failed}; a stopped run is not a pass. Run: npm run ai:gate` };
  if (g.result !== 'pass') return { state: 'fail', detail: `the last gate run did not pass (${g.failed || g.result}${g.failedStatus ? `, ${g.failedStatus}` : ''})` };
  if (g.mode === 'quick') return { state: 'quick', detail: 'only a --quick gate passed; run the default gate (npm run ai:gate)' };
  if (g.fp !== projectFp()) return { state: 'stale', detail: 'code changed after the last green gate run' };
  return { state: 'pass', detail: `green at ${g.t}` };
}

// Last green gate (any mode): when and for which code, shown by `ai:gate -- --status` and the board.
export function lastGreen() {
  const g = readGate();
  if (!g || g.result !== 'pass') return null;
  return { t: g.t, mode: g.mode, fp: g.fp, current: g.fp === projectFp() };
}

export const hasFile = (rel) => existsSync(join(ROOT, rel));
