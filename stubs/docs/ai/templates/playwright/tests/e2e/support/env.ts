import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Minimal .env parser (KEY=value, quotes stripped, comments ignored). */
export function loadE2EEnv(): Record<string, string> {
  const file = resolve(process.cwd(), '.env.e2e');
  if (!existsSync(file)) {
    throw new Error('Missing .env.e2e. Copy docs/ai/templates/playwright/.env.e2e.example to .env.e2e and adjust it.');
  }
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    const quoted = /^(["']).*\1$/.test(value);
    if (!quoted) value = value.replace(/(^|\s+)#.*$/, '');   // strip inline comments on unquoted values
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/** Safety guard: E2E may wipe the database, so it must never point at a real one. */
export function assertSafeE2EDatabase(env: Record<string, string>): void {
  const db = env.DB_DATABASE ?? '';
  if (env.DB_CONNECTION !== 'mysql') {
    throw new Error(`Refusing to run: DB_CONNECTION must be "mysql" (got "${env.DB_CONNECTION}"). SQLite is not allowed.`);
  }
  if (!/_e2e$/.test(db)) {
    throw new Error(`Refusing to run: DB_DATABASE "${db}" must end with "_e2e".`);
  }
  if (env.APP_ENV !== 'e2e') {
    throw new Error(`Refusing to run: APP_ENV must be "e2e" (got "${env.APP_ENV}").`);
  }
}

/** Variables forced onto every Laravel process so real OS env wins over any other .env file. */
export function laravelProcessEnv(env: Record<string, string>): Record<string, string> {
  const keys = ['DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'];
  const forced: Record<string, string> = { APP_ENV: 'e2e' };
  for (const key of keys) {
    if (env[key] !== undefined) forced[key] = env[key];
  }
  return forced;
}
