// Browser test for the dashboard: no page scroll at common sizes, dark and light mode, node map present and clickable.
// Run: node tests/board-ui.mjs   (needs the `playwright` package and Chromium; the CI job installs both)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { project, log } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const d = project({ laravel: false });
log(d, 'plan', 'Bookings', '--task', 'Schema :: DB', '--task', 'API :: Backend', '--task', 'Calendar :: Frontend', '--task', 'E2E :: QA', '--task', 'Release :: Release');
log(d, 'task', 'T1', 'done', 'ok'); log(d, 'task', 'T2', 'in_progress', 'writing'); log(d, 'task', 'T4', 'blocked', 'needs T3');
for (const [n, s] of [['product-strategist', 'completed'], ['backend-engineer', 'running'], ['qa-playwright', 'blocked'], ['access-control-reviewer', 'timed_out'], ['frontend-engineer', 'running']]) log(d, 'agent', n, s, `task for ${n}`, ...(s === 'blocked' ? ['--needs', 'MySQL down'] : []));

const port = 4390 + Math.floor(Math.random() * 100);
const srv = spawn(process.execPath, [join(d, 'docs/ai/board/board.mjs'), '--port', String(port)], { cwd: d, env: { ...process.env, AI_BOARD_ROOT: d, AI_BOARD_CODEX_HOME: join(d, 'no-codex') }, stdio: 'ignore' });
let failed = 0;
try {
  await new Promise((r) => setTimeout(r, 1500));
  const b = await chromium.launch();
  for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(`http://127.0.0.1:${port}/`); await p.waitForSelector('.node', { timeout: 10000 });
    const m = await p.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, nodes: document.querySelectorAll('.node').length, theme: document.documentElement.dataset.theme }));
    assert.ok(m.sh <= m.ih && m.sw <= m.iw, `page scrolls at ${w}x${h}: ${JSON.stringify(m)}`);
    assert.ok(m.nodes >= 6, `node map has ${m.nodes} nodes`); assert.equal(m.theme, 'dark'); assert.deepEqual(errs, []);
    await p.click('.node.task >> nth=1'); assert.ok(await p.locator('#detail.show').count(), 'detail card opens');
    await p.click('#theme'); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'light');
    console.log(`ok ${w}x${h}: no scroll, ${m.nodes} nodes, detail card, theme toggle`);
  }
  await b.close();
} catch (e) { failed = 1; console.error(e.message || e); } finally { srv.kill(); }
process.exit(failed);
