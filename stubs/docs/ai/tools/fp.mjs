// Shared by gate.mjs, context.mjs and log.mjs: a cheap fingerprint of the files a check depends on (path + mtime + size).
// Same fingerprint = nothing relevant changed = the last result is still true, so nothing needs to be re-run or re-read.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, STATE_DIR } from '../board/lib.mjs';

const SKIP = new Set(['node_modules', 'vendor', '.git', 'storage', 'playwright-report', 'test-results', 'dist', '.vite']);

export const GROUPS = {
  php: { dirs: ['app', 'routes', 'database', 'config', 'bootstrap', 'tests', 'lang'], files: ['artisan', 'composer.json', 'composer.lock', 'phpunit.xml', 'phpunit.xml.dist', 'phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon', 'pint.json'] },
  js: { dirs: ['resources'], files: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'vite.config.js', 'vite.config.ts', 'tsconfig.json', 'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', 'components.json'] },
  e2e: { dirs: ['tests/e2e'], files: ['playwright.config.ts', '.env.e2e'] },
  composer: { dirs: [], files: ['composer.json', 'composer.lock'] },
  npm: { dirs: [], files: ['package.json', 'package-lock.json'] },
  context: { dirs: ['app', 'routes', 'database/migrations', 'database/seeders', 'resources/js', 'resources/views', 'tests'], files: ['composer.json', 'package.json'] },
};

function collect(dir, out) {
  let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) collect(p, out); continue; }
    if (!e.isFile()) continue;
    try { const s = statSync(p); out.push(`${p.slice(ROOT.length)}:${Math.round(s.mtimeMs)}:${s.size}`); } catch { /* vanished */ }
  }
}

export function fingerprint(groups) {
  const out = [];
  for (const g of groups) {
    const spec = GROUPS[g]; if (!spec) continue;
    for (const d of spec.dirs) collect(join(ROOT, d), out);
    for (const f of spec.files) { try { const s = statSync(join(ROOT, f)); out.push(`/${f}:${Math.round(s.mtimeMs)}:${s.size}`); } catch { /* absent */ } }
  }
  return createHash('sha1').update([...new Set(out)].sort().join('\n')).digest('hex').slice(0, 16);
}

export const GATE_FILE = join(STATE_DIR, 'gate.json');
export const GATE_LOGS = join(STATE_DIR, 'gate');
export const projectFp = () => fingerprint(['php', 'js', 'e2e']);

export function readGate() { try { return JSON.parse(readFileSync(GATE_FILE, 'utf8')); } catch { return null; } }

// Is there a green gate for exactly the code that exists now?
export function gateStatus() {
  const g = readGate();
  if (!g) return { state: 'none', detail: 'the quality gate has never been run' };
  if (g.result !== 'pass') return { state: 'fail', detail: `the last gate run did not pass (${g.failed || g.result})` };
  if (g.mode === 'quick') return { state: 'quick', detail: 'only a --quick gate passed; run the default gate (npm run ai:gate)' };
  if (g.fp !== projectFp()) return { state: 'stale', detail: 'code changed after the last green gate run' };
  return { state: 'pass', detail: `green at ${g.t}` };
}

export const hasFile = (rel) => existsSync(join(ROOT, rel));
