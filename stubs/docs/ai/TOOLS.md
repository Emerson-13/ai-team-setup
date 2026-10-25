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
| `pest` | MySQL preflight (`test-doctor.php`), then `pest --compact` | default, full |
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
gate (default): pint = cached | phpstan - skipped | pest FAIL 31.4s
--- pest FAIL (full log: docs/ai/state/gate/pest.log)
FAILED  Tests\Feature\BookingTest > it creates a booking
  Failed asserting that 1 matches expected 2.   at app/Services/BookingService.php:12
fix: fix the failing test or the code it covers; never skip, weaken or delete a test
GATE FAIL at pest
```

Why it saves tokens and time: unchanged code is **not re-run** (a cached pass), the run **stops at the first failure**, only the failing lines are printed, and the full output stays in `docs/ai/state/gate/<step>.log` (read it only when the printed lines are not enough, with a line range). A step with no output for 120 s is stopped (exit 124). Exit codes: 0 pass, 1 fail, 3 blocked (preflight failed, for example MySQL is down), 124 stalled. Every step also appears on the live board.

## 3. Finishing

`node docs/ai/board/log.mjs finish` on a Laravel project refuses until the default gate is **green for the code that exists now** (a `--quick` pass does not count, and an edit after the green run makes it stale). Docs-only change: `finish --skip-gate "<reason>"`; the reason is recorded and printed in the `LOG COVERAGE` line. A failing gate is fixed, not skipped: after 3 failed attempts report `blocked` with the log path.

## 4. Troubleshooting

| Problem | Fix |
|---|---|
| `ai:gate` or `ai:context` is not an npm script | `node docs/ai/board/setup.mjs` |
| `pest BLOCKED` with a preflight list | Fix what it lists (usually MySQL not running or `phpunit.xml` still on SQLite), then re-run |
| The gate says "cached" but you want a real run | `npm run ai:gate -- --force` |
| Map shows `static scan` for routes | The app could not boot for `route:list` (no `vendor/`, or no DB). Run `php artisan route:list --except-vendor` when exact paths matter |
| A step is wrong for this project | `npm run ai:gate -- --list` shows what runs and why a step is skipped |
