#!/usr/bin/env node
// The one command agents call to report plan, task progress, agent status, findings. Works from any tool.
//   node docs/ai/board/log.mjs plan "Orders module" --task "Schema :: Database Engineer" --task "Orders API :: Backend Engineer" [--mode "new system"] [--size L] [--stack "Vue + Inertia"] [--keep-agents]
//   node docs/ai/board/log.mjs add "Extra step" [--owner "QA Engineer"]
//   node docs/ai/board/log.mjs task T1 in_progress ["what is happening"]       pending | in_progress | blocked | review | done
//   node docs/ai/board/log.mjs task T1 done "tests/Feature/OrderTest.php passes (12 tests)"
//   node docs/ai/board/log.mjs agent qa-playwright running "E2E for orders" [--budget 10]
//   node docs/ai/board/log.mjs agent qa-playwright completed "E2E for orders" --evidence "playwright-report/index.html"
//   node docs/ai/board/log.mjs agent qa-playwright blocked "E2E for orders" --needs "MySQL is not running"      running | completed | timed_out | blocked
//   node docs/ai/board/log.mjs finding high "Missing tenant check in OrderPolicy::view"      then: finding F-1 fixed
//   node docs/ai/board/log.mjs next "Run regression suite"
//   node docs/ai/board/log.mjs note "free-text activity line"
//   node docs/ai/board/log.mjs status | finish ["summary"] [--force] | reset
// Every command rewrites docs/ai/progress.md and prints one PROGRESS line you can paste into your reply.
import {
  AGENT_STATUS, TASK_STATUS, DEFAULT_BUDGET_MIN, appendEvent, clip, loadAgents, loadPlan, nowIso, parseArgs,
  saveAgents, savePlan, stats, summaryLine, syncProgress, withLock, FILES,
} from './lib.mjs';
import { rmSync } from 'node:fs';

const { pos, flags } = parseArgs(process.argv.slice(2), ['task', 'mode', 'size', 'stack', 'owner', 'evidence', 'needs', 'budget', 'after']);
const [cmd, ...rest] = pos;
const one = (v) => (Array.isArray(v) ? v[v.length - 1] : v);
const die = (m) => { console.error(`log.mjs: ${m}`); process.exit(2); };
const who = process.env.AI_AGENT || 'orchestrator';

function emit(type, text, extra = {}) { appendEvent({ source: 'agent', agent: who, type, text, ...extra }); }
function done(plan, agents, extraLines = []) {
  syncProgress();
  for (const l of extraLines) console.log(l);
  console.log(summaryLine(plan, agents));
}
const needPlan = () => { const p = loadPlan(); if (!p) die('no plan yet. Register it first: node docs/ai/board/log.mjs plan "<title>" --task "<step> :: <role>"'); return p; };
const findTask = (plan, id) => plan.tasks.find((t) => t.id.toLowerCase() === String(id).toLowerCase());
const nextId = (plan) => `T${plan.tasks.reduce((m, t) => Math.max(m, Number(String(t.id).replace(/\D/g, '')) || 0), 0) + 1}`;

switch (cmd) {
  case 'plan': {
    const title = rest.join(' ').trim();
    if (!title) die('usage: plan "<title>" --task "<step> :: <role>" [--task ...]');
    const items = [].concat(flags.task ?? []).filter((t) => typeof t === 'string');
    if (!items.length) die('give at least one --task "<step> :: <role>"');
    withLock(() => {
      const tasks = items.map((raw, i) => {
        const [t, o] = String(raw).split(/\s*::\s*/);
        return { id: `T${i + 1}`, title: t.trim(), owner: (o || '').trim(), status: 'pending', note: '' };
      });
      const plan = { title, mode: one(flags.mode) || '', size: one(flags.size) || '', stack: one(flags.stack) || '', source: 'agent', createdAt: nowIso(), tasks, findings: [], next: '' };
      savePlan(plan);
      if (!flags['keep-agents']) saveAgents({ agents: {} });
      emit('plan', `plan registered: ${title} (${tasks.length} tasks)`);
      done(plan, loadAgents());
    });
    break;
  }
  case 'add': {
    const title = rest.join(' ').trim();
    if (!title) die('usage: add "<task title>" [--owner "<role>"]');
    withLock(() => {
      const plan = needPlan();
      const t = { id: nextId(plan), title, owner: one(flags.owner) || '', status: 'pending', note: '' };
      plan.tasks.push(t); delete plan.finishedAt; savePlan(plan);
      emit('task', `${t.id} added: ${title}`);
      done(plan, loadAgents(), [`added ${t.id}`]);
    });
    break;
  }
  case 'task': {
    const [id, status, ...noteParts] = rest;
    if (!id || !status) die('usage: task <id> <status> ["note"]');
    if (!TASK_STATUS.includes(status)) die(`status must be one of: ${TASK_STATUS.join(', ')}`);
    withLock(() => {
      const plan = needPlan();
      const t = findTask(plan, id);
      if (!t) die(`unknown task "${id}". Tasks: ${plan.tasks.map((x) => x.id).join(', ')}`);
      const note = noteParts.join(' ').trim();
      const was = t.status;
      t.status = status;
      if (note) t.note = clip(note, 300); else if (status !== was) t.note = ''; // a note about the old status would be misleading
      if (status === 'in_progress' && was !== 'in_progress') t.startedAt = nowIso();
      if (status === 'done') t.doneAt = nowIso(); else delete t.doneAt;
      delete plan.finishedAt;
      savePlan(plan);
      emit('task', `${t.id} ${was} -> ${status}${note ? `: ${note}` : ''}`);
      const warn = [];
      if (status === 'done' && !t.note) warn.push(`warning: ${t.id} done without evidence. Add what proves it: task ${t.id} done "<test, file, or command>"`);
      if (status === 'blocked' && !t.note) warn.push(`warning: ${t.id} blocked without a reason. Add exactly what is missing.`);
      const s = stats(plan);
      if (s.total && s.done === s.total) warn.push('all tasks are done. Check agents are completed, then run: node docs/ai/board/log.mjs finish');
      done(plan, loadAgents(), warn);
    });
    break;
  }
  case 'agent': {
    const [name, status, ...doingParts] = rest;
    if (!name || !status) die('usage: agent <name> <status> ["what it is doing"] [--evidence ...] [--needs ...] [--budget 10]');
    if (!AGENT_STATUS.includes(status)) die(`status must be one of: ${AGENT_STATUS.join(', ')}`);
    withLock(() => {
      const data = loadAgents();
      data.agents ??= {};
      const a = data.agents[name] ?? { name, startedAt: nowIso(), budgetMin: DEFAULT_BUDGET_MIN };
      if (status === 'running' && a.status !== 'running') { a.startedAt = nowIso(); delete a.finishedAt; }
      if (status !== 'running') a.finishedAt = nowIso();
      const doing = doingParts.join(' ').trim();
      a.status = status;
      if (doing) a.doing = clip(doing, 200);
      if (flags.evidence) a.evidence = clip(one(flags.evidence), 300);
      if (flags.needs) a.needs = clip(one(flags.needs), 300);
      if (status === 'completed') delete a.needs;
      if (flags.budget) a.budgetMin = Number(one(flags.budget)) || DEFAULT_BUDGET_MIN;
      a.updatedAt = nowIso();
      data.agents[name] = a;
      saveAgents(data);
      emit('agent', `${name} -> ${status}${a.doing ? `: ${a.doing}` : ''}${status === 'blocked' && a.needs ? ` (needs: ${a.needs})` : ''}`, { agent: name });
      const warn = [];
      if (status === 'blocked' || status === 'timed_out') warn.push(`STOP: ${name} is ${status}. Do not continue dependent work. Show the AGENT STATUS table and ask the user.`);
      if (status === 'completed' && !a.evidence) warn.push(`warning: ${name} completed without evidence. Add --evidence "<path or command output>".`);
      done(loadPlan(), data, warn);
    });
    break;
  }
  case 'finding': {
    withLock(() => {
      const plan = needPlan();
      plan.findings ??= [];
      const first = rest[0] ?? '';
      if (/^F-\d+$/i.test(first)) {
        const f = plan.findings.find((x) => x.id.toLowerCase() === first.toLowerCase());
        if (!f) die(`unknown finding ${first}`);
        f.state = rest[1] || 'fixed';
        emit('finding', `${f.id} ${f.state}`);
      } else {
        const severity = first;
        const text = rest.slice(1).join(' ').trim();
        if (!['critical', 'high', 'medium', 'low'].includes(severity) || !text) die('usage: finding <critical|high|medium|low> "<text>"   or   finding F-1 fixed');
        const f = { id: `F-${plan.findings.length + 1}`, severity, text: clip(text, 300), state: 'open' };
        plan.findings.push(f);
        emit('finding', `${f.id} ${severity}: ${text}`);
      }
      savePlan(plan);
      done(plan, loadAgents());
    });
    break;
  }
  case 'next': {
    withLock(() => {
      const plan = needPlan();
      plan.next = clip(rest.join(' '), 200);
      savePlan(plan);
      done(plan, loadAgents());
    });
    break;
  }
  case 'note': {
    const text = rest.join(' ').trim();
    if (!text) die('usage: note "<text>"');
    emit('note', text);
    console.log('noted');
    break;
  }
  case 'status': {
    const plan = loadPlan(); const agents = loadAgents();
    syncProgress();
    console.log(summaryLine(plan, agents));
    if (plan) for (const t of plan.tasks) console.log(`  ${t.id} [${t.status}] ${t.title}${t.owner ? ` (${t.owner})` : ''}${t.note ? ` - ${clip(t.note, 100)}` : ''}`);
    for (const a of Object.values(agents.agents ?? {})) console.log(`  agent ${a.name}: ${a.status}${a.doing ? ` - ${a.doing}` : ''}`);
    break;
  }
  case 'finish': {
    withLock(() => {
      const plan = needPlan();
      const agents = loadAgents();
      const open = plan.tasks.filter((t) => t.status !== 'done');
      const badAgents = Object.values(agents.agents ?? {}).filter((a) => a.status !== 'completed');
      const openFindings = (plan.findings ?? []).filter((f) => ['critical', 'high'].includes(f.severity) && f.state === 'open');
      const problems = [
        ...open.map((t) => `task ${t.id} is ${t.status}: ${t.title}`),
        ...badAgents.map((a) => `agent ${a.name} is ${a.status}`),
        ...openFindings.map((f) => `finding ${f.id} (${f.severity}) is still open`),
      ];
      if (problems.length && !flags.force) {
        console.error(`NOT FINISHED:\n  ${problems.join('\n  ')}\nFix them, or report them honestly as not done (use --force only when the final report lists them).`);
        console.log(summaryLine(plan, agents));
        process.exit(1);
      }
      plan.finishedAt = nowIso();
      if (rest.length) plan.next = clip(rest.join(' '), 200);
      savePlan(plan);
      emit('finish', `plan finished${problems.length ? ` with ${problems.length} open item(s)` : ''}`);
      done(plan, agents);
    });
    break;
  }
  case 'reset': {
    withLock(() => {
      for (const f of [FILES.plan, FILES.agents]) { try { rmSync(f, { force: true }); } catch { /* ignore */ } }
      emit('reset', 'state cleared');
    });
    syncProgress();
    console.log('state cleared');
    break;
  }
  default:
    console.error('usage: log.mjs plan|add|task|agent|finding|next|note|status|finish|reset   (see the header of this file)');
    process.exit(2);
}
