#!/usr/bin/env bash
# Regenerates tool-specific copies from AGENTS.md and docs/ai/TEAM.md. Edit those two files only.
set -euo pipefail
cd "$(dirname "$0")"

cp AGENTS.md GEMINI.md
cp AGENTS.md .windsurfrules
cp AGENTS.md .clinerules
mkdir -p .github .cursor/rules .claude/skills/laravel-team
cp AGENTS.md .github/copilot-instructions.md

{
cat <<'HDR'
---
description: Laravel Enterprise Agentic Team - team workflow and architecture rules for Laravel + Vue work (MySQL, Reverb, Playwright, strategy council)
globs: ["app/**/*.php","routes/**/*.php","database/**/*.php","resources/js/**/*","tests/**/*","playwright.config.ts","docs/ai/**/*.md"]
alwaysApply: false
---

HDR
cat AGENTS.md
} > .cursor/rules/laravel-team.mdc

{
cat <<'HDR'
---
name: laravel-team
description: Use for building, modifying, refactoring, fixing, planning, testing, or marketing-readiness of Laravel + Vue (Inertia) SaaS features. Runs a team of engineer roles (architect, DB, backend, frontend, platform/realtime, QA + Playwright, reviewers) plus a Strategy Council (product, marketing, systems thinking, research, challenger) as one, on MySQL, with a Team Brief, frozen contract, independent review, and honest reporting.
---

HDR
cat docs/ai/TEAM.md
} > .claude/skills/laravel-team/SKILL.md

echo "Synced: GEMINI.md .windsurfrules .clinerules .github/copilot-instructions.md .cursor/rules/laravel-team.mdc .claude/skills/laravel-team/SKILL.md"
