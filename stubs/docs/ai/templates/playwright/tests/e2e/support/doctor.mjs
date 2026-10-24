#!/usr/bin/env node
// Preflight for Playwright E2E. Run: npm run e2e:doctor
// Finds the usual reasons a run stalls or fails BEFORE you start it. Never hangs: every check has a short timeout.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { resolve } from 'node:path';
import { bundledChromiumPath, channelPath, ffmpegAvailable, installedChannel } from './browser.mjs';

let failures = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const warn = (m) => console.log(`  WARN  ${m}`);
const fail = (m, fix) => { failures++; console.log(`  FAIL  ${m}\n        fix: ${fix}`); };

function parseEnv(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (!/^(["']).*\1$/.test(v)) v = v.replace(/(^|\s+)#.*$/, '');
    out[m[1]] = v.replace(/^["']|["']$/g, '');
  }
  return out;
}

function tcp(host, port, ms = 3000) {
  return new Promise((done) => {
    const s = net.connect({ host, port });
    const finish = (result) => { s.destroy(); done(result); };
    s.setTimeout(ms, () => finish(false));
    s.once('connect', () => finish(true));
    s.once('error', () => finish(false));
  });
}

function portFree(port) {
  return new Promise((done) => {
    const s = net.createServer();
    s.once('error', () => done(false));
    s.listen(port, '127.0.0.1', () => s.close(() => done(true)));
  });
}

console.log('E2E preflight\n');

// Node
const major = Number(process.versions.node.split('.')[0]);
major >= 18 ? ok(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} is too old`, 'install Node 18 or newer');

// Playwright installed locally (plain "npx playwright" can wait for a download prompt and look like a hang)
existsSync(resolve('node_modules/@playwright/test'))
  ? ok('@playwright/test is installed')
  : fail('@playwright/test is not installed', 'run: npm install --save-dev @playwright/test   (then always use "npm run e2e" or "npx --no-install playwright")');

// Browser: the downloaded Chromium must match the INSTALLED Playwright version, otherwise launch fails
// (an old chromium-XXXX folder from another version does not count). A system Chrome/Edge is a valid fallback.
const envFileForBrowser = resolve('.env.e2e');
const wanted = process.env.E2E_BROWSER_CHANNEL || (existsSync(envFileForBrowser) ? parseEnv(envFileForBrowser).E2E_BROWSER_CHANNEL : '') || '';
const bundled = existsSync(resolve('node_modules/@playwright/test')) ? bundledChromiumPath() : null;
if (wanted) {
  const p = channelPath(wanted);
  p ? ok(`browser channel "${wanted}" found at ${p}`) : fail(`browser channel "${wanted}" is not installed`, 'install that browser, or remove E2E_BROWSER_CHANNEL to use the downloaded Chromium');
} else if (bundled) {
  ok('Playwright Chromium is downloaded for this Playwright version');
} else {
  const sys = installedChannel();
  sys
    ? ok(`Playwright Chromium is not downloaded; the installed ${sys.channel} will be used automatically (${sys.path})`)
    : fail('no browser available (Playwright Chromium missing for this version, and no Chrome/Edge found)',
        'run: npx --no-install playwright install chromium. If the download is blocked by your network, install Google Chrome or Edge instead; the config picks it up by itself.');
}

ffmpegAvailable() ? ok('ffmpeg is available (video recording on)') : warn('ffmpeg is not downloaded: video recording is turned off. Traces and screenshots still work. To enable: npx --no-install playwright install ffmpeg');

// PHP
try { execFileSync('php', ['-v'], { stdio: 'ignore', timeout: 5000 }); ok('php is on PATH'); }
catch { fail('php is not on PATH', 'add PHP to PATH (Laragon: Menu > PHP > add to PATH) and reopen the terminal'); }

// .env.e2e
const envFile = resolve('.env.e2e');
if (!existsSync(envFile)) {
  fail('.env.e2e is missing', 'copy docs/ai/templates/playwright/.env.e2e.example to .env.e2e and adjust it');
} else {
  const env = parseEnv(envFile);
  ok('.env.e2e found');
  env.DB_CONNECTION === 'mysql' ? ok('DB_CONNECTION=mysql') : fail(`DB_CONNECTION is "${env.DB_CONNECTION}"`, 'set DB_CONNECTION=mysql (SQLite is not allowed)');
  /_e2e$/.test(env.DB_DATABASE ?? '') ? ok(`DB_DATABASE=${env.DB_DATABASE}`) : fail(`DB_DATABASE "${env.DB_DATABASE}" does not end with _e2e`, 'use a database named like app_e2e');
  env.APP_ENV === 'e2e' ? ok('APP_ENV=e2e') : fail(`APP_ENV is "${env.APP_ENV}"`, 'set APP_ENV=e2e');
  env.APP_KEY ? ok('APP_KEY is set') : fail('APP_KEY is empty', 'run: php artisan key:generate --show   and paste it into .env.e2e');
  if ((env.DB_HOST ?? '') === 'localhost') warn('DB_HOST=localhost can be slow or hang on Windows (IPv6 / socket lookup). Use 127.0.0.1.');

  // MySQL reachable
  const host = env.DB_HOST || '127.0.0.1', port = Number(env.DB_PORT || 3306);
  (await tcp(host, port))
    ? ok(`MySQL is reachable at ${host}:${port}`)
    : fail(`MySQL is not reachable at ${host}:${port} (3 s timeout)`, 'start MySQL (Laragon: Start All) and check DB_HOST / DB_PORT. Tests would stall without this.');

  // Ports
  const preferred = Number(new URL(env.APP_URL || 'http://127.0.0.1:8001').port || 8001);
  (await portFree(preferred))
    ? ok(`port ${preferred} is free`)
    : warn(`port ${preferred} is busy. The suite will pick the next free port automatically. To see what holds it: Windows "Get-NetTCPConnection -LocalPort ${preferred} | Select OwningProcess" then "Stop-Process -Id <id>"; Linux/macOS "lsof -i :${preferred}".`);
  if (env.BROADCAST_CONNECTION === 'reverb') {
    const rp = Number(env.REVERB_SERVER_PORT || env.REVERB_PORT || 8080);
    (await portFree(rp)) ? ok(`Reverb port ${rp} is free`) : fail(`Reverb port ${rp} is busy`, `stop the process using it, or change REVERB_SERVER_PORT / REVERB_PORT in .env.e2e`);
  }
}

if (existsSync(resolve('package.json')) && (existsSync(resolve('vite.config.js')) || existsSync(resolve('vite.config.ts')))) {
  existsSync(resolve('public/build/manifest.json')) ? ok('built frontend assets found (public/build)') : warn('public/build is missing: run "npm run build:e2e" so pages render with their CSS/JS');
}

console.log(failures ? `\n${failures} problem(s). Fix them before running the suite; do not retry the run until they are fixed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
