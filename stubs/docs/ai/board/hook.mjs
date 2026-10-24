#!/usr/bin/env node
// OPTIONAL Claude Code hook (PostToolUse, SubagentStop). Logs real tool activity and mirrors the TodoWrite plan,
// so the board and docs/ai/progress.md update even when the agent forgets. Install: node docs/ai/board/setup.mjs --claude-hooks
// Reads the hook JSON from stdin. Never prints, never blocks, always exits 0.
import { appendEvent, clip, mirrorExternalPlan } from './lib.mjs';
import { loadAgents, saveAgents, withLock, nowIso } from './lib.mjs';

let raw = '';
const stop = setTimeout(() => process.exit(0), 3000); // never hang Claude Code
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try { handle(JSON.parse(raw || '{}')); } catch { /* ignore */ }
  clearTimeout(stop);
  process.exit(0);
});

function handle(h) {
  const event = h.hook_event_name;
  const tool = h.tool_name;
  const input = h.tool_input ?? {};
  const base = { source: 'hook', agent: h.agent_type || h.agent_name || 'claude' };

  if (event === 'SubagentStop') {
    const name = h.agent_type || h.agent_name;
    appendEvent({ ...base, type: 'subagent_stop', text: `subagent finished${name ? `: ${name}` : ''}` });
    if (name) {
      withLock(() => {
        const data = loadAgents();
        const a = data.agents?.[name];
        if (a && a.status === 'running') { a.status = 'completed'; a.finishedAt = nowIso(); a.updatedAt = nowIso(); a.evidence ||= 'SubagentStop hook'; saveAgents(data); }
      });
    }
    return;
  }
  if (event !== 'PostToolUse') return;

  if (tool === 'TodoWrite') {
    const todos = (input.todos ?? []).map((t) => ({ title: String(t.content ?? t.activeForm ?? ''), status: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'in_progress' : 'pending' }));
    const changed = mirrorExternalPlan('claude-todos', 'Claude Code plan', todos);
    if (changed) appendEvent({ ...base, type: 'plan', text: `plan ${todos.filter((t) => t.status === 'done').length}/${todos.length} done (TodoWrite)` });
    return;
  }
  if (tool === 'Task' || tool === 'Agent') {
    const name = input.subagent_type || 'subagent';
    appendEvent({ ...base, type: 'subagent_start', text: `${name}: ${clip(input.description || input.prompt, 140)}` });
    return;
  }
  if (tool === 'Bash') return appendEvent({ ...base, type: 'command', text: input.command });
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return appendEvent({ ...base, type: 'edit', text: `${tool} ${input.file_path || input.notebook_path || ''}` });
  if (['Read', 'Grep', 'Glob'].includes(tool)) return appendEvent({ ...base, type: 'read', text: `${tool} ${input.file_path || input.pattern || input.path || ''}` });
}
