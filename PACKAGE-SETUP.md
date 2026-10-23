# Package Structure & Setup Guide

This guide explains the composer package structure and how to prepare it for publishing.

## Current Structure

```
emerson-ph/ai-team-setup/
├── composer.json                    # Package definition
├── README.md                        # Package description
├── INSTALLATION.md                  # Installation guide
├── PACKAGE-SETUP.md                 # This file
├── .gitignore
├── src/
│   ├── AITeamSetupServiceProvider.php
│   └── Commands/
│       └── InstallAITeam.php
└── publish/                         # Files to publish when installed
    ├── AGENTS.md
    ├── CLAUDE.md
    ├── GEMINI.md
    ├── README-AI-SETUP.md
    ├── .claude/
    │   ├── skills/laravel-team/SKILL.md
    │   └── agents/
    │       ├── product-strategist.md
    │       ├── marketing-strategist.md
    │       ├── systems-thinker.md
    │       ├── market-researcher.md
    │       ├── challenger.md
    │       ├── qa-playwright.md
    │       └── platform-realtime-engineer.md
    ├── .github/
    │   └── copilot-instructions.md
    ├── .cursor/
    │   └── rules/laravel-team.mdc
    ├── .windsurfrules
    ├── .clinerules
    ├── docs/ai/
    │   ├── TEAM.md
    │   ├── STRATEGY.md
    │   ├── PACKAGES.md
    │   ├── PLAYWRIGHT.md
    │   └── templates/playwright/
    │       ├── E2ESeeder.php
    │       ├── .env.e2e.example
    │       ├── playwright.config.ts
    │       ├── auth.setup.ts
    │       ├── base-test.spec.ts
    │       ├── fixtures/
    │       ├── helpers/
    │       └── workflows/
    ├── sync-ai-files.sh
    └── sync-ai-files.ps1
```

## How It Works

### 1. Installation Flow

When a developer runs:
```bash
composer require emerson-ph/ai-team-setup
php artisan ai-team:install
```

The flow is:
1. Composer downloads the package
2. Service provider registers the publish tags
3. `InstallAITeam` command calls `vendor:publish` for each tag
4. Files from `stubs/` directory get copied to the Laravel project root

### 2. Publishing Tags

The service provider defines three publish tags:

**ai-team-config:**
- `.claude/` → project root
- `.github/` → project root
- `.cursor/` → project root
- `.windsurfrules` → project root
- `.clinerules` → project root

**ai-team-docs:**
- `AGENTS.md` → project root
- `CLAUDE.md` → project root
- `GEMINI.md` → project root
- `README-AI-SETUP.md` → project root
- `docs/ai/` → project root

**ai-team-scripts:**
- `sync-ai-files.sh` → project root
- `sync-ai-files.ps1` → project root

## Building the Package

### Step 1: Prepare the Repository

Create a new git repository for this package (separate from any Laravel project):

```bash
mkdir ai-team-setup
cd ai-team-setup
git init
```

### Step 2: Copy Package Files

From this directory, copy:
```bash
# Copy source files
mkdir -p src/Commands
cp -r <path-to>/AITeamSetupServiceProvider.php src/
cp -r <path-to>/InstallAITeam.php src/Commands/

# Copy documentation
cp composer.json .
cp README.md .
cp INSTALLATION.md .
cp PACKAGE-SETUP.md .
cp .gitignore .
```

### Step 3: Populate `stubs/` Directory

The original AI Team Setup files go into `stubs/`:

```bash
mkdir -p publish/.claude/agents
mkdir -p publish/.github
mkdir -p publish/.cursor/rules
mkdir -p publish/docs/ai/templates/playwright

# Copy all the original files
cp <original>/AGENTS.md publish/
cp <original>/CLAUDE.md publish/
cp <original>/GEMINI.md publish/
cp <original>/README-AI-SETUP.md publish/
cp <original>/.claude/skills/* publish/.claude/
cp <original>/.claude/agents/* publish/.claude/agents/
cp <original>/.github/* publish/.github/
cp <original>/.cursor/* publish/.cursor/rules/
cp <original>/.windsurfrules publish/
cp <original>/.clinerules publish/
cp <original>/docs/ai/* publish/docs/ai/
cp <original>/docs/ai/templates/playwright/* publish/docs/ai/templates/playwright/
cp <original>/sync-ai-files.sh publish/
cp <original>/sync-ai-files.ps1 publish/
```

### Step 4: Initial Commit

```bash
git add .
git commit -m "Initial commit: AI Team Setup composer package"
```

### Step 5: Create Releases

Tag versions following semver:

```bash
git tag v1.0.0
git push origin main --tags
```

### Step 6: Publish to Packagist

1. Create account on [packagist.org](https://packagist.org)
2. Submit package:
   - Go to https://packagist.org/packages/submit
   - Enter your GitHub repository URL
   - Packagist automatically discovers releases via git tags

The package will be available at:
```
https://packagist.org/packages/emerson-ph/ai-team-setup
```

## For Local Testing

Before publishing, test the package locally:

### Option A: Path Repository (Fastest)

Create a test Laravel project:
```bash
laravel new test-project
cd test-project
```

Add to `composer.json`:
```json
{
  "repositories": [
    {
      "type": "path",
      "url": "../ai-team-setup"
    }
  ]
}
```

Then install:
```bash
composer require emerson-ph/ai-team-setup:@dev
php artisan ai-team:install
```

### Option B: VCS Repository

Add to `composer.json`:
```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/your-username/ai-team-setup.git"
    }
  ]
}
```

### Option C: Git Clone & Require

```bash
composer require --dev emerson-ph/ai-team-setup:dev-main
```

## Verifying Installation

After running `php artisan ai-team:install`, check:

```bash
# All files present
ls -la AGENTS.md CLAUDE.md docs/ai/
ls -la .claude/ .github/ .cursor/

# Scripts are executable
ls -la sync-ai-files.sh

# Artisan command registered
php artisan list | grep ai-team
```

## Making Updates

When updating the original AI Team Setup files:

1. Update files in the `stubs/` directory
2. Update the version in `composer.json`
3. Commit with meaningful message:
   ```bash
   git commit -am "Update AI team docs and add new agent roles"
   ```
4. Tag the release:
   ```bash
   git tag v1.1.0
   git push origin main --tags
   ```

Packagist will automatically detect the new version.

## Version Compatibility

The package supports:
- **PHP:** 8.1+
- **Laravel:** 10.0+, 11.0+

Update `composer.json` if support changes:
```json
{
  "require": {
    "php": "^8.1",
    "illuminate/support": "^10.0|^11.0"
  }
}
```

## Maintenance Checklist

- [ ] Keep `sync-ai-files.sh` and `.ps1` in sync
- [ ] Update agent descriptions when roles change
- [ ] Test on fresh Laravel projects quarterly
- [ ] Monitor GitHub issues and PRs
- [ ] Keep documentation up to date in `publish/docs/ai/`
- [ ] Semantic versioning (major.minor.patch)
- [ ] Git tags for each release

## Publishing to Packagist

### Automatic Updates

Once published to Packagist, it automatically:
- Detects new git tags
- Updates version numbers
- Refreshes documentation

### Manual Update

If Packagist doesn't auto-detect:
```bash
# Visit: https://packagist.org/packages/emerson-ph/ai-team-setup
# Click "Force Update"
```

## Support

Users can troubleshoot with:

```bash
# Re-publish with force
php artisan vendor:publish --provider="Emerson\\AITeamSetup\\AITeamSetupServiceProvider" --force

# Check what would be published
php artisan vendor:publish --list
```

---

**Ready to publish? Follow Step 1-6 above, then your package is live on Packagist!**
