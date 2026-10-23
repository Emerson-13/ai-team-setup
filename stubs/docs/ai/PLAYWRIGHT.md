# Playwright E2E Guide (QA Automation Engineer)

> Roles, admin side, and client side: also read `docs/ai/ACCESS.md` and adapt `specs/access-matrix.spec.ts`.
>
> Companion to `docs/ai/TEAM.md` (Sections 21, 21.1, 26, 27). Browser/E2E tests in this stack use **Playwright**. Dusk is not used. Backend tests stay in Pest on **MySQL**.
>
> Ready-to-copy templates: `docs/ai/templates/playwright/` (config, global setup, auth setup, four example specs, `.env.e2e.example`, seeder stub, GitHub Actions workflow). The TypeScript templates were type-checked; they have **not** been run against your app, so the first run is part of setup (mark **Not Tested** until it passes).

---

## 1. What E2E is for (and not for)

| Use Playwright for | Use Pest (backend) for | Use Vitest for |
|---|---|---|
| Critical journeys through the real UI + real server + real MySQL | Business rules, validation, policies, services, API contract | Component and composable logic |
| Cross-tenant access through URLs and the browser session | Tenant scoping at query level | Pure TypeScript helpers |
| Realtime (two browsers, Reverb) | Event dispatch and channel authorization callbacks | |
| Public page SEO tags, accessibility smoke, responsive smoke | Analytics event recording (server side) | |

Do not duplicate: if a rule is fully covered by a fast Pest test, E2E only needs to prove the **journey** reaches it.

---

## 2. Setup (once per project)

```bash
npm install --save-dev @playwright/test @axe-core/playwright
npx playwright install chromium          # Linux CI: npx playwright install --with-deps chromium
```

Copy from the templates:

| From `docs/ai/templates/playwright/` | To project root |
|---|---|
| `playwright.config.ts` | `playwright.config.ts` |
| `tests/e2e/**` | `tests/e2e/**` |
| `.env.e2e.example` | `.env.e2e` (git-ignored; add `APP_KEY`) |
| `E2ESeeder.php` | `database/seeders/E2ESeeder.php` (adapt to the project) |
| `github-workflows/e2e.yml` | `.github/workflows/e2e.yml` |

`package.json` scripts:

```json
{
  "scripts": {
    "build:e2e": "vite build --mode e2e",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:watch": "playwright test --headed --workers=1",
    "e2e:doctor": "node tests/e2e/support/doctor.mjs",
    "e2e:report": "playwright show-report"
  }
}
```

`.gitignore`:

```text
.env.e2e
/playwright/.auth/
/playwright-report/
/test-results/
```

Create the database once (MySQL): `CREATE DATABASE app_e2e CHARACTER SET utf8mb4;`

Run:

```bash
npm run build:e2e      # builds assets with .env.e2e values (VITE_REVERB_* etc.); re-run when frontend code changes
npm run e2e            # starts php artisan serve (+ Reverb if BROADCAST_CONNECTION=reverb), resets + seeds MySQL, runs specs
npm run e2e:ui         # interactive mode while writing tests
```

---

## 3. How the environment is isolated

```text
.env.e2e   APP_ENV=e2e   DB_CONNECTION=mysql   DB_DATABASE=app_e2e   QUEUE_CONNECTION=sync
```

- **Safety guard:** the config and global setup throw unless `DB_CONNECTION=mysql`, `DB_DATABASE` ends in `_e2e`, and `APP_ENV=e2e`. The suite cannot wipe `app` or `app_testing`.
- **Reset and seed:** `global-setup.ts` runs `php artisan migrate:fresh --seed --seeder=E2ESeeder --force` with the e2e env.
- **Server:** the config starts `php artisan serve` with the e2e env forced, and Reverb when realtime is configured. It uses the `APP_URL` port if it is free and **automatically picks the next free port if it is busy** (it prints which one). It never reuses a server it did not start, because that server may point at another database. Opt in with `E2E_REUSE_SERVER=1` only when you started that server yourself with the e2e env.
- **Queue:** `sync` by default, so jobs and `ShouldBroadcast` events run inline and no worker is needed. If a feature must be proven through a real worker, add a separate, clearly named spec project that starts `queue:work` and document it in the Team Brief.
- **Mail:** `MAIL_MAILER=log`; assert on side effects in the UI or via a Pest test, not on real delivery.
- **Time and locale:** UTC and `en-US` are fixed in the config for stable assertions.

---

## 4. Seed data and tenants

The E2E seeder (`database/seeders/E2ESeeder.php`) creates, with fixed emails and ids:

- two companies (A and B), so isolation can be tested;
- one user per role that matters (admin, limited staff) in A, and an admin in B;
- known records with fixed ids/numbers in B (for denial tests) and in A (for journeys);
- permission cache reset if `spatie/laravel-permission` is used.

Rules:

- `tests/e2e/support/users.ts` and the seeder must agree. Change both together.
- Tests that **create** data use unique names (`Date.now()` suffix) so parallel workers do not collide.
- Tests that **destroy or mutate shared seeded rows** run serially (`test.describe.configure({ mode: 'serial' })`) or create their own rows first.
- Never rely on test order across files.

---

## 5. Authentication

`auth.setup.ts` logs in once per role through the real login form and saves the session to `playwright/.auth/<role>.json`. Specs opt in per file:

```ts
test.use({ storageState: USERS.adminA.file });
```

Unauthenticated specs use `NO_AUTH`. Adapt label text and the landing URL to the app's login page. If login uses 2FA or SSO, seed a test-only bypass that exists **only when `APP_ENV=e2e`**, and have the Security Reviewer approve it.

---

## 6. Writing tests

**Source of truth:** acceptance criteria. The test title starts with the AC id: `AC-7: company A admin cannot open a company B record page`. Write the test from the AC and the user flow **before** reading the implementation, then adapt locators.

**Per feature, minimum set:**

```text
1. Main journey (happy path through the UI to a visible, persisted result; reload and confirm it persisted)
2. One validation failure (error message visible, data not saved)
3. Authorization: a role without permission cannot see/do it (button hidden AND direct URL denied)
4. Tenant isolation: other company's record URL is 403/404 and its data never appears in lists
5. Empty state or error state that matters to the user
6. Realtime: second browser sees the change (only if the feature broadcasts)
```

**Locator order:** `getByRole` -> `getByLabel` -> `getByText` -> `getByTestId` (add `data-testid` only where the first three are ambiguous). No CSS chains, no `nth()` on unstable lists.

**Waiting:** use web-first assertions (`await expect(locator).toBeVisible()`, `toHaveText`, `toHaveURL`), which auto-wait. **No `waitForTimeout`.** To wait for a request use `page.waitForResponse(...)` registered **before** the action.

**Inertia specifics:**

- Navigation is client-side: assert `toHaveURL` and a visible landmark, not a full page load event.
- After a form post, assert the redirect target and the flash/toast text, then reload and assert persistence.
- Validation errors render from Inertia `errors`; assert the visible message next to the field.
- Partial reloads (`router.reload({ only: [...] })`) show up as XHR with `X-Inertia`; assert on the DOM result.

**Tables and lists:** locate rows by accessible name or unique text, not by index.

**File uploads:** `locator.setInputFiles()` with a fixture file under `tests/e2e/fixtures/`; assert the stored file is listed, and that another tenant cannot download it.

**Dialogs and destructive actions:** assert the confirmation appears; test both cancel and confirm.

**API checks inside E2E:** use the `request` fixture (it shares the project's `storageState`) for IDOR checks and for fast data setup that the UI journey does not need to prove.

**Page objects:** only when three or more specs share the same screen; otherwise keep specs flat and readable.

**Tags:** `@mobile` runs the responsive smoke project; `@slow` for long journeys excluded from the quick run (`--grep-invert @slow`).

---

## 7. Specialized checks

| Check | How | Template |
|---|---|---|
| **Tenant isolation** | `tenant-isolation.spec.ts`: A's session opens B's record URL and B's API URL; expect 403/404 and no B text in lists | provided |
| **Realtime / Reverb** | Two contexts; wait for `/broadcasting/auth` 200 on the watcher before acting; assert update without reload, 15s timeout | `realtime.spec.ts` |
| **SEO tags** | Title, meta description, canonical, `og:title`, one `h1` on public pages | `seo-a11y.spec.ts` |
| **Accessibility smoke** | `@axe-core/playwright`; fail on critical/serious | `seo-a11y.spec.ts` |
| **Responsive smoke** | Tag key specs `@mobile`; the `mobile` project uses a phone viewport | config |
| **Visual regression** | `await expect(page).toHaveScreenshot()` on stable, seeded pages only; snapshots generated and reviewed on the same OS as CI (Linux). Update intentionally with `--update-snapshots` and review the diff. Optional, not default | - |
| **Billing/payments** | Use the provider's test mode or a fake gateway bound only when `APP_ENV=e2e`; never real charges | - |
| **Analytics/lifecycle events** | Prove the server records the event in a **Pest** test; Playwright only proves the user action that triggers it | - |

---

## 8. Debugging and flakiness

```bash
npx playwright test path/to/spec.ts --headed --debug     # step through
npx playwright test --ui                                  # time-travel UI
npx playwright show-trace test-results/<run>/trace.zip   # after a retry on CI
npx playwright codegen http://127.0.0.1:8001             # draft locators (clean them up)
```

**Flaky test policy:** a test that fails then passes on retry is a defect to fix, not noise. Find the cause (race, shared data, missing wait, real bug), fix it, and note it in the report. **Never** skip, loosen assertions, or add sleeps to get green. If a test must be quarantined, mark it with `test.fixme` plus a ticket reference and list it under **Known Limitation**.

**Real failure vs test failure:** use the trace, screenshot, and server log (`storage/logs/laravel.log` of the e2e run). If the app is wrong, report a finding (F-n) to the Orchestrator; if the test is wrong, fix the test and say why.

---

### Watching a run

| Goal | How |
|---|---|
| Watch live with timeline and DOM snapshots | `npm run e2e:ui` (best option on your own machine) |
| Watch the real browser click and type | `npm run e2e:watch`. Slow it down: PowerShell `$env:E2E_WATCH=1; npm run e2e:watch`, bash `E2E_WATCH=1 npm run e2e:watch` (adds slow-motion and records trace, video and screenshots for every test) |
| Review after the run | `npm run e2e:report` (HTML report), `npx playwright show-trace <trace.zip>` |

Headed and UI modes need a screen. In CI, a cloud sandbox, or an agent running in the background there is no window to watch; use the report, trace, and video instead. **At the end of every E2E run the QA Automation Engineer reports the HTML report path and the trace/video paths of failed tests, and says whether the run was headless.**

## 8.1 Preflight, stalls, and port conflicts

**Run the preflight first, every time:** `npm run e2e:doctor`. It checks in under a few seconds: Node, `@playwright/test`, the Chromium browser, PHP, `.env.e2e` (MySQL, `_e2e` database, `APP_ENV=e2e`, `APP_KEY`), whether MySQL answers (3 s timeout), and the ports. If it prints FAIL, **stop and report `blocked` with its output**; do not start the suite and do not retry until it passes.

| Symptom | Cause | Fix |
|---|---|---|
| "Port 8001 is already used" or the run waits then times out | A stale `php artisan serve` or another app holds the port | The config now picks the next free port by itself. To free it: Windows `Get-NetTCPConnection -LocalPort 8001 \| Select OwningProcess` then `Stop-Process -Id <id>`; Linux/macOS `lsof -i :8001` then `kill <pid>` |
| Test discovery (`--list`) prints nothing and seems stuck | Plain `npx playwright` is waiting for a download prompt because `@playwright/test` is not installed | `npm install --save-dev @playwright/test`, then always use `npm run e2e -- --list` or `npx --no-install playwright test --list` |
| Setup hangs, then "Database reset failed or timed out" | MySQL is not running, wrong host or credentials, or the `_e2e` database does not exist | `npm run e2e:doctor`; start MySQL; use `DB_HOST=127.0.0.1`; create the database |
| Pest stalls at bootstrap | Same MySQL causes, for the `_testing` database | `php docs/ai/templates/laravel/test-doctor.php` |
| An agent's in-app browser fails (for example a sandbox or metadata error) | The agent's browser tool is unavailable | **E2E does not use it.** Playwright starts its own Chromium from the shell. Do not retry the browser tool. Run `npm run e2e`; if the shell also cannot run it, mark UI verification **Not Tested** with the exact error |

**Rules for agents:**

- A command with **no output for 120 seconds** is stalled: stop it, run the doctor, and report `blocked` with the output. Do not wait longer and do not start the same command again.
- Run Playwright from the shell with a hard time limit, for example `npm run e2e -- --reporter=line --timeout=60000 --global-timeout=900000`.
- Start nothing you cannot stop. If you start a server, you stop it when you finish.
- Never kill a process you did not start without telling the user which process and port.
- Never report "E2E passed" unless `npx playwright test` ran and printed its result. Otherwise: **Not Tested**, with the reason.

## 9. Optional AI-assisted exploration (never a substitute for committed specs)

- **Playwright MCP** (`@playwright/mcp`) lets an agent drive a real browser for exploratory checks, for example `claude mcp add playwright npx @playwright/mcp@latest` in Claude Code. Verify the current install instructions for your tool.
- Newer Playwright versions ship planner/generator/healer test agents. If used, the healer must not weaken assertions to make a test pass; review every change like a code review.
- Anything found exploratorily becomes a written spec with an AC id, or a finding.

---

## 10. CI

`github-workflows/e2e.yml` provides: MySQL 8 service, PHP and Node setup, `.env.e2e` creation, `npm run build:e2e`, browser install, test run, report/trace upload on failure. Adjust PHP/Node versions and the Laravel health route (`/up`) to the project.

For shared hosting deploys (for example Hostinger via GitHub Actions), run E2E in the **CI job before deploy**, not on the host.

---

## 11. Definition of done for E2E (QA Automation Engineer)

```text
[ ] Every AC that is user-visible has a spec (or a recorded reason it is covered elsewhere)
[ ] Journey, validation failure, authorization denial, tenant isolation (and realtime if applicable) covered
[ ] Tests written from AC/flows first, then adapted to the UI
[ ] Suite runs green locally and in CI against MySQL *_e2e (never SQLite)
[ ] No waitForTimeout, no skipped/weakened tests, flakes fixed or listed as Known Limitation
[ ] Report states: specs written, specs run, pass/fail/not run, trace paths for failures, report location
```

Report format:

```text
E2E (Playwright): <n> specs, <n> passed, <n> failed, <n> not run (reason)
Environment: MySQL app_e2e, APP_ENV=e2e, Reverb: yes/no, queue: sync
Covered ACs: AC-1..AC-n | Not covered: ... (why)
Failures: spec, cause, finding id (F-n), trace path
Status: Implemented | Tested | Verified | Not Tested | Known Limitation
```
