// Test helpers: build a throw-away Laravel-shaped project that contains the installed docs/ai folder.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PKG = resolve(here, '..');

export function project({ laravel = true, fixture = false, scripts = { build: 'node -e "process.exit(0)"' } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aiteam-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  cpSync(join(PKG, 'stubs/docs/ai'), join(dir, 'docs/ai'), { recursive: true });
  if (fixture) cpSync(join(here, 'fixtures/laravel-sample'), dir, { recursive: true });
  if (laravel) writeFileSync(join(dir, 'artisan'), '<?php\n');
  if (!fixture) writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts }, null, 2));
  return dir;
}

export function node(dir, script, args = [], env = {}) {
  const r = spawnSync(process.execPath, [join(dir, script), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env, AI_BOARD_ROOT: dir }, timeout: 120000 });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

export const log = (dir, ...a) => node(dir, 'docs/ai/board/log.mjs', a);
export const gate = (dir, a = [], env = {}) => node(dir, 'docs/ai/tools/gate.mjs', a, env);
export const context = (dir, a = [], env = {}) => node(dir, 'docs/ai/tools/context.mjs', a, env);

// a fake PHP tool: php vendor/bin/<name> behaves according to <name>.mode in the project root (pass | fail | stall)
export function fakeTool(dir, name, { failText = 'FAILED  Tests\\Feature\\BookingTest > it creates a booking' } = {}) {
  mkdirSync(join(dir, 'vendor/bin'), { recursive: true });
  writeFileSync(join(dir, `vendor/bin/${name}`), `<?php
$mode = trim(@file_get_contents(__DIR__ . '/../../${name}.mode') ?: 'pass');
if ($mode === 'stall') { echo "started\\n"; sleep(30); exit(0); }
if ($mode === 'fail') { for ($i = 0; $i < 60; $i++) echo "noise line $i\\n"; echo "${failText}\\n"; echo "  Failed asserting that 1 matches expected 2.\\n  at app/Services/BookingService.php:12\\n"; echo "  Tests:    1 failed, 4 passed\\n"; exit(1); }
echo "ok\\n"; exit(0);
`);
  setMode(dir, name, 'pass');
}
export const setMode = (dir, name, mode) => writeFileSync(join(dir, `${name}.mode`), mode);
export const hasPhp = spawnSync('php', ['-v']).status === 0;
