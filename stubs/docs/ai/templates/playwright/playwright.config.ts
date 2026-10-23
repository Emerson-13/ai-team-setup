import { defineConfig, devices } from '@playwright/test';
import { assertSafeE2EDatabase, laravelProcessEnv, loadE2EEnv } from './tests/e2e/support/env';
import { pickFreePort } from './tests/e2e/support/ports';

// Reads .env.e2e and REFUSES to run unless DB_DATABASE ends with "_e2e" (never touches dev/prod data).
const e2eEnv = loadE2EEnv();
assertSafeE2EDatabase(e2eEnv);

// The test server gets a FREE port: the preferred one from APP_URL, or the next free one if it is busy.
// Reusing an already-running server is opt-in (E2E_REUSE_SERVER=1) because that server may point at another database.
const REUSE_SERVER = process.env.E2E_REUSE_SERVER === '1';
const PREFERRED_PORT = Number(new URL(e2eEnv.APP_URL ?? 'http://127.0.0.1:8001').port || 8001);
const APP_PORT = REUSE_SERVER ? PREFERRED_PORT : pickFreePort(PREFERRED_PORT);
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const processEnv = { ...laravelProcessEnv(e2eEnv), APP_URL };

const REALTIME = e2eEnv.BROADCAST_CONNECTION === 'reverb';
// E2E_WATCH=1 -> slow-motion, plus trace/video/screenshot for every test (use with --headed or --ui).
const WATCH = process.env.E2E_WATCH === '1';
const REVERB_PORT = Number(e2eEnv.REVERB_SERVER_PORT ?? e2eEnv.REVERB_PORT ?? 8080);

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,                    // destructive specs: test.describe.configure({ mode: 'serial' })
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,        // retries expose flakiness; they are not a fix
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: APP_URL,
    trace: WATCH ? 'on' : 'on-first-retry',
    screenshot: WATCH ? 'on' : 'only-on-failure',
    video: WATCH ? 'on' : 'retain-on-failure',
    launchOptions: { slowMo: WATCH ? Number(process.env.E2E_SLOWMO ?? 300) : 0 },
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      grep: /@mobile/,                    // only specs tagged @mobile
    },
  ],
  webServer: [
    {
      command: `php artisan serve --host=127.0.0.1 --port=${APP_PORT} --no-reload`,
      url: `${APP_URL}/up`,                // Laravel 11+ health route
      env: processEnv,
      reuseExistingServer: REUSE_SERVER,
      timeout: 120_000,
    },
    ...(REALTIME
      ? [
          {
            command: `php artisan reverb:start --host=127.0.0.1 --port=${REVERB_PORT}`,
            port: REVERB_PORT,
            env: processEnv,
            reuseExistingServer: REUSE_SERVER,
            timeout: 120_000,
          },
        ]
      : []),
  ],
});
