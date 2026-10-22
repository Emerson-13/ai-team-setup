# AI Team Setup - Laravel Package Installation

Convert your Laravel project into an AI-enabled team workspace with Claude, GitHub Copilot, Cursor, and other tools working with a built-in **Strategy Council** (product, marketing, systems thinking, research, and challenge roles).

## Quick Start

### 1. Install via Composer

```bash
composer require emerson/ai-team-setup
```

### 2. Publish AI Team Files

Run one of these commands to install AI configuration:

```bash
# Install everything (recommended)
php artisan ai-team:install

# Or install only what you need
php artisan ai-team:install --config      # AI tool config files only
php artisan ai-team:install --docs        # Documentation only
php artisan ai-team:install --scripts     # Sync scripts only
```

### 3. Configure MySQL (Required)

The AI Team Setup expects **MySQL**, not SQLite.

**In `phpunit.xml`:**
```xml
<!-- Replace the SQLite lines: -->
<env name="DB_CONNECTION" value="mysql"/>
<env name="DB_DATABASE" value="app_testing"/>
```

**Create databases:**
```bash
mysql -u root -p -e "CREATE DATABASE app;"
mysql -u root -p -e "CREATE DATABASE app_testing;"
mysql -u root -p -e "CREATE DATABASE app_e2e;"
```

**See:** `docs/ai/TEAM.md` Section 13.1 for full details.

### 4. Optional: Set Up Playwright (E2E Testing)

For end-to-end tests with browser automation:

```bash
# Follow the steps in:
docs/ai/PLAYWRIGHT.md (Section 2)
```

This will set up authenticated E2E testing, tenant isolation, and real-time specs.

### 5. Optional: Install Additional Packages

On demand, add tools your team uses:

```bash
# See all available packages:
cat docs/ai/PACKAGES.md

# Example: Install Laravel Reverb for real-time
php artisan install:broadcasting
```

## What Gets Installed

### Configuration Files
- **`AGENTS.md`** - Short rules all AI tools read (55 lines, essentials inline)
- **`CLAUDE.md`** - Claude Code configuration (points to AGENTS.md)
- **`.claude/`** - Claude Code skills and sub-agents
- **`.github/copilot-instructions.md`** - GitHub Copilot (VS Code)
- **`.cursor/rules/`** - Cursor IDE rules
- **`.windsurfrules`** - Codeium Windsurf
- **`.clinerules`** - Cline (Claude extension for VS Code)
- **`GEMINI.md`** - Google Gemini CLI

### Documentation
- **`docs/ai/TEAM.md`** - Full team playbook (roles, contracts, reviews, MySQL rules)
- **`docs/ai/STRATEGY.md`** - Strategy Council roles and decision framework
- **`docs/ai/PACKAGES.md`** - Package intake checklist and setup guides
- **`docs/ai/PLAYWRIGHT.md`** - E2E testing with Playwright

### Sync Scripts
- **`sync-ai-files.sh`** - Keep tool configs in sync (macOS/Linux/WSL)
- **`sync-ai-files.ps1`** - Keep tool configs in sync (Windows/Laragon)

## Keeping Files in Sync

After editing `AGENTS.md` or `docs/ai/TEAM.md`, regenerate all tool-specific copies:

**macOS / Linux / WSL / Git Bash:**
```bash
./sync-ai-files.sh
```

**Windows / Laragon:**
```powershell
powershell -ExecutionPolicy Bypass -File .\sync-ai-files.ps1
```

This auto-updates:
- `.claude/` (Claude Code)
- `.cursor/` (Cursor)
- `.github/copilot-instructions.md` (GitHub Copilot)
- `.windsurfrules` (Windsurf)
- `.clinerules` (Cline)
- `GEMINI.md` (Gemini CLI)

## Which Tool Reads What?

| Tool | File |
|------|------|
| **Claude Code** | `CLAUDE.md` + `.claude/skills/` + `.claude/agents/` |
| **GitHub Copilot** (VS Code) | `.github/copilot-instructions.md` |
| **Cursor** | `.cursor/rules/laravel-team.mdc` |
| **Windsurf** | `.windsurfrules` |
| **Cline** | `.clinerules` |
| **Gemini CLI** | `GEMINI.md` |
| **ChatGPT, Aider, web chat** | Paste `AGENTS.md` or attach `docs/ai/TEAM.md` |

## Understanding the Setup

### Short Rules (Every Tool Reads)
**`AGENTS.md`** contains the essential rules (~55 lines):
- Code architecture, testing, and naming standards
- Team roles and decision framework
- Contract-first design approach
- Database and configuration rules

Even if an AI tool doesn't read the longer docs, it follows these rules because they're inline.

### Full Playbook (For Your Team)
**`docs/ai/TEAM.md`** is the complete team guide:
- How to write Team Briefs and AC specs
- Database setup and conventions
- Code review gates and architecture tests
- Strategy Council roles and how decisions get made

### Strategy Council
Five complementary roles that run in parallel with engineering:

- **Product Strategist** - Validates user problems and product-market fit
- **Marketing Strategist** - Finds GTM angles and competitive positioning
- **Systems Thinker** - Identifies architectural risks and scaling issues
- **Market/Customer Researcher** - Discovers evidence vs. assumptions
- **Challenger** - Stress-tests decisions and surfaces blind spots

See `docs/ai/STRATEGY.md` for how they work together.

## Project Structure

```
laravel-project/
├── AGENTS.md                          # Short rules (all tools read)
├── CLAUDE.md                          # Claude Code config
├── .claude/
│   ├── skills/laravel-team/SKILL.md   # Claude skill
│   └── agents/                        # Sub-agents for Strategy Council roles
├── .github/
│   └── copilot-instructions.md        # GitHub Copilot rules
├── .cursor/
│   └── rules/laravel-team.mdc         # Cursor IDE rules
├── .windsurfrules                     # Windsurf rules
├── .clinerules                        # Cline rules
├── docs/ai/
│   ├── TEAM.md                        # Full team playbook
│   ├── STRATEGY.md                    # Strategy Council framework
│   ├── PACKAGES.md                    # Package setup guides
│   ├── PLAYWRIGHT.md                  # E2E testing setup
│   └── templates/playwright/          # E2E test templates
├── sync-ai-files.sh                   # Sync script (Unix)
└── sync-ai-files.ps1                  # Sync script (Windows)
```

## Troubleshooting

### Files Not Published?
If files don't appear after running the command, manually force publish:

```bash
php artisan vendor:publish --provider="Emerson\\AITeamSetup\\AITeamSetupServiceProvider" --force
```

### Make Scripts Executable (macOS/Linux)
```bash
chmod +x sync-ai-files.sh
```

### Cursor/Copilot Not Reading Rules?
Make sure the IDE is reloaded:
- **VS Code:** `Cmd+Shift+P` → "Reload Window"
- **Cursor:** Restart the editor
- **Windsurf:** Restart the editor

## Support

For issues or contributions:
- Create an issue in your Laravel project
- Reference `docs/ai/TEAM.md` for the team playbook
- Read `AGENTS.md` for the core rules

## License

MIT

---

**Next:** Read `docs/ai/TEAM.md` to understand how your team works with AI tools.
