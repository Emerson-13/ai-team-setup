# Regenerates tool-specific copies from AGENTS.md and docs/ai/TEAM.md. Edit those two files only.
# Windows / Laragon friendly (PowerShell 5.1+). Run:  powershell -ExecutionPolicy Bypass -File .\sync-ai-files.ps1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding $false

function Read-Text($path) { return [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot $path), $utf8) }
function Write-Text($path, $text) {
    $full = Join-Path $PSScriptRoot $path
    New-Item -ItemType Directory -Force -Path (Split-Path $full) | Out-Null
    [System.IO.File]::WriteAllText($full, $text, $utf8)
}

$agents = Read-Text 'AGENTS.md'
$team   = Read-Text 'docs/ai/TEAM.md'

foreach ($target in @('GEMINI.md', '.windsurfrules', '.clinerules', '.github/copilot-instructions.md')) {
    Write-Text $target $agents
}

$cursorHeader = @'
---
description: Laravel Enterprise Agentic Team - team workflow and architecture rules for Laravel + Vue work (MySQL, Reverb, Playwright, strategy council)
globs: ["app/**/*.php","routes/**/*.php","database/**/*.php","resources/js/**/*","tests/**/*","playwright.config.ts","docs/ai/**/*.md"]
alwaysApply: false
---


'@
Write-Text '.cursor/rules/laravel-team.mdc' ($cursorHeader + $agents)

$skillHeader = @'
---
name: laravel-team
description: Use for building, modifying, refactoring, fixing, planning, testing, or marketing-readiness of Laravel + Vue (Inertia) SaaS features. Runs a team of engineer roles (architect, DB, backend, frontend, platform/realtime, QA + Playwright, reviewers) plus a Strategy Council (product, marketing, systems thinking, research, challenger) as one, on MySQL, with a Team Brief, frozen contract, independent review, and honest reporting.
---


'@
Write-Text '.claude/skills/laravel-team/SKILL.md' ($skillHeader + $team)

Write-Host 'Synced: GEMINI.md .windsurfrules .clinerules .github/copilot-instructions.md .cursor/rules/laravel-team.mdc .claude/skills/laravel-team/SKILL.md'
