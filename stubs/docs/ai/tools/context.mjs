#!/usr/bin/env node
// Context pack: a small map of the project (stack, tables, models, routes, policies, controllers, pages, tests) so an agent
// reads ~2-3k tokens once instead of exploring the repo file by file. Built by a script (no model, no tokens), cached by fingerprint.
//   npm run ai:context                       build if the code changed, print one status line
//   npm run ai:context -- --find Booking     print only the lines that mention "Booking"  (use this before grepping the repo)
//   npm run ai:context -- --section tables   print one section: stack | tables | models | routes | policies | classes | pages | tests
//   npm run ai:context -- --max-tokens 6000 --no-artisan --print
// Output file: docs/ai/state/context.md (git-ignored). It is a MAP: open the real file before editing it, and trust the file over the map.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { ROOT, STATE_DIR, clip } from '../board/lib.mjs';
import { fingerprint } from './fp.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const OUT = join(STATE_DIR, 'context.md');
const maxChars = Number(val('max-tokens', 3500)) * 4;
const SKIP = new Set(['node_modules', 'vendor', '.git', 'storage', 'dist']);

const read = (rel) => { try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return ''; } };
const json = (rel) => { try { return JSON.parse(read(rel)); } catch { return {}; } };
function files(rel, ext, out = []) {
  let entries; try { entries = readdirSync(join(ROOT, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) { if (!SKIP.has(e.name)) files(r, ext, out); } else if (!ext || ext.includes(extname(e.name))) out.push(r);
  }
  return out;
}
const methodsOf = (src, vis = 'public') => [...src.matchAll(new RegExp(`${vis}\\s+(?:static\\s+)?function\\s+(\\w+)\\s*\\(`, 'g'))].map((m) => m[1]).filter((n) => !n.startsWith('__'));

// ---------- sections: each returns an array of short lines ----------
function stack() {
  const c = json('composer.json'); const p = json('package.json');
  const req = { ...c.require, ...c['require-dev'] }; const dep = { ...p.dependencies, ...p.devDependencies };
  const NAME = { 'laravel/framework': 'laravel', 'inertiajs/inertia-laravel': 'inertia', '@inertiajs/vue3': 'inertia-vue', '@inertiajs/react': 'inertia-react', 'spatie/laravel-permission': 'spatie-permission', 'pestphp/pest': 'pest', 'larastan/larastan': 'larastan', 'laravel/pint': 'pint', '@playwright/test': 'playwright' };
  const v = (o, k) => (o[k] ? `${NAME[k] || k.split('/').pop()} ${o[k]}` : null);
  const php = ['php', 'laravel/framework', 'inertiajs/inertia-laravel', 'livewire/livewire', 'spatie/laravel-permission', 'laravel/sanctum', 'laravel/reverb', 'laravel/horizon', 'pestphp/pest', 'larastan/larastan', 'laravel/pint'].map((k) => v(req, k)).filter(Boolean);
  const js = ['vue', '@inertiajs/vue3', 'react', '@inertiajs/react', 'typescript', 'tailwindcss', 'vite', '@playwright/test', 'laravel-echo'].map((k) => v(dep, k)).filter(Boolean);
  const out = [];
  if (php.length) out.push(`php: ${php.join(', ')}`);
  if (js.length) out.push(`js: ${js.join(', ')}`);
  const sc = Object.keys(p.scripts || {}).filter((k) => /^(dev|build|test|e2e|ai:|type|lint)/.test(k));
  if (sc.length) out.push(`npm scripts: ${sc.join(', ')}`);
  const env = read('phpunit.xml') || read('phpunit.xml.dist'); const m = env.match(/DB_CONNECTION"\s+value="(\w+)"/);
  if (m) out.push(`phpunit db: ${m[1]}${m[1] === 'sqlite' ? '  (MUST be mysql per AGENTS.md)' : ''}`);
  return out;
}

function tables() {
  const T = new Map(); const ORDER = [];
  for (const f of files('database/migrations', ['.php'])) {
    const src = read(f);
    for (const m of src.matchAll(/Schema::(create|table)\(\s*['"](\w+)['"]\s*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}\);/g)) {
      const [, kind, name, body] = m;
      if (!T.has(name)) { T.set(name, { cols: [], ts: false, sd: false }); ORDER.push(name); }
      const t = T.get(name);
      for (const c of body.matchAll(/\$table->(\w+)\(\s*(?:['"](\w+)['"])?/g)) {
        const [, type, col] = c;
        if (type === 'timestamps' || type === 'timestampsTz') { t.ts = true; continue; }
        if (type === 'softDeletes' || type === 'softDeletesTz') { t.sd = true; continue; }
        if (type === 'id' && !col) continue;
        if (type === 'rememberToken') continue;
        if (['index', 'unique', 'primary', 'foreign', 'fullText', 'dropColumn', 'dropForeign', 'dropIndex', 'constrained', 'cascadeOnDelete', 'nullable', 'default', 'after', 'comment'].includes(type)) continue;
        if (type === 'morphs' || type === 'nullableMorphs' || type === 'uuidMorphs') { if (col) t.cols.push(`${col}_id,${col}_type`); continue; }
        if (!col) continue;
        const short = { foreignId: 'fk', foreignUlid: 'fk', foreignUuid: 'fk', string: '', unsignedBigInteger: 'fk', bigInteger: '', integer: '', boolean: 'bool', timestamp: 'ts', dateTime: 'dt', text: 'text', json: 'json', decimal: 'dec', enum: 'enum' }[type];
        if (!t.cols.includes(col)) t.cols.push(short ? `${col}:${short}` : col);
      }
      if (kind === 'table' && /dropColumn|dropTable/.test(body)) t.note = 'altered';
    }
    for (const m of src.matchAll(/Schema::drop(?:IfExists)?\(\s*['"](\w+)['"]/g)) { T.delete(m[1]); }
  }
  const names = ORDER.filter((n) => T.has(n));
  return names.map((n) => { const t = T.get(n); const cols = t.cols.length > 16 ? `${t.cols.slice(0, 16).join(', ')}, …+${t.cols.length - 16}` : t.cols.join(', '); return `${n}(${cols})${t.sd ? ' +softdeletes' : ''}${t.ts ? '' : ' no-timestamps'}`; });
}

function models() {
  return files('app/Models', ['.php']).map((f) => {
    const src = read(f); const name = basename(f, '.php');
    const rels = [...src.matchAll(/function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*return\s+\$this->(hasMany|hasOne|belongsTo|belongsToMany|morphMany|morphOne|morphTo|morphToMany|hasManyThrough|hasOneThrough)\(\s*(?:(\w+)::class)?/g)].map((m) => `${m[2]}${m[3] ? `(${m[3]})` : ''}`);
    const traits = [...src.matchAll(/^\s*use\s+([A-Z]\w+(?:,\s*[A-Z]\w+)*);/gm)].flatMap((m) => m[1].split(/,\s*/)).filter((t) => !/^(Illuminate|App)/.test(t));
    const table = (src.match(/\$table\s*=\s*['"](\w+)['"]/) || [])[1];
    const scopes = methodsOf(src).filter((m) => /^scope[A-Z]/.test(m)).map((m) => m.replace(/^scope/, '').replace(/^./, (c) => c.toLowerCase()));
    const bits = [`${name}${table ? ` [${table}]` : ''}`];
    if (rels.length) bits.push(rels.slice(0, 8).join(' '));
    if (traits.length) bits.push(`uses ${traits.join(',')}`);
    if (scopes.length) bits.push(`scopes ${scopes.join(',')}`);
    return bits.join(' | ');
  });
}

function routesStatic() {
  const out = [];
  for (const f of files('routes', ['.php'])) {
    if (/channels|console/.test(f)) continue;
    const src = read(f);
    for (const m of src.matchAll(/Route::(get|post|put|patch|delete|any|resource|apiResource|inertia|view)\(\s*['"]([^'"]*)['"]\s*(?:,\s*(?:\[\s*([\w\\]+)::class\s*,\s*['"](\w+)['"]\s*\]|([\w\\]+)::class|['"]([\w.]+)['"]))?/g)) {
      const verb = m[1].toUpperCase().replace('APIRESOURCE', 'API-RESOURCE');
      const target = m[3] ? `${m[3].split('\\').pop()}@${m[4]}` : m[5] ? m[5].split('\\').pop() : m[6] || '';
      out.push(`${verb} /${m[2].replace(/^\//, '')}${target ? ` -> ${target}` : ''}  (${basename(f, '.php')})`);
    }
  }
  return out;
}

function routesArtisan() {
  if (flag('no-artisan') || !existsSync(join(ROOT, 'vendor/autoload.php')) || !existsSync(join(ROOT, 'artisan'))) return null;
  const r = spawnSync('php', ['artisan', 'route:list', '--json', '--except-vendor'], { cwd: ROOT, encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8e6 });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const list = JSON.parse(r.stdout);
    if (!Array.isArray(list) || !list.length) return null;
    return list.map((x) => {
      const mw = (x.middleware || []).filter((m) => !/^(web|api)$/.test(m)).map((m) => String(m).replace(/^Illuminate\\Auth\\Middleware\\Authenticate/, 'auth').split('\\').pop());
      const act = String(x.action || '').replace(/^App\\Http\\Controllers\\/, '').replace(/Controller@/, 'Controller@');
      return `${String(x.method).replace(/\|HEAD/, '')} /${String(x.uri).replace(/^\//, '')}${act && act !== 'Closure' ? ` -> ${act}` : ''}${mw.length ? ` [${[...new Set(mw)].join(',')}]` : ''}`;
    });
  } catch { return null; }
}

function policies() { return files('app/Policies', ['.php']).map((f) => `${basename(f, '.php')}: ${methodsOf(read(f)).join(',')}`); }

function classes() {
  const out = [];
  const group = (label, dir, withMethods) => {
    const fs = files(dir, ['.php']); if (!fs.length) return;
    out.push(`${label}: ${fs.map((f) => { const n = basename(f, '.php'); if (!withMethods) return n; const m = methodsOf(read(f)); return m.length ? `${n}(${m.slice(0, 8).join(',')})` : n; }).join(', ')}`);
  };
  group('controllers', 'app/Http/Controllers', true);
  group('services', 'app/Services', true); group('actions', 'app/Actions', false);
  group('requests', 'app/Http/Requests', false); group('resources', 'app/Http/Resources', false);
  group('jobs', 'app/Jobs', false); group('events', 'app/Events', false); group('listeners', 'app/Listeners', false);
  group('middleware', 'app/Http/Middleware', false); group('enums', 'app/Enums', false);
  return out;
}

function pages() {
  const out = [];
  const pg = files('resources/js/Pages', ['.vue', '.tsx', '.jsx', '.ts']).map((f) => f.replace('resources/js/Pages/', '').replace(/\.\w+$/, ''));
  if (pg.length) out.push(`inertia pages (${pg.length}): ${pg.join(', ')}`);
  const comps = files('resources/js/Components', ['.vue', '.tsx', '.jsx']).map((f) => basename(f).replace(/\.\w+$/, ''));
  if (comps.length) out.push(`components (${comps.length}): ${comps.join(', ')}`);
  const comp = files('resources/js/composables', ['.ts', '.js']).map((f) => basename(f).replace(/\.\w+$/, ''));
  if (comp.length) out.push(`composables: ${comp.join(', ')}`);
  const blade = files('resources/views', ['.php']).map((f) => f.replace('resources/views/', '').replace(/\.blade\.php$/, '').replace(/\.php$/, '')).filter((f) => !/^(vendor|errors)/.test(f));
  if (blade.length) out.push(`blade views (${blade.length}): ${blade.slice(0, 40).join(', ')}${blade.length > 40 ? ', …' : ''}`);
  return out;
}

function tests() {
  const out = [];
  const feature = files('tests/Feature', ['.php']).map((f) => basename(f, '.php')); const unit = files('tests/Unit', ['.php']).map((f) => basename(f, '.php'));
  if (feature.length) out.push(`feature (${feature.length}): ${feature.join(', ')}`);
  if (unit.length) out.push(`unit (${unit.length}): ${unit.join(', ')}`);
  const e2e = files('tests/e2e', ['.ts']).filter((f) => /\.spec\./.test(f)).map((f) => basename(f).replace(/\.spec\.ts$/, ''));
  if (e2e.length) out.push(`playwright (${e2e.length}): ${e2e.join(', ')}`);
  return out;
}

// ---------- build, with a size budget ----------
function build() {
  let routes = routesArtisan(); const src = routes ? 'php artisan route:list' : 'static scan, route groups/prefixes NOT resolved; run php artisan route:list for exact paths';
  if (!routes) routes = routesStatic();
  const secs = [
    ['stack', 'stack', stack()], ['tables', 'tables (from migrations)', tables()], ['models', 'models (relations | traits | scopes)', models()],
    ['routes', `routes (${src})`, routes], ['policies', 'policies', policies()], ['classes', 'classes', classes()], ['pages', 'frontend', pages()], ['tests', 'tests', tests()],
  ].filter(([, , l]) => l.length);
  const share = Math.floor((maxChars - 600) / Math.max(1, secs.length));
  // sections that are short give their unused room to the long ones
  const sizes = secs.map(([, , l]) => l.join('\n').length + 40); let spare = 0; let big = 0;
  sizes.forEach((s) => { if (s < share) spare += share - s; else big++; });
  const cap = share + (big ? Math.floor(spare / big) : 0);
  const out = []; const meta = {};
  for (const [id, title, lines] of secs) {
    const kept = []; let used = 0;
    for (const l of lines) { if (used + l.length + 1 > cap && kept.length) break; kept.push(clip(l, 400)); used += l.length + 1; }
    const hidden = lines.length - kept.length;
    out.push(`## ${id}${title === id ? '' : `: ${title}`}${hidden ? ` [showing ${kept.length} of ${lines.length}]` : ''}`, ...kept, ...(hidden ? [`…+${hidden} more: npm run ai:context -- --find <name>  or  rg in the folder`] : []), '');
    meta[id] = lines.length;
  }
  return { text: out.join('\n'), meta };
}

function ensure() {
  const fp = fingerprint(['context']);
  const old = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  const cur = (old.match(/^<!-- fp:(\w+) max:(\d+) -->/m) || []);
  if (cur[1] === fp && Number(cur[2]) === maxChars && !flag('rebuild')) return { text: old, built: false };
  const { text } = build();
  const head = `<!-- fp:${fp} max:${maxChars} -->\n# Project map (generated ${new Date().toISOString().slice(0, 16)}Z). A map, not the code: open the real file before editing; if the map and the file disagree, the file wins.\n\n`;
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(OUT, head + text);
  return { text: head + text, built: true };
}

const { text, built } = ensure();
const approx = Math.round(text.length / 4);
const find = val('find', null); const section = val('section', null);
if (find) {
  const q = find.toLowerCase(); let h = ''; const hits = [];
  for (const l of text.split('\n')) { if (l.startsWith('## ')) { h = l.slice(3).split(':')[0]; continue; } if (l && !l.startsWith('<!--') && !l.startsWith('#') && l.toLowerCase().includes(q)) hits.push(`[${h}] ${l}`); }
  console.log(hits.length ? hits.slice(0, 40).join('\n') + (hits.length > 40 ? `\n…+${hits.length - 40} more, narrow the term` : '') : `no match for "${find}" in the map. It may not exist yet, or search the repo: rg -n "${find}" app routes resources database tests`);
} else if (section) {
  const parts = text.split(/^(?=## )/m); const m = [parts.find((x) => new RegExp(`^## ${section}\\b`).test(x))].filter(Boolean);
  console.log(m.length ? m[0].trimEnd() : `no section "${section}". Sections: ${[...text.matchAll(/^## (\w+)/gm)].map((x) => x[1]).join(', ')}`);
} else if (flag('print')) console.log(text);
else console.log(`context ${built ? 'built' : 'fresh'}: ${relative(ROOT, OUT).replace(/\\/g, '/')} (${text.split('\n').length} lines, ~${approx} tokens). Prefer: npm run ai:context -- --find <name>  (reads only matching lines)`);
