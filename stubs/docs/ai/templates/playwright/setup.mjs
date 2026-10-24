#!/usr/bin/env node
// One-command Playwright setup. Run from the Laravel project root:
//   node docs/ai/templates/playwright/setup.mjs [--force] [--skip-install] [--no-db]
// It is safe to run again: existing files are kept unless --force. Every external command has a timeout.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelPath, installedChannel } from './tests/e2e/support/browser.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const root = process.cwd();
const rel = (p) => p.replace(root, '.');
const notes = [];
let failed = false;

const step = (m) => console.log(`\n== ${m}`);
const ok = (m) => console.log(`  ok    ${m}`);
const skip = (m) => console.log(`  skip  ${m}`);
const fail = (m, fix) => { failed = true; console.log(`  FAIL  ${m}${fix ? `\n        fix: ${fix}` : ''}`); };

function run(cmd, cmdArgs, { timeout = 120000, quiet = true } = {}) {
  const win = process.platform === 'win32' && /^(npm|npx)$/.test(cmd);
  const r = spawnSync(win ? `${cmd}.cmd` : cmd, cmdArgs, { cwd: root, encoding: 'utf8', timeout, shell: win, stdio: quiet ? 'pipe' : 'inherit' });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), timedOut: r.error?.code === 'ETIMEDOUT' };
}

function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/(^|\s+)#.*$/, '').replace(/^["']|["']$/g, '');
  }
  return out;
}

function setEnvKey(file, key, value) {
  let text = readFileSync(file, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n*$/, '\n')}${key}=${value}\n`;
  writeFileSync(file, text);
}

function copy(from, to) {
  const dest = join(root, to);
  if (existsSync(dest) && !force) return skip(`${to} exists`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(here, from), dest);
  ok(`${to}`);
}

console.log('Playwright setup');

step('Project');
if (!existsSync(join(root, 'artisan')) || !existsSync(join(root, 'package.json'))) {
  console.log('  FAIL  run this from the Laravel project root (artisan and package.json must be here).');
  process.exit(1);
}
ok('Laravel project found');

step('Files');
copy('playwright.config.ts', 'playwright.config.ts');
for (const f of ['env.ts', 'ports.ts', 'browser.mjs', 'doctor.mjs']) copy(`tests/e2e/support/${f}`, `tests/e2e/support/${f}`);
copy('tests/e2e/global-setup.ts', 'tests/e2e/global-setup.ts');
copy('tests/e2e/specs/smoke.spec.ts', 'tests/e2e/specs/smoke.spec.ts');
copy('E2ESeeder.php', 'database/seeders/E2ESeeder.php');

step('package.json scripts');
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.scripts ??= {};
const wanted = {
  e2e: 'playwright test',
  'e2e:ui': 'playwright test --ui',
  'e2e:watch': 'playwright test --headed --workers=1',
  'e2e:report': 'playwright show-report',
  'e2e:doctor': 'node tests/e2e/support/doctor.mjs',
  'build:e2e': 'vite build --mode e2e',
};
// When the AI board is installed, `npm run e2e` is logged by a script (start, end, exit code, stall), not by the agent's memory.
if (existsSync(join(root, 'docs/ai/board/wrap.mjs'))) {
  wanted['e2e:raw'] = 'playwright test';
  wanted.e2e = 'node docs/ai/board/wrap.mjs --agent qa-playwright --label e2e -- npm run e2e:raw --';
}
for (const [name, cmd] of Object.entries(wanted)) {
  if (pkg.scripts[name] && !force) skip(`script ${name} exists`);
  else if (name === 'build:e2e' && !pkg.scripts.build) skip('build:e2e (no Vite build script in this project)');
  else { pkg.scripts[name] = cmd; ok(`script ${name}`); }
}
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

step('Dependencies');
const have = { ...pkg.dependencies, ...pkg.devDependencies };
const missing = ['@playwright/test', '@axe-core/playwright'].filter((d) => !have[d]);
if (args.has('--skip-install')) skip('install (--skip-install)');
else if (!missing.length) ok('@playwright/test and @axe-core/playwright already installed');
else {
  const r = run('npm', ['install', '--save-dev', ...missing], { timeout: 300000 });
  r.status === 0 ? ok(`installed ${missing.join(', ')}`) : fail(`npm install failed${r.timedOut ? ' (timed out)' : ''}:\n${r.out.slice(-400)}`, 'check the network or registry, then re-run');
}

step('.env.e2e');
const envFile = join(root, '.env.e2e');
if (existsSync(envFile) && !force) skip('.env.e2e exists');
else {
  const app = parseEnv(join(root, '.env'));
  const base = (app.DB_DATABASE || basename(root)).replace(/(_testing|_e2e)$/, '').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
  let text = readFileSync(join(here, '.env.e2e.example'), 'utf8');
  const hasReverb = existsSync(join(root, 'composer.json')) && /laravel\/reverb/.test(readFileSync(join(root, 'composer.json'), 'utf8'));
  writeFileSync(envFile, text);
  setEnvKey(envFile, 'APP_NAME', `"${app.APP_NAME || base} E2E"`);
  setEnvKey(envFile, 'DB_HOST', app.DB_HOST && app.DB_HOST !== 'localhost' ? app.DB_HOST : '127.0.0.1');
  setEnvKey(envFile, 'DB_PORT', app.DB_PORT || '3306');
  setEnvKey(envFile, 'DB_DATABASE', `${base}_e2e`);
  setEnvKey(envFile, 'DB_USERNAME', app.DB_USERNAME || 'root');
  setEnvKey(envFile, 'DB_PASSWORD', app.DB_PASSWORD ?? '');
  if (!hasReverb) setEnvKey(envFile, 'BROADCAST_CONNECTION', 'log');
  const key = run('php', ['artisan', 'key:generate', '--show'], { timeout: 30000 });
  const keyLine = key.out.split(/\r?\n/).find((l) => l.startsWith('base64:'));
  keyLine ? setEnvKey(envFile, 'APP_KEY', keyLine) : fail('could not generate APP_KEY', 'run: php artisan key:generate --show   and paste it into .env.e2e');
  ok(`.env.e2e written (database ${base}_e2e${hasReverb ? ', Reverb on' : ', no Reverb'})`);
}
if (!/\.env\.e2e/.test(existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : '')) {
  const add = ['.env.e2e', '/playwright/.auth/', '/playwright-report/', '/test-results/'].join('\n');
  writeFileSync(join(root, '.gitignore'), `${existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8').replace(/\n*$/, '\n') : ''}${add}\n`);
  ok('.gitignore updated');
}

step('Database');
if (args.has('--no-db')) skip('database (--no-db)');
else {
  const doctor = join(here, '..', 'laravel', 'test-doctor.php');
  if (!existsSync(doctor)) fail('docs/ai/templates/laravel/test-doctor.php not found', 'run: php artisan ai-team:install --docs');
  else {
    const r = run('php', [doctor, '--env=.env.e2e', '--suffix=_e2e', '--create'], { timeout: 30000 });
    console.log(r.out.split('\n').filter((l) => /OK|FAIL|fix:|WARN/.test(l)).join('\n'));
    if (r.status !== 0) { failed = true; }
  }
}

step('Browser');
const pw = run('npx', ['--no-install', 'playwright', 'install', 'chromium'], { timeout: 240000 });
if (pw.status === 0) ok("Playwright's Chromium is installed");
else {
  const sys = installedChannel();
  if (sys) {
    setEnvKey(envFile, 'E2E_BROWSER_CHANNEL', sys.channel);
    ok(`Chromium download failed${pw.timedOut ? ' (timed out)' : ''}; using the installed ${sys.channel} (${sys.path}). Saved E2E_BROWSER_CHANNEL=${sys.channel} in .env.e2e`);
    notes.push(`Chromium download was unavailable, so the suite uses the installed ${sys.channel}.`);
  } else fail('Chromium could not be downloaded and no Chrome/Edge is installed', 'install Google Chrome or Edge, or allow the Playwright download, then re-run');
}

step('Preflight');
const doc = run('node', ['tests/e2e/support/doctor.mjs'], { timeout: 60000 });
console.log(doc.out);
if (doc.status !== 0) failed = true;

console.log('\n== Next');
for (const n of notes) console.log(`  note: ${n}`);
console.log('  1. Adapt database/seeders/E2ESeeder.php and the paths in tests/e2e/specs/smoke.spec.ts to your app.');
console.log('  2. If the app has a Vite frontend: npm run build:e2e');
console.log('  3. Run: npm run e2e');
console.log(failed ? '\nSetup finished with problems (see FAIL above). Fix them, then re-run this script.' : '\nSetup finished.');
process.exit(failed ? 1 : 0);
