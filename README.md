# AI Team Setup for Laravel

Gives your AI coding tools (Claude Code, Codex, Cursor, Copilot, Gemini, Windsurf, Cline) one shared set of rules for Laravel projects: an engineering team, a strategy council, roles and permissions, and Playwright E2E testing.

**Requires:** PHP 8.1+, Laravel 10-13, MySQL 8 (not SQLite), Composer.

## Install

```bash
composer require emerson-ph/ai-team-setup
php artisan ai-team:install
```

Then, once per project:

1. **MySQL:** in `phpunit.xml` set `DB_CONNECTION=mysql` and `DB_DATABASE=app_testing`.
2. **Read:** `docs/ai/TEAM.md` (the full playbook).
3. **Optional:** Playwright (`docs/ai/PLAYWRIGHT.md`), packages (`docs/ai/PACKAGES.md`).

The installer lists every file it copies and stops with an error if any is missing.

## Update

```bash
composer update emerson-ph/ai-team-setup
php artisan ai-team:install
```

The installer **overwrites** existing files. Commit your project first (`git diff` shows what changed), or update only part of it:

| Command | Updates |
|---|---|
| `php artisan ai-team:install --docs` | `docs/ai/` |
| `php artisan ai-team:install --config` | `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.cursor/`, and the generated tool files |
| `php artisan ai-team:install --scripts` | `sync-ai-files.sh` / `.ps1` |
| `php artisan ai-team:install --no-force` | Skips files that already exist |

## What you get

| File | Purpose |
|---|---|
| `AGENTS.md` | Short rules every AI tool loads |
| `docs/ai/TEAM.md` | Full team playbook |
| `docs/ai/STRATEGY.md` | Strategy Council (product, marketing, systems, research, challenger) |
| `docs/ai/ACCESS.md` | Roles and permissions: admin side, client side, super admin |
| `docs/ai/PACKAGES.md` | Package checklist, Reverb/WebSockets setup |
| `docs/ai/PLAYWRIGHT.md` | E2E testing guide and templates |
| `.claude/agents/` | Claude Code sub-agents |

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
- **Database:** MySQL only. **Tests:** Pest + Playwright. **Realtime:** Reverb + Echo.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Missing" files listed during install | `composer reinstall emerson-ph/ai-team-setup`, then install again |
| `sync-ai-files.sh` permission denied | `chmod +x sync-ai-files.sh` |
| Tool ignores the rules | Restart the editor or reload the window |
| `rm -rf` fails in PowerShell | Use `Remove-Item -Recurse -Force <path>` |

## License

MIT
