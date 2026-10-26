# TOOLS.md: quality gate and project map (cheap in tokens)

Two scripts that replace expensive agent habits. Both are plain Node (18+), run locally, and cost **no model tokens**. Install the scripts once: `node docs/ai/board/setup.mjs` (adds `npm run ai:gate` and `npm run ai:context`).

## 1. Project map: `npm run ai:context`

Instead of exploring the repo file by file, read a generated map (~2-3k tokens): stack and versions, tables from migrations, models with relations, routes, policies, controller and service methods, Inertia pages, tests.

| Command | Use |
|---|---|
| `npm run ai:context -- --find Booking` | **Default.** Prints only the lines that mention the term. Use this before `rg` or opening files |
| `npm run ai:context -- --section tables` | One section: `stack`, `tables`, `models`, `routes`, `policies`, `classes`, `pages`, `tests` |
| `npm run ai:context` | Builds the map if code changed, otherwise prints one "fresh" line |
| `npm run ai:context -- --print` | The whole map. Avoid; only for a first look at a new project |

Rules: it is a **map, not the code**. Open the real file before editing it; if they disagree, the file wins. Routes come from `php artisan route:list --json` when the app can boot (25 s limit), otherwise from a static scan that does not resolve route groups or prefixes (the header says which). The map is rebuilt only when the relevant files changed, and is written to `docs/ai/state/context.md` (git-ignored).

## 2. Quality gate: `npm run ai:gate`

Runs the project's real checks in order and prints **one line per step**. Steps the project does not have are skipped.

| Step | Command | In mode |
|---|---|---|
| `pint` | `php vendor/bin/pint --test` | quick, default, full |
| `phpstan` | `phpstan analyse` (needs a phpstan config) | quick, default, full |
| `pest` | MySQL preflight (`test-doctor.php`), then `pest` (full progress output) | default, full |
| `types` | `npm run type-check` (or `typecheck`) | quick, default, full |
| `build` | `npm run build` | default, full |
| `e2e` | Playwright doctor, then `npm run e2e:raw` | full |
| `composer-audit`, `npm-audit` | `composer audit`, `npm audit --audit-level=high` (offline = skipped, not failed) | full |

```bash
npm run ai:gate                 # default: while finishing a task
npm run ai:gate -- --quick      # static checks only: cheap, while coding
npm run ai:gate -- --full       # also e2e and audits: before release or for L/XL work
npm run ai:gate -- --only pest --keep-going --force --list
```

Example output when something fails (this is all the agent reads):

```text
gate (default): pint = cached | phpstan - skipped | pest FAILED 31.4s | types not run | build not run
--- pest FAILED (full log: docs/ai/state/gate/pest.log) [command 3e77fd]
FAILED  Tests\Feature\BookingTest > it creates a booking
  Failed asserting that 1 matches expected 2.   at app/Services/BookingService.php:12
fix: fix the failing test or the code it covers; never skip, weaken or delete a test
stopped at the first failure; 2 later step(s) not run.
GATE FAIL at pest [FAILED] | last green: 2026-10-26T08:12:41.000Z
```

Why it saves tokens and time: unchanged code is **not re-run** (a cached pass), the run **stops at the first failure**, only the failing lines are printed, and the full output stays in `docs/ai/state/gate/<step>.log` (read it only when the printed lines are not enough, with a line range). Every step also appears on the live board.

### Limits, heartbeat and statuses (v1.0.14)

Each step has its own limits, so a long Pest run is not judged by the rule for a lint:

| Step | No output (stall) | Hard timeout |
|---|---|---|
| `pest` | 1800 s | 1800 s |
| `e2e` | 300 s | 1800 s |
| `build` | 300 s | 300 s |
| `phpstan`, `types` | 180 s | 180 s |
| `pint`, audits | 120 s | 120 s |

`--stall <s>`, `--timeout <s>` and `--heartbeat <s>` override them for one run (`AI_STALL_SECONDS`, `AI_TIMEOUT_SECONDS`, `AI_HEARTBEAT_SECONDS` do the same; `--heartbeat 0` is off). `npm run ai:gate -- --list` prints the limits in force.

* **Heartbeat.** Every 30 s: `[Pest heartbeat] process alive, elapsed 180s, last output 12s ago`. Silence is not failure; a command is stopped only when it is silent past its stall limit **and** its process still exists. A process that already ended reports its own exit code.
* **Diagnostics before the kill.** `docs/ai/state/gate/<step>.diag.txt` holds the command, elapsed time, PID, child processes, last output, current database, memory, ports in use and the Laravel log tail. Read it before deciding anything.
* **Statuses and exit codes.**

| Status | Meaning | Exit |
|---|---|---|
| `FAILED` | a real test or code failure | 1 |
| `BLOCKED` | the preflight (doctor) failed; nothing was run | 3 |
| `STALLED` | no output past the limit, process still alive | 124 |
| `TIMED_OUT` | the hard limit was reached | 125 |
| `CANCELLED` | stopped by hand (Ctrl+C, kill); never counts as a pass | 130 |

* **Whole-plan summary.** The one-line summary is printed even when a step stops the run: `pint ok | phpstan ok | pest STALLED | types not run | build not run`.
* **Board.** A stall, timeout, block or cancel sets your agent to `blocked` with the command id and log paths as evidence (`--no-board` turns it off; `--task T4` or `AI_BOARD_TASK=T4` also marks that task, and notes the command id on it while it runs). Live state is in `docs/ai/state/gate-live.json` (step, PID, elapsed, last heartbeat, last output).
* **Cache.** A pass is reused only while the content of the files it depends on is unchanged (a touched file with the same content is still cached). `phpunit.xml`, `.env.testing`, `.env.e2e`, `composer.lock`, `package-lock.json`, the gate scripts and the command line itself are all part of the fingerprint, so changing the gate never reuses an old result.
* **Last green.** `gate.json` keeps the time and code fingerprint of the last green default/full gate; `npm run ai:gate -- --status` prints it and says whether the code has changed since. A passing run prints it as `evidence: ...` for the agent status.

## 3. Finishing

`node docs/ai/board/log.mjs finish` on a Laravel project refuses until the default gate is **green for the code that exists now** (a `--quick` pass does not count, and an edit after the green run makes it stale). Docs-only change: `finish --skip-gate "<reason>"`; the reason is recorded and printed in the `LOG COVERAGE` line. A cancelled or interrupted gate run is refused too (a stopped run is not a pass). A failing gate is fixed, not skipped: after 3 failed attempts report `blocked` with the log path.

## 4. Troubleshooting

| Problem | Fix |
|---|---|
| `ai:gate` or `ai:context` is not an npm script | `node docs/ai/board/setup.mjs` |
| `pest BLOCKED` with a preflight list | Fix what it lists (usually MySQL not running or `phpunit.xml` still on SQLite), then re-run |
| `pest STALLED` or `TIMED_OUT` | Read `docs/ai/state/gate/pest.diag.txt` (database, child processes, Laravel log). Do not re-run the same command until the cause is known |
| The gate says "cached" but you want a real run | `npm run ai:gate -- --force` |
| Map shows `static scan` for routes | The app could not boot for `route:list` (no `vendor/`, or no DB). Run `php artisan route:list --except-vendor` when exact paths matter |
| A step is wrong for this project | `npm run ai:gate -- --list` shows what runs and why a step is skipped |
