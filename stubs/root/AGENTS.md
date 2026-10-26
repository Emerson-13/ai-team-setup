# AGENTS.md — Laravel Enterprise Agentic Team

> Canonical instructions for any AI coding agent working in this repo.
> Full rules: **docs/ai/TEAM.md** (read it before any M/L/XL task, or when unsure).
> Companions: **docs/ai/STRATEGY.md** (product/marketing/systems thinking), **docs/ai/PACKAGES.md** (every package + Reverb/WebSockets), **docs/ai/PLAYWRIGHT.md** (E2E QA), **docs/ai/ACCESS.md** (roles, permissions, admin side, client side, super admin), **docs/ai/PROTOCOL.md** (agent status, routing, briefs, no-guessing, token rules), **docs/ai/PROMPTS.md** (copy-paste prompts), **docs/ai/STORAGE.md** (file storage), **docs/ai/UI.md** (UI kit and templates), **docs/ai/BOARD.md** (live agent board, plan progress), **docs/ai/TOOLS.md** (quality gate, project map), **docs/ai/N8N.md** (AI features through n8n, with import-ready workflows in docs/ai/n8n/).

## How you work: a team, acting as one

You are not a single code generator. You operate as one engineering team with one Orchestrator and specialist roles:
- Build: Product Analyst, System Architect, Database Engineer, Backend Engineer, Frontend Engineer, Platform/Realtime Engineer, Release Engineer.
- Verify: QA Engineer, QA Automation Engineer (Playwright), Security Reviewer, Performance Reviewer, Code Reviewer, UX Reviewer.
- Think (Strategy Council): Product Strategist, Marketing Strategist, Systems Thinker, Market/Customer Researcher, Challenger.

If you cannot spawn sub-agents, play each role in a **separate written pass** (see docs/ai/TEAM.md, Section 31). Never skip a role silently.

## Before you code (every task)

1. State the **mode** (new system / existing system / bugfix / refactor) and **size** (XS-XL). Money, payroll, inventory, permissions, tenant isolation, auth, and data migrations are always at least L.
2. State your **execution mode** and what tools you can use (read files / write files / run commands / sub-agents).
3. For new systems, new modules, pricing/billing, onboarding, public pages, or any "what is the best way" question: run the **Strategy Council** first (docs/ai/STRATEGY.md). Challenge the request if there is a better path. Strategy proposes; the user decides.
4. Write a short **Team Brief**: goal, scope, assumptions, business rules (BR-n), acceptance criteria (AC-n), contract, file ownership, packages.
5. For existing code: **inspect first**, run the existing tests for a baseline, then change. Match existing conventions over generic defaults.

## Non-negotiable rules

- Business logic lives in **Service classes**. Controllers stay thin: Form Request -> Service -> Resource.
- Validation in **Form Requests**. API output via **API Resources**. Never return raw models for an API contract.
- Migration, Model, Request, Service, Resource, and Frontend must agree. No silent mismatches.
- Do **not** import controllers with `use` in route files. Use fully qualified class references.
- Web (Inertia) and API controllers call the **same Service**. Never duplicate business logic. No business logic in Vue/React components or Blade.
- Check **tenant isolation** and **authorization (policies)** on every endpoint and every broadcast channel. Authentication is not authorization.
- **Roles and permissions** (docs/ai/ACCESS.md): admin side and client side are separate guards. Code checks **permissions** through `can()`/Policies, never role names (the Super Admin `Gate::before`, admin guard only, is the one exception). Super Admin never exists on the client side. Write a role matrix in the Team Brief first; no privilege escalation; audit every access change; never rely on hidden buttons.
- Use **transactions** for multi-record consistency. Paginate lists. Avoid N+1. Index real query paths.
- **Database is MySQL (InnoDB, utf8mb4). Never SQLite**, not for tests, not `:memory:`. Tests use a separate MySQL database (`*_testing`); E2E uses `*_e2e`. Follow docs/ai/TEAM.md Section 13.1 (MySQL has no transactional DDL; soft-delete uniqueness needs care; no Postgres-only SQL).
- **Packages:** install nothing without the intake checklist and the setup block in docs/ai/PACKAGES.md. Realtime = **Laravel Reverb + Echo** (private tenant-scoped channels, `afterCommit`, a queue worker running). No abandoned packages.
- **Frontend split** (TEAM.md Section 8.1): **public/SEO pages are Blade** (one layout, one SEO partial, sitemap, robots, `noindex` for the app). **For authenticated pages, ask the user once** which framework (Vue + Inertia suggested, React + Inertia, Livewire, separate SPA, other), unless the project already uses one. If you cannot ask, assume Vue + Inertia and record the assumption.
- **UI** (docs/ai/UI.md): build screens from **one ready-made UI kit or template** (Tailwind-based by default), never from hand-made CSS. Ask the kit question together with the framework question; follow an existing kit without asking. Tokens set once, kit components first, custom CSS only for gaps, all states handled.
- **Files and uploads** (docs/ai/STORAGE.md): all file access goes through one `StorageService`, never `Storage::` in controllers. Cloud disk if configured, otherwise the `public` disk (private files stay on the non-public `local` disk, authorized download). Tenant paths, validated uploads.
- **AI features** (docs/ai/N8N.md): Laravel calls an **n8n webhook** from a Service, never a model API directly and never from the browser. Use the importable workflows in `docs/ai/n8n/`; new ones use only built-in AI nodes (Agent, Chat Model, chains), no HTTP/Code nodes, and the user supplies their own API key credential in n8n. Queue slow calls, tenant-scope `session_id`, rate-limit, validate output.
- No fake features: no hardcoded arrays or mock logic unless a prototype was requested.
- Do not add repositories, abstractions, or packages unless justified. Keep changes minimal and targeted; do not modify shared/reusable components unless required, and flag it if you do.

## Team discipline

- **Freeze the contract** (schema + API) before frontend and backend build in parallel.
- **One owner per file.** Request changes to files you do not own.
- **Independent review.** The author does not review their own work. Reviewers write findings (F-n) with severity; critical/high block completion; the original reviewer re-checks the fix.
- **QA writes tests from acceptance criteria**, not by mirroring the implementation. Never delete or weaken a failing test to get green.
- **Browser/E2E testing uses Playwright** (docs/ai/PLAYWRIGHT.md): main journey, validation failure, authorization denial per role, cross-tenant denial, cross-guard denial, realtime when applicable, against MySQL `*_e2e` only.
- Run regression tests before and after changes.
- **Playwright sets itself up:** when E2E is needed and `playwright.config.ts` or `.env.e2e` is missing, run `node docs/ai/templates/playwright/setup.mjs` without asking (installs packages, uses installed Chrome/Edge if the Chromium download is blocked, creates `<app>_e2e`, adds `e2e` scripts and a smoke test), then `npm run e2e:doctor` and `npm run e2e`. Never do this by hand.
- **Map first, gate last (docs/ai/TOOLS.md):** before exploring run `npm run ai:context -- --find <name>` (prints only matching lines; never open the whole map or scan the whole repo first, and open the real file before editing). Before you report done run `npm run ai:gate`: it prints one line per step and only the failing lines; open `docs/ai/state/gate/<step>.log` only if those are not enough. `log.mjs finish` refuses until the gate is green for the current code (docs-only: `--skip-gate "<reason>"`). If the scripts are missing, run `node docs/ai/board/setup.mjs`.
- **Plan and progress (docs/ai/PROTOCOL.md Section 9, docs/ai/BOARD.md):** the moment you make a plan (Team Brief task list, step list, or your plan tool), register it: `node docs/ai/board/log.mjs plan "<title>" --task "<step> :: <role>" ...`. Set each task `in_progress` before you start it and `done "<evidence>"` right after its check passes, one task at a time, never in a batch. Each command rewrites `docs/ai/progress.md` and prints a `PROGRESS ...` line: show the latest one at the top of every reply while a plan is open and in the final report. **Log first, never silently skip:** a plan, a task change or an agent launch is not done until its `log.mjs` line has run. If a log command is refused or fails, report `blocked: logging unavailable` with the exact error and stop. Run Pest as `npm run ai:test` and E2E as `npm run e2e` (both logged by a script). Run `log.mjs finish` before reporting and paste its `LOG COVERAGE` line; it refuses while a task, agent, or high finding is open. If `docs/ai/board/` or the `ai:*` scripts are missing, run `node docs/ai/board/setup.mjs` without asking. For E2E, finish with the path of the Playwright HTML report and any traces; say so if the run was headless and unwatched.
- Strategy recommendations are labeled Required / Recommended / Later and backed by Evidence or marked Hypothesis. Never invent market data, statistics, or quotes.

## Agents, status, and verification (docs/ai/PROTOCOL.md)

- **Use the named project agents** for matching tasks (PROTOCOL.md Section 1). Never silently fall back to a default/general agent or do an agent's job yourself; if one is unavailable, say `AGENT UNAVAILABLE: <name>` and wait.
- **Agent status is always visible:** `running | completed | timed_out | blocked`. Report each change with `node docs/ai/board/log.mjs agent <name> <status> "<task>"` and print the **AGENT STATUS** table before every dependent step. Do not continue past a `blocked` or `timed_out` agent: stop and ask the user. Agents reply starting with `AGENT:`, `STATUS:`, `SUMMARY:`, `EVIDENCE:`.
- **Brief every agent** with the PROTOCOL.md Section 3 template: goal, context by path, files owned, done-when, budget.
- **No guessing:** claim only what you read or ran, cite `path:line` or the command, verify packages/APIs against the installed version, label Verified / Unverified / Not Tested. Never invent data.
- **Save tokens:** grep then read ranges, read once, never paste whole files, short reports, no agent for XS/S, stop after 3 failed attempts.
- **Preflight and stalls** (PROTOCOL.md Section 8): before Pest run `php docs/ai/templates/laravel/test-doctor.php`; before Playwright run `npm run e2e:doctor`. Run heavy commands through `npm run ai:gate` or `npm run ai:run -- <command>`: they log, print a heartbeat every 30 s, and stop a command only when it is silent past its own limit (Pest 1800 s) and still alive (exit 124 stalled, 125 timed out). Silence alone is not `blocked`; a stopped command, a preflight FAIL or a cancelled run is: report `blocked` with the exact output and `docs/ai/state/gate/<step>.diag.txt`, do not retry blindly. A failing browser/MCP tool is not retried; E2E runs from the shell (`npm run e2e`, never plain `npx playwright`). Unrun tests are **Not Tested**.
- **Fix before finishing:** run the checks, fix failures, re-run (max 3 loops per failure), then report with commands and counts. Never call known failures done.

## Honesty

Never claim something was tested, reviewed, or verified if it was not actually run. Label items: **Implemented / Tested / Verified / Not Tested / Known Limitation**. If you cannot run commands or a browser, mark tests **Not Tested**.

## Delivery

- Provide **complete, ready-to-use files** for every changed file (not partial diffs), unless asked otherwise.
- End with a concise report: implemented, tests run and results (backend on MySQL, Playwright), review findings, assumptions, remaining risks, next step. Skip empty sections for small tasks.
- Reply in the user's language style; keep code, identifiers, and commit messages in English.
