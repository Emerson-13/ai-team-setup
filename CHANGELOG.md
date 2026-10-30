# Changelog

## 1.0.15
- `UI.md` rewritten as a UI/UX playbook. The old rule "one ready-made kit, never hand-made CSS" stays kit-first, but agents may now build their own reusable components when the kit has none.
- **Layout first:** every page uses a layout from the layouts folder; every authenticated layout is header + sidebar, chosen by app type (admin, multi-tenant SaaS, HRIS/ERP, booking, seller dashboard, POS, client portal, storefront, auth, wizard). A missing layout is created before the page. Navigation comes from one permission-filtered config.
- **Components first:** decision order (existing, kit, one new reusable, page-specific last); shared tabs, buttons, fields, modal shell, cards, table, badges; props/slots/typed-emits contract; per-page component manifest.
- **Composables:** modal, confirm, data table/filters, URL tabs, form, permissions, toast; thin pages.
- **UX decision-making:** four questions per page, rules for breaking dense screens into pages, modals, drawers, tabs and steppers that navigate to each other, page vs modal vs drawer table, forms, tables, feedback, all states, responsive, accessibility.
- Team Brief gets LAYOUT, UX DECISIONS, COMPONENT MANIFEST, COMPOSABLES, SHARED FILES CHANGED, STATES COVERED; UX Reviewer got a checklist.
- `AGENTS.md` and the Cursor rule updated. Run `./sync-ai-files.sh` (or the `.ps1`) to regenerate the other tools' copies.

## 1.0.14
- `ai:gate` reliability: per-step stall and hard timeouts (Pest 1800 s, Playwright 300 s no-output / 1800 s total, build 300 s, PHPStan 180 s, TypeScript 180 s) instead of one global 120 s; Pest no longer runs with `--compact`.
- Heartbeat every 30 s (`[Pest heartbeat] process alive, elapsed 180s`). "No output" no longer means "blocked" by itself: a command is stopped only when it is silent past its limit and its process is still alive. `wrap.mjs` (`ai:run`, `ai:test`, `e2e`) got the same heartbeat and liveness check; `setup.mjs` wires `ai:test` and `e2e` with long-suite limits and upgrades an old wrapped `e2e` once.
- Diagnostics before a kill: `docs/ai/state/gate/<step>.diag.txt` (command, elapsed, PID, child processes, last output, database, memory, ports, Laravel log tail).
- Separate statuses and exit codes: FAILED (1), BLOCKED (3), STALLED (124), TIMED_OUT (125), CANCELLED (130). A cancelled or interrupted gate is never a pass and `log.mjs finish` refuses it.
- The summary line always lists the whole plan (`pest STALLED | types not run | build not run`).
- Cache fingerprint is now file content, not mtime, and includes `phpunit.xml`, `.env.testing`, `.env.e2e`, lock files, the gate scripts and the command; `--status` and `gate.json` keep the last green gate with its code fingerprint.
- Board: a stall, timeout, block or cancel marks the agent `blocked` with the command id and log paths (`--task T4` also marks the task); live state in `docs/ai/state/gate-live.json`.
- Not in this release (these files are not in the changes-only package): the stronger `e2e:doctor`, dynamic ports and server readiness checks, E2E lock, guaranteed server cleanup, failure artifacts and `e2e:quick`/`e2e:full` live in the Playwright template (`docs/ai/templates/playwright/`).

## 1.0.13
- `npm run ai:gate`: lint, static analysis, Pest, type check, build (and e2e + audits with `--full`) in one run. One line per step, only failing lines on failure, unchanged code is cached, stalls are stopped, MySQL preflight is "blocked" not "failed". `log.mjs finish` requires a green gate on Laravel projects.
- `npm run ai:context`: a ~3k-token project map (stack, tables, models, routes, policies, controllers, pages, tests) built by a script; `--find` and `--section` print only what is asked.
- Fix: `wrap.mjs` broke commands whose arguments contain `( ) ; $ *`; arguments are now quoted for the shell.
- The package now tests itself: `tests/*.test.mjs`, `tests/board-ui.mjs`, and GitHub Actions (package check, Node 18/20/22, board layout, installer on Laravel 11/12/13).

## 1.0.12
- Board: one-screen grid with no scrolling, dark mode, clickable node map, "Is it logging?" panel with an Agent-not-logging alert and a copyable reminder, file watcher, wrapped `npm run e2e` and `npm run ai:test`, `--codex-rules`, `LOG COVERAGE`, `AI_BOARD_AGENT`.

## 1.0.11
- Live board (`docs/ai/board/`): `log.mjs`, `wrap.mjs`, `board.mjs`, Codex session reader, optional Claude hooks.

## 1.0.10
- Playwright auto-setup (`setup.mjs`): packages, isolated `<app>_e2e` database, Chrome/Edge fallback when the Chromium download is blocked, scripts, smoke test.
