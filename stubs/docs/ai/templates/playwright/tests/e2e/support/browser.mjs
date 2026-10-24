// Finds a usable browser. Shared by playwright.config.ts, doctor.mjs and setup.mjs.
// Playwright's own Chromium download can be blocked by a network or firewall. When it is missing,
// an installed Google Chrome or Microsoft Edge is used instead (Playwright "channel").
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const env = process.env;
const CANDIDATES = {
  chrome: [
    env['PROGRAMFILES'] && `${env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
    env['PROGRAMFILES(X86)'] && `${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    env['LOCALAPPDATA'] && `${env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
  ],
  msedge: [
    env['PROGRAMFILES'] && `${env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    env['PROGRAMFILES(X86)'] && `${env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/opt/microsoft/msedge/msedge',
    '/usr/bin/microsoft-edge',
  ],
};

/** Path of Playwright's downloaded Chromium for the INSTALLED Playwright version, or null if it is not there. */
export function bundledChromiumPath() {
  try {
    const path = createRequire(resolve('package.json'))('playwright-core').chromium.executablePath();
    return path && existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

/** First installed system browser: { channel: 'chrome' | 'msedge', path } or null. */
export function installedChannel() {
  for (const [channel, paths] of Object.entries(CANDIDATES)) {
    const path = paths.filter(Boolean).find((p) => existsSync(p));
    if (path) return { channel, path };
  }
  return null;
}

/** Path to use for a named channel, or null. */
export function channelPath(channel) {
  return (CANDIDATES[channel] ?? []).filter(Boolean).find((p) => existsSync(p)) ?? null;
}

/**
 * Which Playwright channel to use. `explicit` (from E2E_BROWSER_CHANNEL) wins.
 * Otherwise: undefined (use the downloaded Chromium) when it exists, else the installed Chrome/Edge, else undefined.
 */
export function pickChannel(explicit) {
  if (explicit) return explicit;
  if (bundledChromiumPath()) return undefined;
  return installedChannel()?.channel;
}

/**
 * Video recording needs Playwright's ffmpeg download. When downloads are blocked it is missing, and every test that
 * records video then fails with "Video rendering requires ffmpeg binary". So video is only enabled when ffmpeg is there.
 */
export function ffmpegAvailable() {
  try {
    const browsersJson = JSON.parse(readFileSync(resolve('node_modules/playwright-core/browsers.json'), 'utf8'));
    const revision = browsersJson.browsers.find((b) => b.name === 'ffmpeg')?.revision;
    if (!revision) return false;
    const roots = [
      process.env.PLAYWRIGHT_BROWSERS_PATH,
      join(homedir(), '.cache', 'ms-playwright'),
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'),
      join(homedir(), 'Library', 'Caches', 'ms-playwright'),
      (() => { const c = bundledChromiumPath(); return c ? dirname(dirname(dirname(c))) : null; })(),
    ].filter(Boolean);
    return roots.some((r) => existsSync(join(r, `ffmpeg-${revision}`)));
  } catch {
    return false;
  }
}
