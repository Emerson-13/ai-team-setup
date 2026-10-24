#!/usr/bin/env node
// Live dashboard for what the AI agents are doing. Read-only, local only (127.0.0.1), no dependencies.
//   npm run ai:board            (or: node docs/ai/board/board.mjs [--port 4177] [--open] [--stall 120] [--log-gap 300] [--no-sync])
// Shows: plan progress, one card per agent (status, timer), commands that are running, a live activity feed
// (agent reports + wrapped commands + Claude hooks + the real Codex session), and a red warning when nothing moved for too long.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexTail } from './codex.mjs';
import { FileWatch } from './watch.mjs';
import { DEFAULT_BUDGET_MIN, DEFAULT_STALL_SEC, ROOT, loadAgents, loadPlan, mirrorExternalPlan, readEvents, stats } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const stallSec = Number(val('stall', DEFAULT_STALL_SEC));
const wantPort = Number(val('port', 4177));
const sync = !flag('no-sync');

const codex = new CodexTail(ROOT);
const watcher = new FileWatch(ROOT);
const logGapSec = Number(val('log-gap', 300));
const ms = (iso) => (iso ? Date.parse(iso) || 0 : 0);
const maxTs = (...a) => a.reduce((m, x) => (x > m ? x : m), 0);
const iso = (n) => (n ? new Date(n).toISOString() : '');
const ageText = (t, now) => { if (!t) return 'never'; const s = Math.max(0, Math.round((now - t) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`; };

function wrappedCommands(fileEvents) {
  const byId = new Map();
  for (const e of fileEvents) {
    if (!e.id || !['command_start', 'command_end', 'command_stalled'].includes(e.type)) continue;
    let c = byId.get(e.id);
    if (!c) { c = { id: e.id, agent: e.agent || '', text: '', status: 'running', startedAt: e.ts }; byId.set(e.id, c); }
    if (e.type === 'command_start') { c.text = e.data?.command ? `${e.text}` : e.text; c.startedAt = e.ts; c.agent = e.agent || c.agent; }
    else {
      const code = e.data?.code;
      c.status = e.type === 'command_stalled' ? 'stalled' : code === 0 ? 'ok' : 'failed';
      c.code = code; c.durationMs = e.data?.durationMs; c.tail = e.data?.tail;
      if (!c.text) c.text = String(e.text).split(' -> ')[0];
    }
  }
  return [...byId.values()].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)).slice(-8);
}

function buildState() {
  const now = Date.now();
  const cx = (() => { try { return codex.poll(); } catch (e) { return { found: false, error: String(e.message || e), events: [], plan: null, sessions: 0, homes: [], lastTs: '' }; } })();
  const fw = (() => { try { return watcher.poll(); } catch { return { events: [], lastTs: '', files: 0 }; } })();

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

  const commands = wrappedCommands(fileEvents);
  const ended = new Set(fileEvents.filter((e) => e.type === 'command_end' || e.type === 'command_stalled').map((e) => e.id));
  const runningCommands = fileEvents.filter((e) => e.type === 'command_start' && !ended.has(e.id) && now - ms(e.ts) < 3600000)
    .map((e) => ({ id: e.id, agent: e.agent, text: e.text, startedAt: e.ts }));
  for (const c of commands) if (c.status === 'running' && now - ms(c.startedAt) >= 3600000) c.status = 'stalled';

  const events = [
    ...fileEvents.map((e) => ({ ts: e.ts, source: e.source || 'agent', kind: e.type, text: e.text, agent: e.agent })),
    ...cx.events.map((e) => ({ ts: e.ts, source: 'codex', kind: e.kind, text: e.text, agent: 'codex' })),
    ...fw.events.map((e) => ({ ts: e.ts, source: 'files', kind: e.kind, text: e.text, agent: '' })),
  ].filter((e) => e.ts).sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 150);

  // ---- is the work being logged? ----
  const lastOf = (src) => maxTs(...fileEvents.filter((e) => (e.source || 'agent') === src).map((e) => ms(e.ts)));
  const selfTs = maxTs(lastOf('agent'), ...agents.map((a) => ms(a.updatedAt)), plan && plan.source === 'agent' ? ms(plan.updatedAt) : 0);
  const wrapTs = lastOf('wrap'); const hookTs = lastOf('hook');
  const codexReal = maxTs(...cx.events.map((e) => ms(e.ts)));
  const codexAny = ms(cx.lastTs); const filesTs = ms(fw.lastTs);
  const work = [['Codex', codexReal], ['wrapped command', wrapTs], ['Claude hook', hookTs], ['file edits', filesTs]].sort((a, b) => b[1] - a[1])[0];
  const workTs = work[1];
  const workingNow = (workTs && now - workTs < 120000) || (cx.turnActive && now - codexAny < 600000) || runningCommands.length > 0;
  const gap = logGapSec * 1000;
  const unlogged = !!workingNow && (!selfTs || now - selfTs > gap);
  const rows = [
    { label: 'Agent reports (log.mjs)', level: selfTs && now - selfTs <= gap ? 'ok' : workingNow ? (selfTs ? 'warn' : 'bad') : '', detail: selfTs ? `last ${ageText(selfTs, now)}` : 'none yet', hint: 'The agent writes the plan, task and agent status with node docs/ai/board/log.mjs' },
    { label: 'Wrapped commands (ai:run)', level: wrapTs && now - wrapTs < 3600000 ? 'ok' : '', detail: wrapTs ? `${commands.length} recent, last ${ageText(wrapTs, now)}` : 'none yet', hint: 'Pest, Playwright and builds run through npm run ai:run -- <command>; the script writes this log' },
    { label: 'Codex session', level: cx.found && cx.sessions ? (codexAny && now - codexAny < 600000 ? 'ok' : '') : cx.found ? 'warn' : '', detail: cx.found ? (cx.sessions ? `${cx.sessions} session(s), last ${ageText(codexAny, now)}` : 'none for this project (npm run ai:probe)') : 'not found (npm run ai:probe)', hint: 'Read from ~/.codex/sessions. The tool writes it, the agent cannot skip it' },
    { label: 'File changes (watched)', level: filesTs && now - filesTs < 600000 ? 'ok' : '', detail: filesTs ? `last ${ageText(filesTs, now)} · ${fw.files} files` : `${fw.files} files watched`, hint: 'Edits in app, routes, database, resources, tests, config and docs are seen without any agent' },
  ];
  const health = unlogged
    ? { level: 'warn', verdict: 'Agent not logging', unlogged: true, workSource: work[0], selfAgo: selfTs ? ageText(selfTs, now).replace(' ago', '') : 'the whole session', rows }
    : workingNow ? { level: 'ok', verdict: 'Logging OK', unlogged: false, workSource: work[0], selfAgo: '', rows }
      : { level: '', verdict: 'Idle', unlogged: false, workSource: '', selfAgo: '', rows };

  const stamps = [ms(plan?.updatedAt), ...agents.map((a) => ms(a.updatedAt)), ...fileEvents.map((e) => ms(e.ts)), codexAny, filesTs];
  const lastActivity = Math.max(0, ...stamps);
  const active = agents.some((a) => a.status === 'running') || (plan?.tasks ?? []).some((t) => t.status === 'in_progress') || runningCommands.length > 0 || (cx.turnActive && now - ms(cx.lastTs) < 30 * 60000);
  const quietSec = lastActivity ? Math.round((now - lastActivity) / 1000) : null;

  return {
    now: new Date(now).toISOString(), root: ROOT, stallSec,
    plan: plan ? { ...plan, stats: stats(plan) } : null,
    codexPlan: cx.plan && plan?.source !== 'codex-plan' ? cx.plan : null,
    agents, runningCommands, commands, events, health,
    codex: { found: cx.found, homes: cx.homes, sessions: cx.sessions, candidates: cx.candidates, lastTs: cx.lastTs, turnActive: cx.turnActive, error: cx.error },
    files: { watched: fw.files, lastTs: fw.lastTs, truncated: !!fw.truncated },
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
try { watcher.poll(); } catch { /* baseline scan so edits made after the board starts are seen */ }
listen(wantPort);
