import { execFileSync } from 'node:child_process';

/** True when nothing is listening on 127.0.0.1:port (tries to bind it in a child process; works on Windows and Linux). */
export function isPortFree(port: number): boolean {
  const script =
    "const s=require('net').createServer();" +
    "s.once('error',()=>process.exit(1));" +
    "s.listen(" + port + ",'127.0.0.1',()=>s.close(()=>process.exit(0)));";
  try {
    execFileSync(process.execPath, ['-e', script], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns `preferred` if it is free, otherwise the next free port (up to 50 higher).
 * The choice is stored in process.env[envKey] so Playwright workers (which re-load the config)
 * use the same port instead of picking again while the server is already running.
 */
export function pickFreePort(preferred: number, envKey = 'E2E_PORT'): number {
  const cached = Number(process.env[envKey]);
  if (cached) return cached;

  for (let port = preferred; port < preferred + 50; port++) {
    if (isPortFree(port)) {
      if (port !== preferred) {
        console.warn(`[e2e] port ${preferred} is busy, using ${port} for the test server.`);
      }
      process.env[envKey] = String(port);
      return port;
    }
  }
  throw new Error(`No free port found from ${preferred} to ${preferred + 49}. Stop the processes using them (see docs/ai/PLAYWRIGHT.md, "Port busy").`);
}
