#!/usr/bin/env node
// Reads the Codex "rollout" session files (JSONL) that the Codex CLI / VS Code extension writes, so the board can show
// what Codex really ran (commands, patches, plan) without depending on the agent to report it.
//   node docs/ai/board/codex.mjs --probe        shows what it can read on THIS machine (run this first)
// Where: $AI_BOARD_CODEX_HOME, $CODEX_HOME, ~/.codex  ->  sessions/YYYY/MM/DD/rollout-*.jsonl
// The file format is not a public contract and changes between Codex versions, so the parser is tolerant:
// anything it does not understand is counted and listed by --probe instead of crashing.
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, clip } from './lib.mjs';

const MAX_AGE_MS = 6 * 3600 * 1000;      // only sessions touched in the last 6 hours
const FIRST_READ_BYTES = 3 * 1024 * 1024; // on first sight read only the last 3 MB of a session
const KEEP_EVENTS = 300;

export function normPath(p) {
  let s = String(p || '').replace(/^\\\\\?\\/, '').replace(/\\/g, '/');
  s = s.replace(/^\/\/wsl(?:\$|\.localhost)\/[^/]+/i, '');          // //wsl$/Ubuntu/home/x -> /home/x
  s = s.replace(/^\/mnt\/([a-z])\//i, (_, d) => `${d}:/`);          // /mnt/c/Users -> c:/Users
  return s.replace(/\/+$/, '').toLowerCase();
}
export const sameProject = (cwd, root = ROOT) => {
  const a = normPath(cwd); const b = normPath(root);
  return !!a && (a === b || a.startsWith(`${b}/`));
};

export function codexHomes() {
  const list = [process.env.AI_BOARD_CODEX_HOME, process.env.CODEX_HOME, join(homedir(), '.codex')].filter(Boolean);
  return [...new Set(list)].filter((d) => existsSync(join(d, 'sessions')));
}

function walk(dir, out, depth = 0) {
  if (depth > 5) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (/^rollout-.*\.jsonl$/.test(e.name)) { try { out.push({ path: p, mtime: statSync(p).mtimeMs, size: statSync(p).size }); } catch { /* ignore */ } }
  }
}

export function listRollouts(homes = codexHomes(), maxAge = MAX_AGE_MS) {
  const all = [];
  for (const h of homes) walk(join(h, 'sessions'), all);
  const cutoff = Date.now() - maxAge;
  return all.filter((f) => f.mtime >= cutoff).sort((a, b) => b.mtime - a.mtime).slice(0, 40);
}

function readRange(path, start, end) {
  const fd = openSync(path, 'r');
  try {
    const len = Math.max(0, end - start);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } finally { closeSync(fd); }
}

export function readFirstLine(path) {
  const fd = openSync(path, 'r');
  try {
    const chunks = []; let pos = 0;
    for (let n = 0; n < 32; n++) {                       // the first line can be large (it may embed instructions)
      const buf = Buffer.alloc(65536);
      const got = readSync(fd, buf, 0, buf.length, pos);
      if (!got) break;
      const nl = buf.indexOf(10);
      if (nl >= 0 && nl < got) { chunks.push(buf.subarray(0, nl)); break; }
      chunks.push(buf.subarray(0, got)); pos += got;
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { closeSync(fd); }
}

const SHELLS = /^(bash|sh|zsh|fish|powershell(\.exe)?|pwsh(\.exe)?|cmd(\.exe)?)$/i;
function commandText(c) {
  if (Array.isArray(c)) {
    const first = basename(String(c[0] ?? '').replace(/\\/g, '/'));
    if (c.length >= 3 && SHELLS.test(first) && /^(-l?c|-command|\/c)$/i.test(String(c[1]))) return c.slice(2).join(' ');
    return c.join(' ');
  }
  return String(c ?? '');
}
const parseJson = (v) => { if (typeof v !== 'string') return v ?? {}; try { return JSON.parse(v); } catch { return {}; } };

function parseExit(out) {
  const o = typeof out === 'string' ? (parseJson(out).metadata ? parseJson(out) : null) : out;
  if (o?.metadata && 'exit_code' in o.metadata) return { code: o.metadata.exit_code, secs: o.metadata.duration_seconds };
  const t = typeof out === 'string' ? out : '';
  const m = t.match(/Exit code:\s*(-?\d+)/i) || t.match(/exit(?:ed)?(?: with)? code[:\s]+(-?\d+)/i);
  const w = t.match(/Wall time:\s*([\d.]+)/i);
  return m ? { code: Number(m[1]), secs: w ? Number(w[1]) : undefined } : { code: undefined };
}

const ctx = (state) => state.calls ?? (state.calls = new Map());
const IGNORE_USER = /^\s*(<environment_context>|# AGENTS\.md instructions|<user_instructions>|<INSTRUCTIONS>)/;

// One JSONL record -> zero or more normalized events { ts, kind, text, data }
export function parseRecord(rec, state = {}) {
  const ts = rec.timestamp || rec.payload?.timestamp || null;
  const p = rec.payload ?? rec;
  const type = rec.type;
  const sub = p?.type;
  const ev = (kind, text, data) => [{ ts, kind, text: clip(text, 300), data }];
  state.seen ??= {};
  const mark = (k) => { state.seen[k] = (state.seen[k] ?? 0) + 1; };

  if (type === 'session_meta' || sub === 'session_meta') {
    state.cwd = p.cwd ?? p.meta?.cwd ?? state.cwd;
    mark('session_meta');
    return ev('session', `session ${String(p.id ?? p.meta?.id ?? '').slice(0, 8)} ${p.originator ?? ''} ${p.cli_version ?? ''}`.trim());
  }
  if (type === 'turn_context') { mark('turn_context'); return [{ ts, kind: 'heartbeat', text: '' }]; }

  if (type === 'response_item' || ['function_call', 'local_shell_call', 'custom_tool_call', 'function_call_output', 'local_shell_call_output', 'custom_tool_call_output', 'message', 'reasoning'].includes(sub)) {
    mark(`response_item/${sub}`);
    if (sub === 'function_call' || sub === 'local_shell_call' || sub === 'custom_tool_call') {
      const name = p.name || (sub === 'local_shell_call' ? 'shell' : '');
      const args = parseJson(p.arguments ?? p.input ?? p.action);
      const callId = p.call_id || p.id;
      if (name === 'update_plan') {
        const steps = (args.plan ?? []).map((s) => ({ title: String(s.step ?? ''), status: s.status === 'completed' ? 'done' : s.status === 'in_progress' ? 'in_progress' : 'pending' }));
        const d = steps.filter((s) => s.status === 'done').length;
        return ev('plan', `plan ${d}/${steps.length} done${args.explanation ? ` - ${args.explanation}` : ''}`, { steps });
      }
      const raw = typeof (p.input ?? p.arguments) === 'string' ? (p.input ?? p.arguments) : '';
      if (name === 'apply_patch' || /\*\*\* (Begin Patch|Update File|Add File)/.test(raw + JSON.stringify(args))) {
        const files = [...(raw + JSON.stringify(args)).matchAll(/\*\*\* (?:Update|Add|Delete) File: ([^\\\n"]+)/g)].map((m) => m[1].trim());
        return ev('patch', `edit ${[...new Set(files)].join(', ') || '(apply_patch)'}`, { files });
      }
      const cmd = commandText(args.command ?? args.cmd ?? args.commands ?? args.exec?.command ?? args.action?.command);
      if (cmd) { ctx(state).set(callId, cmd); return ev('command', cmd, { callId }); }
      return ev('tool', `${name || sub}`, { callId });
    }
    if (sub?.endsWith('_output')) {
      const out = p.output ?? p.content;
      const { code, secs } = parseExit(out);
      const cmd = ctx(state).get(p.call_id) ?? '';
      return ev('result', `${code === undefined ? 'finished' : code === 0 ? 'ok' : `FAILED (exit ${code})`}${cmd ? `: ${cmd}` : ''}${secs ? ` (${secs}s)` : ''}`, { code, callId: p.call_id });
    }
    if (sub === 'message') {
      const t = (p.content ?? []).map((c) => c.text ?? '').join(' ').trim();
      if (!t) return [];
      if (p.role === 'assistant') return ev('message', t);
      if (p.role === 'user' && !IGNORE_USER.test(t)) return ev('user', t);
      return [];
    }
    if (sub === 'reasoning') return [{ ts, kind: 'heartbeat', text: '' }];
    return [];
  }

  if (type === 'event_msg' || type === 'event') {
    mark(`event_msg/${sub}`);
    switch (sub) {
      case 'agent_message': return ev('message', p.message ?? p.text ?? '');
      case 'user_message': return IGNORE_USER.test(p.message ?? '') ? [] : ev('user', p.message ?? p.text ?? '');
      case 'task_started': case 'turn_started': return ev('turn', 'Codex started working', { phase: 'start' });
      case 'task_complete': case 'turn_complete': return ev('turn', `Codex finished${p.last_agent_message ? `: ${p.last_agent_message}` : ''}`, { phase: 'end' });
      case 'turn_aborted': return ev('turn', 'Codex turn aborted', { phase: 'end' });
      case 'exec_command_begin': { const c = commandText(p.command); ctx(state).set(p.call_id, c); return ev('command', c, { callId: p.call_id }); }
      case 'exec_command_end': {
        const secs = p.duration ? (p.duration.secs ?? 0) + (p.duration.nanos ?? 0) / 1e9 : undefined;
        return ev('result', `${p.exit_code === 0 ? 'ok' : `FAILED (exit ${p.exit_code})`}${ctx(state).get(p.call_id) ? `: ${ctx(state).get(p.call_id)}` : ''}${secs ? ` (${secs.toFixed(1)}s)` : ''}`, { code: p.exit_code, callId: p.call_id });
      }
      case 'patch_apply_begin': return ev('patch', `edit ${Object.keys(p.changes ?? {}).join(', ')}`, { files: Object.keys(p.changes ?? {}) });
      case 'error': return ev('error', p.message ?? 'error');
      case 'token_count': case 'agent_reasoning': case 'agent_reasoning_delta': case 'agent_message_delta': case 'agent_reasoning_section_break': return [{ ts, kind: 'heartbeat', text: '' }];
      default: return [{ ts, kind: 'heartbeat', text: '' }];
    }
  }
  mark(`unrecognized/${type ?? '?'}${sub ? `/${sub}` : ''}`);
  return [];
}

// Incremental reader: keeps a byte offset per file so a poll every 2 s only reads new lines.
export class CodexTail {
  constructor(root = ROOT) { this.root = root; this.files = new Map(); this.listAt = 0; this.list = []; this.homes = []; }

  poll() {
    const now = Date.now();
    if (now - this.listAt > 8000) { this.homes = codexHomes(); this.list = listRollouts(this.homes); this.listAt = now; }
    const sessions = [];
    for (const f of this.list) {
      let st = this.files.get(f.path);
      if (!st) {
        let cwd = null;
        try { const first = JSON.parse(readFirstLine(f.path)); cwd = first.payload?.cwd ?? first.cwd ?? first.meta?.cwd ?? null; } catch { /* unknown */ }
        st = { path: f.path, cwd, match: cwd ? sameProject(cwd, this.root) : false, offset: -1, events: [], state: { cwd }, partial: '' };
        this.files.set(f.path, st);
      }
      if (!st.match) continue;
      let size = 0;
      try { size = statSync(f.path).size; } catch { continue; }
      if (st.offset < 0) { st.offset = Math.max(0, size - FIRST_READ_BYTES); st.cutFirst = st.offset > 0; }
      if (size > st.offset) {
        let chunk = st.partial + readRange(f.path, st.offset, size);
        st.offset = size;
        if (st.cutFirst) { chunk = chunk.slice(chunk.indexOf('\n') + 1); st.cutFirst = false; } // the first line was cut in the middle
        const lines = chunk.split('\n');
        st.partial = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let rec; try { rec = JSON.parse(line); } catch { continue; }
          for (const e of parseRecord(rec, st.state)) {
            const last = st.events[st.events.length - 1];
            if (e.kind !== 'heartbeat' && last && last.kind === e.kind && last.text === e.text) continue; // Codex writes the same thing twice (response_item + event_msg)
            st.events.push({ ...e, session: basename(f.path).slice(-14, -6) });
          }
        }
        if (st.events.length > KEEP_EVENTS * 2) st.events = st.events.slice(-KEEP_EVENTS);
      }
      sessions.push({ path: f.path, mtime: f.mtime, cwd: st.cwd, events: st.events });
    }
    const all = sessions.flatMap((s) => s.events);
    const real = all.filter((e) => e.kind !== 'heartbeat');
    const lastAny = all.reduce((m, e) => (e.ts && e.ts > m ? e.ts : m), '');
    const plans = real.filter((e) => e.kind === 'plan' && e.ts).sort((a, b) => (a.ts < b.ts ? -1 : 1));
    const turns = real.filter((e) => e.kind === 'turn').sort((a, b) => (a.ts < b.ts ? -1 : 1));
    const lastTurn = turns[turns.length - 1];
    return {
      found: this.homes.length > 0,
      homes: this.homes,
      sessions: sessions.length,
      candidates: this.list.length,
      events: real.slice(-KEEP_EVENTS),
      lastTs: lastAny,
      plan: plans.length ? { ts: plans[plans.length - 1].ts, steps: plans[plans.length - 1].data.steps } : null,
      turnActive: !!lastTurn && lastTurn.data?.phase === 'start',
    };
  }
}

function probe() {
  const homes = codexHomes();
  console.log(`Project root       ${ROOT}`);
  console.log(`Codex home(s)      ${homes.length ? homes.join('\n                   ') : 'NONE FOUND (looked at $AI_BOARD_CODEX_HOME, $CODEX_HOME, ~/.codex)'}`);
  if (!homes.length) {
    console.log('\nFAIL  no ~/.codex/sessions folder here. If Codex runs in WSL, run this probe inside WSL, or set AI_BOARD_CODEX_HOME to that .codex folder.');
    process.exit(1);
  }
  const files = listRollouts(homes, 7 * 24 * 3600 * 1000);
  console.log(`Session files      ${files.length} touched in the last 7 days (newest: ${files[0] ? `${new Date(files[0].mtime).toLocaleString()} ${basename(files[0].path)}` : '-'})`);
  const hist = {}; let matched = 0; const cwds = new Map(); const sample = []; let plan = null;
  for (const f of files.slice(0, 15)) {
    let cwd = null;
    try { const first = JSON.parse(readFirstLine(f.path)); cwd = first.payload?.cwd ?? first.cwd ?? null; } catch { /* ignore */ }
    cwds.set(cwd ?? '(unknown)', (cwds.get(cwd ?? '(unknown)') ?? 0) + 1);
    if (!cwd || !sameProject(cwd)) continue;
    matched++;
    const size = f.size; const start = Math.max(0, size - FIRST_READ_BYTES);
    let text = readRange(f.path, start, size); if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    const state = { cwd };
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let rec; try { rec = JSON.parse(line); } catch { hist['(unparseable line)'] = (hist['(unparseable line)'] ?? 0) + 1; continue; }
      const evs = parseRecord(rec, state);
      for (const e of evs) { const l = sample[sample.length - 1]; if (e.kind !== 'heartbeat' && !(l && l.kind === e.kind && l.text === e.text)) sample.push(e); if (e.kind === 'plan') plan = e; }
    }
    for (const [k, v] of Object.entries(state.seen ?? {})) hist[k] = (hist[k] ?? 0) + v;
  }
  console.log(`Matches this project  ${matched} of the newest ${Math.min(files.length, 15)} files`);
  if (!matched && cwds.size) console.log(`  working folders seen in sessions: ${[...cwds.keys()].slice(0, 6).join(' | ')}\n  (a mismatch here, such as a WSL path vs a Windows path, is why nothing matches)`);
  console.log('\nRecord types seen (count):');
  for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.startsWith('unrecognized') ? 'UNKNOWN ' : 'known   '} ${k}  x${v}`);
  console.log('\nLast activity the parser understood:');
  for (const e of sample.slice(-8)) console.log(`  ${e.ts ?? ''}  ${e.kind.padEnd(8)} ${clip(e.text, 110)}`);
  if (!sample.length) console.log('  (nothing)');
  console.log(`\nPlan tool (update_plan): ${plan ? `FOUND, latest says "${plan.text}"` : 'not seen in the newest matching session'}`);
  const unknown = Object.keys(hist).filter((k) => k.startsWith('unrecognized')).length;
  console.log(matched && sample.length ? `\nOK    the board can read Codex activity here.${unknown ? ` ${unknown} record type(s) are not understood; paste this probe output to Claude so the parser can be updated.` : ''}` : '\nWARN  nothing readable for this project yet. Start a Codex task in this folder, then run the probe again.');
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]) && process.argv.includes('--probe')) probe();
