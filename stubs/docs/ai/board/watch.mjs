// File-change watcher for the board. It needs no agent and no tool support: if a file in the project changes, it shows.
// Polls modification times (no native watcher, so it also works on network drives, WSL paths and Windows).
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, clip } from './lib.mjs';

const WATCH = ['app', 'routes', 'database', 'resources', 'tests', 'config', 'bootstrap', 'docs', 'lang'];
const ROOT_FILES = new Set(['composer.json', 'package.json', 'vite.config.js', 'vite.config.ts', 'playwright.config.ts', 'phpunit.xml', 'tailwind.config.js', 'tailwind.config.ts']);
const SKIP_DIR = new Set(['node_modules', 'vendor', '.git', 'storage', 'playwright-report', 'test-results', '.vite', 'dist']);
const SKIP_FILE = /(^|\/)(docs\/ai\/progress\.md|\.DS_Store|Thumbs\.db)$|\.(log|tmp|swp|map)$|~$/;
const MAX_FILES = 40000;

export class FileWatch {
  constructor(root = ROOT, { minGapMs = 2500, keep = 120 } = {}) { this.root = root; this.minGapMs = minGapMs; this.keep = keep; this.seen = null; this.events = []; this.at = 0; this.count = 0; this.truncated = false; }

  scan() {
    const out = new Map(); let n = 0;
    const walk = (dir) => {
      let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (n > MAX_FILES) { this.truncated = true; return; }
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (!SKIP_DIR.has(e.name) && relative(this.root, p).replace(/\\/g, '/') !== 'docs/ai/state' && relative(this.root, p).replace(/\\/g, '/') !== 'docs/ai/board') walk(p); continue; }
        if (!e.isFile()) continue;
        const rel = relative(this.root, p).replace(/\\/g, '/');
        if (SKIP_FILE.test(rel)) continue;
        try { const s = statSync(p); out.set(rel, `${s.mtimeMs}:${s.size}`); n++; } catch { /* vanished */ }
      }
    };
    for (const d of WATCH) walk(join(this.root, d));
    for (const f of ROOT_FILES) { try { const s = statSync(join(this.root, f)); out.set(f, `${s.mtimeMs}:${s.size}`); } catch { /* absent */ } }
    return out;
  }

  poll() {
    const now = Date.now();
    if (this.seen && now - this.at < this.minGapMs) return this.snapshot();
    this.at = now;
    const cur = this.scan();
    this.count = cur.size;
    if (this.seen) {
      const changes = [];
      for (const [f, sig] of cur) { const old = this.seen.get(f); if (old === undefined) changes.push(['created', f]); else if (old !== sig) changes.push(['edited', f]); }
      for (const f of this.seen.keys()) if (!cur.has(f)) changes.push(['deleted', f]);
      const ts = new Date().toISOString();
      if (changes.length > 8) this.events.push({ ts, kind: 'file', text: `${changes.length} files changed (${changes.slice(0, 3).map((c) => c[1]).join(', ')}, ...)`, data: { files: changes.map((c) => c[1]) } });
      else for (const [what, f] of changes) this.events.push({ ts, kind: 'file', text: `${what} ${clip(f, 160)}`, data: { files: [f] } });
      if (this.events.length > this.keep) this.events = this.events.slice(-this.keep);
    }
    this.seen = cur;
    return this.snapshot();
  }

  snapshot() { return { events: this.events, lastTs: this.events.length ? this.events[this.events.length - 1].ts : '', files: this.count, truncated: this.truncated }; }
}
