# AI Team Setup for Laravel

Gives your AI coding tools (Claude Code, Codex, Cursor, Copilot, Gemini, Windsurf, Cline) one shared set of rules for Laravel projects: an engineering team, a strategy council, roles and permissions, AI features through n8n, Playwright E2E testing, and a live board that shows what the agents are doing and how far the plan is.

**Requires:** PHP 8.1+, Laravel 10-13, MySQL 8 (not SQLite), Composer.

## Install

```bash
composer require emerson-ph/ai-team-setup
php artisan ai-team:install
```

Then, once per project:

1. **MySQL:** in `phpunit.xml` set `DB_CONNECTION=mysql` and `DB_DATABASE=app_testing`.
2. **Read:** `docs/ai/TEAM.md` (the full playbook).
3. **Recommended:** the live board, `node docs/ai/board/setup.mjs` then `npm run ai:board` (`docs/ai/BOARD.md`).
4. **Optional:** Playwright (`docs/ai/PLAYWRIGHT.md`), packages (`docs/ai/PACKAGES.md`), n8n AI workflows (`docs/ai/N8N.md`).

The installer lists every file it copies and stops with an error if any is missing.

## Update

```bash
composer update emerson-ph/ai-team-setup
php artisan ai-team:install
```

The installer **overwrites** existing files. Commit your project first (`git diff` shows what changed), or update only part of it:

| Command | Updates |
|---|---|
| `php artisan ai-team:install --docs` | `docs/ai/` (playbooks, templates, n8n workflows) |
| `php artisan ai-team:install --config` | `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.cursor/`, and the generated tool files |
| `php artisan ai-team:install --scripts` | `sync-ai-files.sh` / `.ps1` |
| `php artisan ai-team:install --no-force` | Skips files that already exist |

---

## The team

One **Orchestrator (Tech Lead)** is the single voice to you. It sizes the task (XS-XL), writes the Team Brief, assigns the roles below, and enforces the quality gates. Small tasks do not need every role.

### Engineering roles

| Role | Owns |
|---|---|
| Product Analyst | Requirements, business rules, acceptance criteria |
| System Architect | Module boundaries, API contract, tenancy model |
| Database Engineer | Schema, migrations, indexes, seeders, factories |
| Backend Engineer | Models, Services, Form Requests, Resources, Policies, Jobs, Events |
| Frontend Engineer | Blade public pages (SEO) and your chosen app framework (Vue/Inertia by default) |
| Platform / Realtime Engineer | Packages, queues, Reverb/Echo, cache, scheduler, mail |
| Release Engineer | Migration order, rollback plan, deploy notes |

### Verification roles

| Role | Owns |
|---|---|
| QA Engineer | Test strategy, unit/feature/API tests, regression runs |
| QA Automation Engineer (Playwright) | E2E journeys, cross-tenant UI checks, SEO and accessibility smoke |
| Security Reviewer | AuthN/AuthZ, tenant isolation, data exposure |
| Performance Reviewer | Queries, N+1, caching, queues |
| Code Reviewer | Architecture, maintainability, duplication |
| UX Reviewer | User flow, states, consistency, UI-kit conformity |

The author never reviews their own work. Critical and high findings block completion.

### Strategy Council

It decides *whether* and *how* to build, not only how to code. It proposes; you decide.

| Role | Owns |
|---|---|
| Product Strategist | Problem, MVP cut, pricing logic, activation and retention |
| Marketing Strategist | Positioning, messaging, funnel, public pages and SEO |
| Systems Thinker | Real-world workflow, handoffs, bottlenecks, cost to serve |
| Market / Customer Researcher | Evidence: competitors, customer language, assumptions to test |
| Challenger | Pre-mortem: why it could fail, kill criteria |

### Claude Code sub-agents (`.claude/agents/`)

| Agent | Use it for |
|---|---|
| `product-strategist` | Before new systems, modules, pricing, onboarding |
| `marketing-strategist` | Positioning, public pages, SEO, launch plan |
| `systems-thinker` | Workflow design, state maps, automation, unit economics |
| `market-researcher` | Competitor and customer evidence (needs web access) |
| `challenger` | Pre-mortem before L/XL work |
| `qa-playwright` | Writing, running and debugging Playwright tests |
| `platform-realtime-engineer` | Installing and configuring packages, Reverb, queues |
| `access-control-reviewer` | Reviewing roles, permissions, guards, super admin (read-only) |

The other roles run as separate written passes in any tool (see `TEAM.md` Section 31).

---

## What is inside

### Playbooks (`docs/ai/`)

| File | Covers |
|---|---|
| `TEAM.md` | The full playbook: modes, sizing, Team Brief, architecture rules, MySQL rules, security, testing, reviews |
| `STRATEGY.md` | Strategy Council protocol, Strategy Brief, marketing and SEO requirements |
| `ACCESS.md` | Roles and permissions with Spatie: admin side and client side as separate guards, super admin, per-company roles, role matrix, tests |
| `PROTOCOL.md` | Agent status (running / completed / timed out / blocked), required agents, brief template, no-guessing and token rules, verify-and-fix loop |
| `TOOLS.md` | Quality gate (`npm run ai:gate`: lint, static analysis, Pest, types, build; cached, one line per step) and project map (`npm run ai:context`); both cost no model tokens |
| `BOARD.md` | Live board: plan and task progress, agent status, commands, stalls; Codex session reader; setup and troubleshooting |
| `PROMPTS.md` | Copy-paste prompts: feature, bug, refactor, review, roles, storage, AI, resume |
| `STORAGE.md` | Files and uploads through one `StorageService`: cloud if configured, public-disk fallback |
| `UI.md` | Build screens from one ready-made UI kit or template (Tailwind-based by default), not custom CSS |
| `N8N.md` | AI features through n8n: import steps, Laravel client, rules |
| `PACKAGES.md` | Package intake checklist, Reverb + Echo setup, Spatie and other packages |
| `PLAYWRIGHT.md` | E2E guide, isolation, seed data, watching a run |

### Ready-to-use templates

| Folder | Contents |
|---|---|
| `docs/ai/n8n/` | Import-ready n8n workflows (below) |
| `docs/ai/templates/laravel/` | `StorageService.php` (copy to `app/Services/Storage/`), `test-doctor.php` (Pest/MySQL preflight) |
| `docs/ai/board/` | The board scripts (Node, no dependencies): `log.mjs` (agents report plan, tasks, status), `wrap.mjs` (logs a command and stops a stalled one), `board.mjs` (dashboard), `codex.mjs` (reads Codex session files), `watch.mjs` (sees file edits), `../tools/` (`gate.mjs`, `context.mjs`), `hook.mjs` (optional Claude Code hooks), `setup.mjs`, `doctor.mjs` |
| `docs/ai/templates/playwright/` | `setup.mjs` (one-command setup), config (auto free port, Chrome/Edge fallback), `e2e:doctor` preflight, auth setup, seeder, smoke test, specs (auth, tenant isolation, role-access matrix, realtime, SEO/a11y), GitHub Actions workflow |

### Live board (`docs/ai/board/`, guide: `docs/ai/BOARD.md`)

```bash
node docs/ai/board/setup.mjs     # once: npm scripts + .gitignore; logs npm run e2e (add --codex-rules for Codex, --claude-hooks for Claude Code)
npm run ai:board                 # dashboard at http://127.0.0.1:4177 (VS Code: Simple Browser: Show)
npm run ai:doctor                # preflight;  npm run ai:probe  shows what it can read from Codex on your machine
npm run ai:test                  # Pest, logged by the script;  npm run e2e is logged too
npm run ai:run -- <command>      # any other heavy command: logged, stopped if it stalls (exit 124)
```

The dashboard fits one screen (no scrolling), has dark and light mode, and a clickable **node map** of plan, agents and commands (drag, scroll to zoom, click a node). An **"Is it logging?"** panel and an amber banner tell you when the agent is working but not logging, with a button that copies a reminder to paste to it. Four layers, so you are not only relying on the agent to obey: **(0)** file edits are seen by a watcher; **(1)** wrapped commands (`npm run e2e`, `npm run ai:test`) are logged by a script; **(2)** the tool's own record is read (Codex session files, or Claude Code hooks), including the tool's own plan; **(3)** agents report names, status and plan tasks with `node docs/ai/board/log.mjs` (`plan`, `task`, `agent`, `finding`, `finish`). Every report rewrites `docs/ai/progress.md` and prints a `PROGRESS 3/5 tasks (60%)` line the agent shows in its reply. Limits: you see status, steps and evidence, not private reasoning; in Codex the agent names are roles Codex plays, so only layers 1 and 2 are certain.

### n8n AI workflows (`docs/ai/n8n/`)

Import in n8n, pick your own API key on the Chat Model node, set a Header Auth secret on the Webhook node, then switch Active on. Only built-in AI nodes are used. Any chat model provider can be swapped in.

| File | Webhook | Does |
|---|---|---|
| `01-ai-chat-agent.json` | `/webhook/ai-chat` | Chatbot with memory per session |
| `02-ai-text-task.json` | `/webhook/ai-text` | Summarize, rewrite, translate, draft |
| `03-ai-extract.json` | `/webhook/ai-extract` | Extract summary, intent, sentiment, language from text |

### Installed in your project

```text
AGENTS.md  CLAUDE.md  GEMINI.md  README-AI-SETUP.md
.claude/agents/  .claude/skills/laravel-team/
.cursor/rules/laravel-team.mdc
.github/copilot-instructions.md  .windsurfrules  .clinerules
docs/ai/   (playbooks, templates, n8n workflows, board scripts)
sync-ai-files.sh  sync-ai-files.ps1
```

## Which tool reads what

| Tool | File |
|---|---|
| Codex and other `AGENTS.md` tools | `AGENTS.md` |
| Claude Code | `CLAUDE.md`, `.claude/` |
| Cursor | `.cursor/rules/laravel-team.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| Gemini | `GEMINI.md` |
| ChatGPT / web chat | Paste `AGENTS.md` |

## Keep tool files in sync

`GEMINI.md`, `.windsurfrules`, `.clinerules`, `.github/copilot-instructions.md`, the Cursor rule and the Claude skill are generated copies. After editing `AGENTS.md` or `docs/ai/TEAM.md`, regenerate them:

```bash
./sync-ai-files.sh                                            # macOS / Linux / WSL
powershell -ExecutionPolicy Bypass -File .\sync-ai-files.ps1  # Windows
```

## Defaults

- **Public pages (SEO):** Blade.
- **Authenticated pages:** the agent asks which framework (Vue + Inertia, React + Inertia, Livewire, other).
- **Agents:** the agent uses your named agents, shows a status table (running / completed / timed out / blocked), and stops at blocked or timed out. It fixes failing checks before it finishes.
- **Files:** one `StorageService`; cloud storage if configured, otherwise the public disk (private files stay private).
- **UI:** one ready-made kit or template (the agent asks once; suggests shadcn-vue / shadcn/ui, Flowbite, DaisyUI, Preline, or your own template).
- **Access control:** separate admin and client guards, Spatie permissions, checks through policies.
- **AI features:** n8n webhooks called from a Laravel Service.
- **Database:** MySQL only. **Tests:** Pest + Playwright. **Realtime:** Reverb + Echo.
- **Playwright:** agents set it up themselves when E2E is needed (`setup.mjs`: packages, isolated `<app>_e2e` database, installed Chrome/Edge if the Chromium download is blocked, scripts, smoke test). You do not need to ask.
- **Progress:** the agent registers every plan with `log.mjs` and keeps task status current; `docs/ai/progress.md` and the dashboard update from it (both git-ignored by `board/setup.mjs`). Heavy commands run through `npm run ai:run --`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Missing" files listed during install | `composer reinstall emerson-ph/ai-team-setup`, then install again |
| `sync-ai-files.sh` permission denied | `chmod +x sync-ai-files.sh` |
| Playwright or Pest stalls, or the port is busy | `npm run e2e:doctor` / `php docs/ai/templates/laravel/test-doctor.php` (see `PLAYWRIGHT.md` Section 8.1) |
| Playwright is not set up, or Chromium cannot download | `node docs/ai/templates/playwright/setup.mjs` (falls back to installed Chrome/Edge; see `PLAYWRIGHT.md` Section 2.0) |
| Dashboard shows no Codex activity, or a red "no activity" banner | `npm run ai:doctor`, `npm run ai:probe` (`docs/ai/BOARD.md` Section 6) |
| Tool ignores the rules | Restart the editor or reload the window |
| `rm -rf` fails in PowerShell | Use `Remove-Item -Recurse -Force <path>` |

## License

MIT
