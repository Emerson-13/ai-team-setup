#!/usr/bin/env node
// Run a command and log it to the board BY THE SCRIPT, so it does not depend on the agent remembering.
// Logs start, end, exit code, duration, the last output lines, and kills the command if it prints nothing for too long.
//   npm run ai:run -- npm run e2e
//   npm run ai:run -- php artisan test
//   node docs/ai/board/wrap.mjs --stall 180 --label "pest orders" -- php artisan test --filter=Order
// Options: --agent <name> (default $AI_BOARD_AGENT or "agent")  --label <text>  --stall <sec, default 120, 0 = off>  --timeout <sec, 0 = off>
// Exit code is the command's own. 124 = stalled or timed out (reported as BLOCKED; do not run the same command again).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DEFAULT_STALL_SEC, appendEvent, clip, stripAnsi } from './lib.mjs';

const argv = process.argv.slice(2);
const opts = {};
let i = 0;
const known = new Set(['agent', 'label', 'stall', 'timeout']);
for (; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') { i++; break; }
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (m && known.has(m[1])) { opts[m[1]] = m[2] ?? argv[++i]; continue; }
  break;
}
const command = argv.slice(i);
if (!command.length) {
  console.error('usage: wrap.mjs [--agent n] [--label t] [--stall sec] [--timeout sec] -- <command...>');
  process.exit(2);
}

if (process.env.AI_WRAPPED) {
  // Already inside a wrapper (for example `npm run ai:run -- npm run e2e`, where e2e is wrapped too): just run it, the outer one logs.
  const r = spawnSync(command.length === 1 ? command[0] : command.map((a) => (/[\s"'&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' '), { shell: true, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const agent = opts.agent || process.env.AI_BOARD_AGENT || 'agent';
const stallSec = opts.stall === undefined ? (process.env.CI ? 0 : DEFAULT_STALL_SEC) : Number(opts.stall); // CI runs are not watched by an agent
const timeoutSec = opts.timeout === undefined ? 0 : Number(opts.timeout);
const q = (a) => (/[\s"'&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const text = command.length === 1 ? command[0] : command.map(q).join(' ');
const id = randomBytes(3).toString('hex');
const label = opts.label || clip(text, 120);
const started = Date.now();
const win = process.platform === 'win32';

appendEvent({ source: 'wrap', agent, type: 'command_start', id, text: label, data: { command: clip(text, 500), stallSec, timeoutSec } });
console.error(`[ai:run ${id}] ${clip(text, 160)}`);

const child = spawn(text, { shell: true, detached: !win, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, AI_WRAPPED: '1' } });
let lastOutput = Date.now();
const tail = [];
const keep = (chunk) => {
  lastOutput = Date.now();
  for (const l of stripAnsi(chunk.toString()).split(/\r?\n/)) if (l.trim()) { tail.push(l); if (tail.length > 15) tail.shift(); }
};
child.stdout.on('data', (c) => { keep(c); process.stdout.write(c); });
child.stderr.on('data', (c) => { keep(c); process.stderr.write(c); });

function killTree() {
  try {
    if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 10000 });
    else process.kill(-child.pid, 'SIGKILL');
  } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
}

let finished = false;
function finish(code, kind, reason) {
  if (finished) return;
  finished = true;
  clearInterval(timer);
  const ms = Date.now() - started;
  appendEvent({ source: 'wrap', agent, type: kind, id, text: `${label} -> ${reason || `exit ${code}`} (${(ms / 1000).toFixed(1)}s)`, data: { code, durationMs: ms, tail: tail.slice(-12) } });
  console.error(`[ai:run ${id}] ${reason || `exit ${code}`} in ${(ms / 1000).toFixed(1)}s`);
  process.exit(code);
}

const timer = setInterval(() => {
  const now = Date.now();
  if (stallSec > 0 && now - lastOutput > stallSec * 1000) {
    killTree();
    console.error(`\nBLOCKED: no output for ${stallSec}s, command stopped. Run the doctor (npm run e2e:doctor, or php docs/ai/templates/laravel/test-doctor.php), report status blocked with this output, and do not start the same command again.`);
    finish(124, 'command_stalled', `STALLED, no output for ${stallSec}s`);
  } else if (timeoutSec > 0 && now - started > timeoutSec * 1000) {
    killTree();
    console.error(`\nBLOCKED: time limit of ${timeoutSec}s reached, command stopped. Report status timed_out/blocked; do not start the same command again.`);
    finish(124, 'command_stalled', `TIMED OUT after ${timeoutSec}s`);
  }
}, 1000);

child.on('error', (e) => finish(127, 'command_end', `could not start: ${e.message}`));
child.on('close', (code, signal) => finish(code ?? (signal ? 1 : 0), 'command_end', signal ? `killed by ${signal}` : undefined));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killTree(); finish(130, 'command_end', `interrupted (${sig})`); });
