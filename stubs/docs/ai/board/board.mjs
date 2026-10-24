#!/usr/bin/env node
// Live dashboard for what the AI agents are doing. Read-only, local only (127.0.0.1), no dependencies.
//   npm run ai:board            (or: node docs/ai/board/board.mjs [--port 4177] [--open] [--stall 120] [--no-sync])
// Shows: plan progress, one card per agent (status, timer), commands that are running, a live activity feed
// (agent reports + wrapped commands + Claude hooks + the real Codex session), and a red warning when nothing moved for too long.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexTail } from './codex.mjs';
import { DEFAULT_BUDGET_MIN, DEFAULT_STALL_SEC, ROOT, loadAgents, loadPlan, mirrorExternalPlan, readEvents, stats } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const stallSec = Number(val('stall', DEFAULT_STALL_SEC));
const wantPort = Number(val('port', 4177));
const sync = !flag('no-sync');

const codex = new CodexTail(ROOT);
const ms = (iso) => (iso ? Date.parse(iso) || 0 : 0);

function buildState() {
  const now = Date.now();
  const cx = (() => { try { return codex.poll(); } catch (e) { return { found: false, error: String(e.message || e), events: [], plan: null, sessions: 0, homes: [], lastTs: '' }; } })();

  // Mirror the plan Codex wrote itself (update_plan) into progress.md, unless the agent registered its own plan.
  if (sync && cx.plan) {
    try { mirrorExternalPlan('codex-plan', 'Codex plan', cx.plan.steps); } catch { /* ignore */ }
  }
  const plan = loadPlan();
  const agentsData = loadAgents();
  const fileEvents = readEvents();

  const agents = Object.values(agentsData.agents ?? {}).map((a) => {
    const elapsed = (a.status === 'running' ? now : ms(a.finishedAt) || ms(a.updatedAt)) - ms(a.startedAt);
    return { ...a, elapsedMs: Math.max(0, elapsed), overBudget: a.status === 'running' && elapsed > (a.budgetMin || DEFAULT_BUDGET_MIN) * 60000 };
  });

  // commands started by wrap.mjs that have no end yet
  const ended = new Set(fileEvents.filter((e) => e.type === 'command_end' || e.type === 'command_stalled').map((e) => e.id));
  const runningCommands = fileEvents.filter((e) => e.type === 'command_start' && !ended.has(e.id) && now - ms(e.ts) < 3600000)
    .map((e) => ({ id: e.id, agent: e.agent, text: e.text, startedAt: e.ts }));

  const events = [
    ...fileEvents.map((e) => ({ ts: e.ts, source: e.source || 'agent', kind: e.type, text: e.text, agent: e.agent })),
    ...cx.events.map((e) => ({ ts: e.ts, source: 'codex', kind: e.kind, text: e.text, agent: 'codex' })),
  ].filter((e) => e.ts).sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 150);

  const stamps = [ms(plan?.updatedAt), ...agents.map((a) => ms(a.updatedAt)), ...fileEvents.map((e) => ms(e.ts)), ms(cx.lastTs)];
  const lastActivity = Math.max(0, ...stamps);
  const active = agents.some((a) => a.status === 'running') || (plan?.tasks ?? []).some((t) => t.status === 'in_progress') || runningCommands.length > 0 || (cx.turnActive && now - ms(cx.lastTs) < 30 * 60000);
  const quietSec = lastActivity ? Math.round((now - lastActivity) / 1000) : null;

  return {
    now: new Date(now).toISOString(), root: ROOT, stallSec,
    plan: plan ? { ...plan, stats: stats(plan) } : null,
    codexPlan: cx.plan && plan?.source !== 'codex-plan' ? cx.plan : null,
    agents, runningCommands, events,
    codex: { found: cx.found, homes: cx.homes, sessions: cx.sessions, candidates: cx.candidates, lastTs: cx.lastTs, turnActive: cx.turnActive, error: cx.error },
    quiet: { active, seconds: quietSec, stalled: active && quietSec !== null && quietSec > stallSec },
  };
}

const readPage = () => readFileSync(join(here, 'board.html'), 'utf8');
const server = createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/api/state') {
    let body;
    try { body = JSON.stringify(buildState()); } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message || e) })); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(body);
  } else if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(readPage());
  } else { res.writeHead(404); res.end('not found'); }
});

function listen(port, tries = 0) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries < 20) listen(port + 1, tries + 1);
    else { console.error(`board: cannot listen (${e.code || e.message})`); process.exit(1); }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log(`AI board running at ${url}   (Ctrl+C to stop)`);
    console.log(`  project: ${ROOT}`);
    console.log('  VS Code: Ctrl+Shift+P > "Simple Browser: Show" > paste the address above.');
    if (flag('open')) {
      const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      try { spawn(cmd, a, { stdio: 'ignore', detached: true }).unref(); } catch { /* ignore */ }
    }
  });
}
listen(wantPort);
