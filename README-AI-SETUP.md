# AI Team Setup (works with any AI tool)

Laravel + Vue (Inertia) + TypeScript + Tailwind, **MySQL**, Reverb/WebSockets, Pest, **Playwright**, with a **Strategy Council** (product, marketing, systems thinking) next to the engineering team.

## Install

Copy **everything in this folder** into the root of your Laravel project (keep the hidden files and folders). Commit it to git.

Then, once per project:

1. **MySQL, not SQLite.** Create `app`, `app_testing`, `app_e2e`. In `phpunit.xml` replace the SQLite lines with `DB_CONNECTION=mysql` and `DB_DATABASE=app_testing` (details: `docs/ai/TEAM.md` Section 13.1).
2. **Playwright (only when you want E2E):** follow `docs/ai/PLAYWRIGHT.md` Section 2 (copies from `docs/ai/templates/playwright/`).
3. **Packages:** install on demand using `docs/ai/PACKAGES.md` (Reverb steps are in Section 3).

## Which file does which tool read?

| Tool | File it reads |
|---|---|
| Codex / many agents (the `AGENTS.md` standard) | `AGENTS.md` |
| Claude Code | `CLAUDE.md` (points to `AGENTS.md`), skill in `.claude/skills/laravel-team/`, **sub-agents in `.claude/agents/`** |
| GitHub Copilot (VS Code) | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/laravel-team.mdc` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| Gemini CLI / Gemini Code Assist | `GEMINI.md` |
| Anything else (ChatGPT, Aider, web chat) | Paste `AGENTS.md` as the first message, or attach `docs/ai/TEAM.md` |

Exact file names and supported features can change between tool versions, so double-check the tool's docs if one does not pick it up.

## How it is organized

- `AGENTS.md`: the short rules every agent loads (about 55 lines). The essentials are inline, so they still apply even if the agent never opens the long files.
- `docs/ai/TEAM.md`: the full team playbook (roles, Team Brief, contract-first, MySQL rules, reviews, gates).
- `docs/ai/STRATEGY.md`: the Strategy Council. Product Strategist, Marketing Strategist, Systems Thinker, Market/Customer Researcher, Challenger. Produces a Strategy Brief and turns adopted ideas into testable BR/AC.
- `docs/ai/PACKAGES.md`: package intake checklist, setup for the Laravel first-party suite and a vetted community set, full **Reverb + Echo** setup, Windows/Laragon limits.
- `docs/ai/PLAYWRIGHT.md` + `docs/ai/templates/playwright/`: E2E guide, config, auth setup, tenant-isolation, realtime, SEO/a11y specs, `.env.e2e.example`, seeder stub, GitHub Actions workflow.
- `.claude/agents/`: Claude Code sub-agents (product-strategist, marketing-strategist, systems-thinker, market-researcher, challenger, qa-playwright, platform-realtime-engineer). Other tools run the same roles as written passes from `TEAM.md`.

## Keeping it in sync

Edit `AGENTS.md` and `docs/ai/TEAM.md` only, then regenerate the tool copies (including the Cursor `.mdc` and the Claude skill) with one command:

```bash
./sync-ai-files.sh                                              # macOS / Linux / Git Bash / WSL
powershell -ExecutionPolicy Bypass -File .\sync-ai-files.ps1    # Windows / Laragon
```

(`CLAUDE.md` and `.claude/agents/*` are hand-maintained and are not overwritten.)

## Reality check

- These files are **instructions, not enforcement**. No tool can guarantee 100% compliance. Pest architecture tests (`docs/ai/PACKAGES.md` Section 10) and CI checks are what actually enforce the rules.
- Tools with **sub-agents** can run the roles in parallel. Tools without them run the same roles as sequential written passes.
- Strategy output is advice. It labels Evidence vs Hypothesis and never replaces talking to real customers.
- If an agent ignores the rules, start the task with: `Follow AGENTS.md and docs/ai/TEAM.md. State mode, size, and execution mode first.`
