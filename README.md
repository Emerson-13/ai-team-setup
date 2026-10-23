# AI Team Setup for Laravel

[![Latest Version](https://img.shields.io/packagist/v/emerson/ai-team-setup.svg?style=flat-square)](https://packagist.org/packages/emerson/ai-team-setup)
[![License](https://img.shields.io/packagist/l/emerson/ai-team-setup.svg?style=flat-square)](LICENSE)

A Laravel package that sets up a complete AI-powered development environment with role-based strategy council, tool configuration, and best practices for working with Claude, GitHub Copilot, Cursor, and other AI assistants.

## Features

✨ **AI Tool Configuration**
- Claude Code (sub-agents for strategy roles)
- GitHub Copilot (VS Code)
- Cursor IDE
- Codeium Windsurf
- Cline
- Google Gemini CLI

🔐 **Access control playbook** (admin side + client side, Spatie roles/permissions, super admin, per-company roles)
🎯 **Strategy Council** (5 complementary roles)
- Product Strategist
- Marketing Strategist
- Systems Thinker
- Market/Customer Researcher
- Challenger

📚 **Comprehensive Documentation**
- Complete team playbook
- Database setup and conventions
- Code review gates and architecture tests
- E2E testing with Playwright
- Package intake checklist

🚀 **Easy Installation**
```bash
composer require emerson/ai-team-setup
php artisan ai-team:install
```

## Quick Start

### Installation

```bash
# Install the package
composer require emerson/ai-team-setup

# Publish AI configuration files
php artisan ai-team:install
```

### Configuration

1. **MySQL Setup:** Update `phpunit.xml` to use MySQL instead of SQLite
2. **Optional Playwright:** Run E2E tests with browser automation
3. **Optional Packages:** Install additional tools from `docs/ai/PACKAGES.md`

See [INSTALLATION.md](INSTALLATION.md) for detailed setup instructions.

## How It Works

### Short Rules (All Tools Read)
**`AGENTS.md`** contains essential rules that every AI tool follows:
- Code architecture and testing standards
- Naming conventions
- Contract-first design
- Database rules

### Full Playbook
**`docs/ai/TEAM.md`** is the complete guide for your team:
- How to write effective prompts for AI
- Team decision-making framework
- Code review and architecture gates
- How the Strategy Council works

### Tool-Specific Configuration
Each AI tool gets its own configuration file:
- Claude Code: `.claude/skills/` and `.claude/agents/`
- GitHub Copilot: `.github/copilot-instructions.md`
- Cursor: `.cursor/rules/laravel-team.mdc`
- Windsurf: `.windsurfrules`
- Cline: `.clinerules`
- Gemini: `GEMINI.md`

## File Structure

```
laravel-project/
├── AGENTS.md                          # Core rules (all tools read)
├── CLAUDE.md                          # Claude Code config
├── .claude/
│   ├── skills/laravel-team/           # Claude Code skill
│   └── agents/                        # Strategy Council sub-agents
├── .github/copilot-instructions.md    # GitHub Copilot config
├── .cursor/rules/                     # Cursor IDE rules
├── .windsurfrules                     # Windsurf rules
├── .clinerules                        # Cline rules
├── docs/ai/                           # Full documentation
│   ├── TEAM.md                        # Complete playbook
│   ├── STRATEGY.md                    # Strategy Council framework
│   ├── ACCESS.md                      # Roles, permissions, admin/client sides
│   ├── PACKAGES.md                    # Package setup
│   ├── PLAYWRIGHT.md                  # E2E testing
│   └── templates/                     # Test templates
├── sync-ai-files.sh                   # Sync configs (Unix)
└── sync-ai-files.ps1                  # Sync configs (Windows)
```

## Keeping Files in Sync

After editing `AGENTS.md` or `docs/ai/TEAM.md`, run:

**macOS / Linux / WSL:**
```bash
./sync-ai-files.sh
```

**Windows:**
```powershell
powershell -ExecutionPolicy Bypass -File .\sync-ai-files.ps1
```

This regenerates all tool-specific configs automatically.

## Which Tool Reads What?

| Tool | Configuration File |
|------|--------------------|
| Claude Code | `CLAUDE.md` + `.claude/` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/laravel-team.mdc` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| Gemini CLI | `GEMINI.md` |
| ChatGPT / Web | Paste `AGENTS.md` content |

## Tech Stack

- **Framework:** Laravel 10+ / 11+
- **Frontend:** Vue 3 + Inertia.js + TypeScript
- **Styling:** Tailwind CSS
- **Database:** MySQL (required)
- **Real-time:** Reverb + Echo (optional)
- **Testing:** Pest + Playwright (optional)
- **WebSockets:** Supported via Laravel Reverb

## Commands

### Install AI Team Setup
```bash
php artisan ai-team:install              # Install everything
php artisan ai-team:install --config     # Config files only
php artisan ai-team:install --docs       # Documentation only
php artisan ai-team:install --scripts    # Sync scripts only
```

## Documentation

- **[INSTALLATION.md](INSTALLATION.md)** - Complete setup guide
- **docs/ai/TEAM.md** - Full team playbook (published after installation)
- **docs/ai/STRATEGY.md** - Strategy Council framework
- **docs/ai/ACCESS.md** - Roles, permissions, admin side, client side, super admin
- **docs/ai/PACKAGES.md** - Package setup and integration guides
- **docs/ai/PLAYWRIGHT.md** - E2E testing with Playwright

## Requirements

- PHP 8.1+
- Laravel 10.0+ or 11.0+
- MySQL 8.0+ (required, not SQLite)
- Composer

## Installation Approaches

### Approach 1: Fresh Laravel Project
```bash
laravel new my-project
cd my-project
composer require emerson/ai-team-setup
php artisan ai-team:install
```

### Approach 2: Existing Project
```bash
cd existing-laravel-project
composer require emerson/ai-team-setup
php artisan ai-team:install
# Update phpunit.xml to use MySQL
```

### Approach 3: Manual Copy
If you prefer not to use composer:
```bash
# Download the original files
git clone <repo-url> ai-setup
cp -r ai-setup/* your-project/
cp -r ai-setup/.* your-project/
```

## Troubleshooting

### Issue: Files not published
```bash
php artisan vendor:publish --provider="Emerson\\AITeamSetup\\AITeamSetupServiceProvider" --force
```

### Issue: Permission denied on sync script
```bash
chmod +x sync-ai-files.sh
```

### Issue: AI tool not reading config
Reload your editor:
- **VS Code:** `Cmd+Shift+P` → "Reload Window"
- **Cursor:** Restart
- **Windsurf:** Restart

## Philosophy

The setup is based on three principles:

1. **Instructions, not enforcement** - These files guide AI tools, they don't override human judgment
2. **Strategy alongside engineering** - A dedicated Council helps with product, market, and systems decisions
3. **Portable and tool-agnostic** - Works with any AI assistant, not locked to one vendor

## Contributing

Issues and improvements welcome! When contributing, update both:
- `AGENTS.md` (short rules)
- `docs/ai/TEAM.md` (full playbook)

Then run the sync scripts to propagate changes to all tool configs.

## License

MIT License - see [LICENSE](LICENSE) file

## Support

📖 **Start here:** [INSTALLATION.md](INSTALLATION.md)

📚 **Full guide:** `docs/ai/TEAM.md` (after installation)

❓ **Questions?** Check `docs/ai/` folder

---

**Made with ❤️ for Laravel teams working with AI assistants**

Emerson Gonzales | [@emerson](https://github.com/emerson)
