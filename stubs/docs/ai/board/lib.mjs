// Shared helpers for the AI board. No dependencies, Node 18+.
// State lives in docs/ai/state/ (agents.json, plan.json, events.jsonl) and docs/ai/progress.md is generated from it.
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync,
  renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(process.env.AI_BOARD_ROOT || join(here, '..', '..', '..'));
export const AI_DIR = join(ROOT, 'docs', 'ai');
export const STATE_DIR = join(AI_DIR, 'state');
export const FILES = {
  agents: join(STATE_DIR, 'agents.json'),
  plan: join(STATE_DIR, 'plan.json'),
  events: join(STATE_DIR, 'events.jsonl'),
  progress: join(AI_DIR, 'progress.md'),
};

export const AGENT_STATUS = ['running', 'completed', 'timed_out', 'blocked'];
export const TASK_STATUS = ['pending', 'in_progress', 'blocked', 'review', 'done'];
export const DEFAULT_BUDGET_MIN = 10;
export const DEFAULT_STALL_SEC = 120;

const pad = (n) => String(n).padStart(2, '0');
export const nowIso = () => new Date().toISOString();
export const localStamp = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const clip = (s, n = 400) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
export const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');

export function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
export function ensureDirs() { mkdirSync(STATE_DIR, { recursive: true }); }

export function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJson(file, data) {
  ensureDirs();
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, file);
  } catch {
    writeFileSync(file, text); // Windows can refuse to rename over a file another process is reading
    try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

// Directory lock so two agents writing at once do not lose each other's update. Never hangs: gives up after 3 s.
let heldLock = null;
process.on('exit', () => { if (heldLock) { try { rmSync(heldLock, { recursive: true, force: true }); } catch { /* ignore */ } } });

export function withLock(fn) {
  ensureDirs();
  const lock = join(STATE_DIR, '.lock');
  const start = Date.now();
  let held = false;
  for (;;) {
    try { mkdirSync(lock); held = true; heldLock = lock; break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(lock).mtimeMs > 10000) { rmSync(lock, { recursive: true, force: true }); continue; } } catch { /* ignore */ }
      if (Date.now() - start > 3000) break;
      sleepSync(25);
    }
  }
  try { return fn(); } finally { if (held) { heldLock = null; try { rmSync(lock, { recursive: true, force: true }); } catch { /* ignore */ } } }
}

export function appendEvent(ev) {
  try {
    ensureDirs();
    const line = JSON.stringify({ ts: nowIso(), ...ev, text: clip(ev.text, 600) });
    appendFileSync(FILES.events, `${line}\n`);
    if (statSync(FILES.events).size > 1_000_000) {
      const lines = readFileSync(FILES.events, 'utf8').split('\n').filter(Boolean);
      writeFileSync(FILES.events, `${lines.slice(-1200).join('\n')}\n`);
    }
  } catch { /* logging must never break the real work */ }
}

export function tailLines(file, maxBytes = 300000) {
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - maxBytes);
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    closeSync(fd);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift(); // first line is probably cut
    return lines.filter(Boolean);
  } catch { return []; }
}

export function readEvents(maxBytes = 300000) {
  const out = [];
  for (const l of tailLines(FILES.events, maxBytes)) { try { out.push(JSON.parse(l)); } catch { /* skip a broken line */ } }
  return out;
}

export const loadPlan = () => readJson(FILES.plan, null);
export const loadAgents = () => readJson(FILES.agents, { agents: {} });

export function savePlan(plan) { plan.updatedAt = nowIso(); writeJson(FILES.plan, plan); }
export function saveAgents(data) { writeJson(FILES.agents, data); }

export function stats(plan) {
  const tasks = plan?.tasks ?? [];
  const by = Object.fromEntries(TASK_STATUS.map((s) => [s, 0]));
  for (const t of tasks) by[t.status] = (by[t.status] ?? 0) + 1;
  const total = tasks.length;
  const done = by.done;
  return { total, done, by, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function bar(percent, width = 10) {
  const filled = Math.round((percent / 100) * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

export function summaryLine(plan, agentsData) {
  if (!plan || !(plan.tasks ?? []).length) return 'PROGRESS no plan registered yet (node docs/ai/board/log.mjs plan "<title>" --task "<step> :: <role>")';
  const s = stats(plan);
  const now = plan.tasks.filter((t) => t.status === 'in_progress').map((t) => `${t.id} ${t.title}`);
  const blocked = plan.tasks.filter((t) => t.status === 'blocked').map((t) => t.id);
  const running = Object.values(agentsData?.agents ?? {}).filter((a) => a.status === 'running').map((a) => a.name);
  const parts = [`PROGRESS ${s.done}/${s.total} tasks (${s.percent}%) ${bar(s.percent)}`];
  if (now.length) parts.push(`now: ${now.join(', ')}`);
  if (blocked.length) parts.push(`blocked: ${blocked.join(', ')}`);
  if (running.length) parts.push(`agents running: ${running.join(', ')}`);
  if (plan.finishedAt) parts.push('FINISHED');
  return parts.join(' | ');
}

export function renderProgress(plan, agentsData) {
  const L = [];
  if (!plan) {
    L.push('# Progress: (no plan yet)', `Updated: ${localStamp()}`, '', 'No plan registered. Agents: `node docs/ai/board/log.mjs plan "<title>" --task "<step> :: <role>"`.');
    return `${L.join('\n')}\n`;
  }
  const s = stats(plan);
  L.push(`# Progress: ${plan.title}`);
  L.push(`Updated: ${localStamp()}   Mode/Size: ${plan.mode || '-'} / ${plan.size || '-'}   Stack: ${plan.stack || '-'}${plan.source && plan.source !== 'agent' ? `   Source: ${plan.source}` : ''}`);
  L.push(`Progress: ${s.done}/${s.total} tasks (${s.percent}%) ${bar(s.percent, 20)}${plan.finishedAt ? '  FINISHED' : ''}`);
  L.push('', '## Tasks');
  if (!plan.tasks.length) L.push('- (no tasks)');
  for (const t of plan.tasks) {
    L.push(`- [${t.status === 'done' ? 'x' : ' '}] ${t.id} ${t.title}${t.owner ? ` (${t.owner})` : ''}: ${t.status}${t.note ? ` - ${clip(t.note, 160)}` : ''}`);
  }
  const agents = Object.values(agentsData?.agents ?? {});
  if (agents.length) {
    L.push('', '## Agents', '| Agent | Task | Status | Evidence / reason |', '|---|---|---|---|');
    for (const a of agents) L.push(`| ${a.name} | ${clip(a.doing, 80).replace(/\|/g, '/')} | ${a.status} | ${clip(a.status === 'blocked' ? (a.needs || a.evidence) : (a.evidence || a.needs), 120).replace(/\|/g, '/')} |`);
  }
  if ((plan.findings ?? []).length) {
    L.push('', '## Findings');
    for (const f of plan.findings) L.push(`- ${f.id} ${f.severity}: ${clip(f.text, 200)} (${f.state})`);
  }
  L.push('', '## Next', plan.next || '-');
  return `${L.join('\n')}\n`;
}

export function syncProgress() {
  try {
    mkdirSync(AI_DIR, { recursive: true });
    writeFileSync(FILES.progress, renderProgress(loadPlan(), loadAgents()));
  } catch { /* ignore */ }
}

// An external tool (Claude Code TodoWrite, Codex update_plan) reported its own plan. Mirror it into plan.json and
// progress.md, but never overwrite a plan the agent registered itself with log.mjs.
export function mirrorExternalPlan(source, title, items) {
  return withLock(() => {
    const cur = loadPlan();
    if (cur && cur.source !== source && !cur.finishedAt) return false;
    if (!items.length) return false;
    const prev = new Map((cur?.tasks ?? []).map((t) => [t.title, t]));
    const tasks = items.map((it, i) => {
      const p = prev.get(it.title);
      const status = it.status;
      const t = { id: `T${i + 1}`, title: it.title, owner: '', status, note: '' };
      if (status === 'in_progress') t.startedAt = p?.startedAt || nowIso();
      if (status === 'done') t.doneAt = p?.doneAt || nowIso();
      return t;
    });
    const same = cur && cur.source === source && JSON.stringify(cur.tasks.map((t) => [t.title, t.status])) === JSON.stringify(tasks.map((t) => [t.title, t.status]));
    if (same) return false;
    savePlan({ title: cur?.source === source && cur.title ? cur.title : title, mode: cur?.mode || '', size: cur?.size || '', stack: '', source, createdAt: cur?.source === source ? cur.createdAt : nowIso(), tasks, findings: [], next: '' });
    syncProgress();
    return true;
  });
}

// Only flags listed in valueFlags take a value ("--flag value" or "--flag=value"); every other flag is boolean.
// Repeated flags become arrays.
export function parseArgs(argv, valueFlags = []) {
  const pos = []; const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && a.length > 2) {
      const [k, inline] = a.slice(2).split(/=(.*)/s);
      let v = true;
      if (inline !== undefined) v = inline;
      else if (valueFlags.includes(k)) v = argv[++i] ?? true;
      flags[k] = k in flags ? [].concat(flags[k], v) : v;
    } else pos.push(a);
  }
  return { pos, flags };
}

export const rel = (p) => p.replace(ROOT, '.').replace(/\\/g, '/');
export const exists = existsSync;
