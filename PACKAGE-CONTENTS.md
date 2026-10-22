# Package Contents & Quick Reference

## 📦 What's Included

This composer package makes the original AI Team Setup installable in any Laravel project.

### Core Files

```
✅ composer.json              - Package metadata (name, deps, autoload)
✅ src/
   ├── AITeamSetupServiceProvider.php   - Service provider (registers commands & publishes)
   └── Commands/InstallAITeam.php       - Artisan command for installation
✅ README.md                  - Package overview
✅ INSTALLATION.md            - User installation guide
✅ PACKAGE-SETUP.md           - How to build & publish this package
✅ PACKAGE-CONTENTS.md        - This file
✅ .gitignore                 - Standard package ignore rules
```

### What Gets Published (in `publish/` directory)

When installed, these files are copied to the Laravel project:

**Configuration & Rules:**
- `AGENTS.md` - Core team rules (all AI tools read)
- `CLAUDE.md` - Claude Code configuration
- `GEMINI.md` - Google Gemini configuration
- `README-AI-SETUP.md` - Original setup instructions
- `.claude/` - Claude Code skills & sub-agents
- `.github/copilot-instructions.md` - GitHub Copilot config
- `.cursor/rules/` - Cursor IDE rules
- `.windsurfrules` - Windsurf editor rules
- `.clinerules` - Cline extension rules

**Documentation:**
- `docs/ai/TEAM.md` - Full team playbook
- `docs/ai/STRATEGY.md` - Strategy Council framework
- `docs/ai/PACKAGES.md` - Package setup guides
- `docs/ai/PLAYWRIGHT.md` - E2E testing guide
- `docs/ai/templates/playwright/` - Test templates

**Sync Scripts:**
- `sync-ai-files.sh` - Unix sync script
- `sync-ai-files.ps1` - Windows sync script

## 🚀 How to Use

### For Users (Installing in Laravel Project)

```bash
# 1. Add to project
composer require emerson/ai-team-setup

# 2. Install & publish files
php artisan ai-team:install

# 3. Configure MySQL (required)
# Edit phpunit.xml: DB_CONNECTION=mysql, DB_DATABASE=app_testing

# 4. Read documentation
cat docs/ai/TEAM.md
```

### For Package Maintainers (You)

```bash
# 1. Create package repo
mkdir ai-team-setup && cd ai-team-setup
git init

# 2. Copy package files
# - composer.json, src/, README.md, INSTALLATION.md, etc.

# 3. Copy original AI files to publish/ directory
# - AGENTS.md, .claude/, .github/, docs/ai/, etc.

# 4. Test locally
laravel new test-project
cd test-project
# Add path repository in composer.json
composer require --path ../ai-team-setup emerson/ai-team-setup:@dev
php artisan ai-team:install

# 5. Publish to Packagist
# - Push to GitHub
# - Tag release: git tag v1.0.0
# - Submit to packagist.org

# 6. Update on changes
git commit -am "Update docs"
git tag v1.0.1
git push origin main --tags
```

## 📋 Installation Command Options

```bash
# Install everything (default)
php artisan ai-team:install

# Config files only
php artisan ai-team:install --config

# Documentation only
php artisan ai-team:install --docs

# Sync scripts only
php artisan ai-team:install --scripts

# Specific tag
php artisan vendor:publish --tag=ai-team-config
php artisan vendor:publish --tag=ai-team-docs
php artisan vendor:publish --tag=ai-team-scripts
```

## 🔧 Directory Structure for Package Repo

```
ai-team-setup/
├── composer.json                 ← Package definition
├── src/
│   ├── AITeamSetupServiceProvider.php
│   └── Commands/
│       └── InstallAITeam.php
├── publish/                      ← These files get copied to Laravel project
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   ├── .claude/
│   ├── .github/
│   ├── docs/ai/
│   ├── sync-ai-files.sh
│   └── ...
├── README.md
├── INSTALLATION.md
├── PACKAGE-SETUP.md
├── PACKAGE-CONTENTS.md
└── .gitignore
```

## 🎯 Key Differences: Package vs Original

| Aspect | Original | Package |
|--------|----------|---------|
| Distribution | Git clone / manual copy | Composer `require` |
| Installation | Copy files to root | `php artisan ai-team:install` |
| Updates | Git pull | `composer update` |
| Location | Standalone repo | Included in any Laravel project |
| Auto-publish | No | Yes, with service provider |

## 📖 File Purposes

### composer.json
- Package metadata
- Dependencies (Laravel 10+/11+)
- Autoload PSR-4 configuration
- Auto-discovery for service provider

### AITeamSetupServiceProvider.php
- Registers publish groups (config, docs, scripts)
- Registers `ai-team:install` command
- Handles file publishing when artisan runs

### InstallAITeam.php
- Artisan command class
- Publishes files in correct order
- Shows helpful next steps
- Makes scripts executable (Unix)

## 🔄 Keeping Files Synced

The original `sync-ai-files.sh` and `.ps1` scripts ensure all tool configs stay in sync:

```bash
# After editing AGENTS.md or docs/ai/TEAM.md
./sync-ai-files.sh              # Unix
powershell -ExecutionPolicy Bypass -File .\sync-ai-files.ps1  # Windows

# Regenerates:
# - .claude/skills/laravel-team/SKILL.md
# - .cursor/rules/laravel-team.mdc
# - .github/copilot-instructions.md
# - .windsurfrules, .clinerules, GEMINI.md
```

## 💡 Tips

### For Laravel Developers Using This Package

1. Read `docs/ai/TEAM.md` first - it's the playbook
2. Configure MySQL properly (not SQLite)
3. Use `./sync-ai-files.sh` after editing `AGENTS.md`
4. Install optional packages as needed from `docs/ai/PACKAGES.md`

### For Package Maintainers

1. Keep `composer.json` updated with Laravel versions
2. Test on fresh Laravel projects before releasing
3. Use semantic versioning (v1.0.0, v1.1.0, etc.)
4. Tag releases in git for auto-detection by Packagist
5. Keep publish directory in sync with original files

## 🐛 Troubleshooting

**Files not published?**
```bash
php artisan vendor:publish --provider="Emerson\\AITeamSetup\\AITeamSetupServiceProvider" --force
```

**Command not found?**
```bash
php artisan list | grep ai-team
# Should show: ai-team:install
```

**Scripts not executable?**
```bash
chmod +x sync-ai-files.sh
```

**Which files did composer publish?**
```bash
php artisan vendor:publish --list | grep ai-team
```

## 📚 Documentation Links

- **INSTALLATION.md** - How to install & configure
- **PACKAGE-SETUP.md** - How to build & release the package
- **publish/docs/ai/TEAM.md** - Full team playbook (installed later)
- **publish/docs/ai/STRATEGY.md** - Strategy Council framework
- **publish/AGENTS.md** - Core team rules

## 🚢 Publishing Checklist

- [ ] Update files in `publish/` directory
- [ ] Update version in `composer.json`
- [ ] Test with fresh Laravel project locally
- [ ] Commit changes: `git commit -am "message"`
- [ ] Tag release: `git tag v1.X.X`
- [ ] Push to GitHub: `git push origin main --tags`
- [ ] Packagist detects automatically (or manually force update)
- [ ] Verify on packagist.org/packages/emerson/ai-team-setup

---

**Quick start:** Read INSTALLATION.md for users, PACKAGE-SETUP.md for builders.
