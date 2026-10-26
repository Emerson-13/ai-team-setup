#!/usr/bin/env node
// Run a command and log it to the board BY THE SCRIPT, so it does not depend on the agent remembering.
// Logs start, end, exit code, duration, the last output lines, and kills the command if it prints nothing for too long.
//   npm run ai:run -- npm run e2e
//   npm run ai:run -- php artisan test
//   node docs/ai/board/wrap.mjs --stall 180 --label "pest orders" -- php artisan test --filter=Order
// Options: --agent <name> (default $AI_BOARD_AGENT or "agent")  --label <text>  --stall <sec, default 120, 0 = off>  --timeout <sec, 0 = off>  --heartbeat <sec, default 30, 0 = off>
// A heartbeat line ("[ai:run id heartbeat] process alive, elapsed 180s, last output 12s ago") shows the command is alive while it is silent,
// and a silent command is only stopped when its process still exists at the limit (a dead one is reported with its real exit code).
// Long suites need long limits: Pest --stall 1800 --timeout 1800, Playwright --stall 300 --timeout 1800 (setup.mjs wires ai:test and e2e that way).
// Exit code is the command's own. 124 = stalled or timed out (reported as BLOCKED; do not run the same command again).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DEFAULT_STALL_SEC, appendEvent, clip, stripAnsi } from './lib.mjs';

const argv = process.argv.slice(2);
const opts = {};
let i = 0;
const known = new Set(['agent', 'label', 'stall', 'timeout', 'heartbeat']);
for (; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') { i++; break; }
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (m && known.has(m[1])) { opts[m[1]] = m[2] ?? argv[++i]; continue; }
  break;
}
const command = argv.slice(i);
if (!command.length) {
  console.error('usage: wrap.mjs [--agent n] [--label t] [--stall sec] [--timeout sec] [--heartbeat sec] -- <command...>');
  process.exit(2);
}

// Quote an argument for the shell: leave plain words alone, single-quote on POSIX, double-quote on Windows (so ( ) ; $ * and spaces survive).
const win = process.platform === 'win32';
const SAFE = /^[A-Za-z0-9_\/\\:=.,@%+-]+$/;
const q = (a) => (SAFE.test(a) ? a : win ? `"${a.replace(/"/g, '\\"')}"` : `'${a.replace(/'/g, "'\\''")}'`);
const text = command.length === 1 ? command[0] : command.map(q).join(' ');

if (process.env.AI_WRAPPED) {
  // Already inside a wrapper (for example `npm run ai:run -- npm run e2e`, where e2e is wrapped too): just run it, the outer one logs.
  const r = spawnSync(text, { shell: true, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const agent = opts.agent || process.env.AI_BOARD_AGENT || 'agent';
const stallSec = opts.stall === undefined ? (process.env.CI ? 0 : DEFAULT_STALL_SEC) : Number(opts.stall); // CI runs are not watched by an agent
const timeoutSec = opts.timeout === undefined ? 0 : Number(opts.timeout);
const heartbeatSec = opts.heartbeat === undefined ? 30 : Number(opts.heartbeat);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const id = randomBytes(3).toString('hex');
const label = opts.label || clip(text, 120);
const started = Date.now();

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
  clearInterval(timer); if (beat) clearInterval(beat);
  const ms = Date.now() - started;
  appendEvent({ source: 'wrap', agent, type: kind, id, text: `${label} -> ${reason || `exit ${code}`} (${(ms / 1000).toFixed(1)}s)`, data: { code, durationMs: ms, tail: tail.slice(-12) } });
  console.error(`[ai:run ${id}] ${reason || `exit ${code}`} in ${(ms / 1000).toFixed(1)}s`);
  process.exit(code);
}

const lastLines = () => (tail.length ? `last output:\n  ${tail.slice(-6).join('\n  ')}` : 'last output: (none at all)');
const timer = setInterval(() => {
  const now = Date.now();
  if (finished || !alive(child.pid)) return; // a process that is already gone reports its own exit code on close
  if (stallSec > 0 && now - lastOutput > stallSec * 1000) {
    console.error(`\n[ai:run ${id}] stopping: pid ${child.pid} alive, elapsed ${Math.round((now - started) / 1000)}s, no output for ${stallSec}s\n${lastLines()}`);
    killTree();
    console.error(`\nBLOCKED: no output for ${stallSec}s, command stopped. Run the doctor (npm run e2e:doctor, or php docs/ai/templates/laravel/test-doctor.php), report status blocked with this output, and do not start the same command again.`);
    finish(124, 'command_stalled', `STALLED, no output for ${stallSec}s`);
  } else if (timeoutSec > 0 && now - started > timeoutSec * 1000) {
    console.error(`\n[ai:run ${id}] stopping: pid ${child.pid} alive, hard limit of ${timeoutSec}s reached\n${lastLines()}`);
    killTree();
    console.error(`\nBLOCKED: time limit of ${timeoutSec}s reached, command stopped. Report status timed_out/blocked; do not start the same command again.`);
    finish(124, 'command_stalled', `TIMED OUT after ${timeoutSec}s`);
  }
}, 1000);
const beat = heartbeatSec > 0 ? setInterval(() => {
  if (finished) return;
  console.error(`[ai:run ${id} heartbeat] process ${alive(child.pid) ? 'alive' : 'gone, waiting for exit'}, elapsed ${Math.round((Date.now() - started) / 1000)}s, last output ${Math.round((Date.now() - lastOutput) / 1000)}s ago`);
}, heartbeatSec * 1000) : null;

child.on('error', (e) => finish(127, 'command_end', `could not start: ${e.message}`));
child.on('close', (code, signal) => finish(code ?? (signal ? 1 : 0), 'command_end', signal ? `killed by ${signal}` : undefined));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killTree(); finish(130, 'command_end', `interrupted (${sig})`); });
