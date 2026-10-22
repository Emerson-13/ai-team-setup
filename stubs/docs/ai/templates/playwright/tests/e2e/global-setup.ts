import { execFileSync } from 'node:child_process';
import { assertSafeE2EDatabase, laravelProcessEnv, loadE2EEnv } from './support/env';

/**
 * Resets the MySQL *_e2e database and seeds known data before the suite.
 * Refuses to run against anything that is not an *_e2e MySQL database.
 */
export default async function globalSetup(): Promise<void> {
  const env = loadE2EEnv();
  assertSafeE2EDatabase(env);

  execFileSync('php', ['artisan', 'migrate:fresh', '--seed', '--seeder=E2ESeeder', '--force'], {
    stdio: 'inherit',
    env: { ...process.env, ...laravelProcessEnv(env) },
  });
}
