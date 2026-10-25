# Changelog

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
