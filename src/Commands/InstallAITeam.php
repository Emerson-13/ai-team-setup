<?php

namespace Emerson\AITeamSetup\Commands;

use Illuminate\Console\Command;
use Illuminate\Filesystem\Filesystem;

class InstallAITeam extends Command
{
    protected $signature = 'ai-team:install
                            {--config : Publish tool configuration only (.claude, .cursor, AGENTS.md, CLAUDE.md, ...)}
                            {--docs : Publish docs/ai only}
                            {--scripts : Publish sync scripts only}
                            {--all : Publish everything (default)}
                            {--no-force : Do not overwrite existing files}';

    protected $description = 'Install AI Team Setup - configure AI tools with a role-based strategy council';

    protected Filesystem $files;

    protected array $missing = [];

    protected int $copied = 0;

    public function handle(Filesystem $files): int
    {
        $this->files = $files;
        $stubs = dirname(__DIR__, 2).'/stubs';

        if (! $files->isDirectory($stubs)) {
            $this->error("Package stubs not found at: {$stubs}");
            $this->line('Reinstall with: composer reinstall emerson-ph/ai-team-setup');

            return self::FAILURE;
        }

        $this->info('🤖 Installing AI Team Setup...');

        $only = $this->option('config') || $this->option('docs') || $this->option('scripts');
        $all = ! $only || $this->option('all');

        if ($all || $this->option('config')) {
            $this->section('📋 Publishing configuration files...');
            foreach (['AGENTS.md', 'CLAUDE.md', 'README-AI-SETUP.md'] as $name) {
                $this->copyFile("{$stubs}/root/{$name}", base_path($name));
            }
            $this->copyDir("{$stubs}/claude", base_path('.claude'));
            $this->copyDir("{$stubs}/cursor", base_path('.cursor'));
            $this->generateDerivedFiles();
        }

        if ($all || $this->option('docs')) {
            $this->section('📚 Publishing documentation...');
            $this->copyDir("{$stubs}/docs/ai", base_path('docs/ai'));
        }

        if ($all || $this->option('scripts')) {
            $this->section('🔧 Publishing sync scripts...');
            $this->copyFile("{$stubs}/root/sync-ai-files.sh", base_path('sync-ai-files.sh'));
            $this->copyFile("{$stubs}/root/sync-ai-files.ps1", base_path('sync-ai-files.ps1'));
            if (! $this->isWindows() && $files->exists(base_path('sync-ai-files.sh'))) {
                @chmod(base_path('sync-ai-files.sh'), 0755);
            }
        }

        $this->newLine();

        if ($this->missing !== []) {
            $this->error('Install incomplete. These package files were missing:');
            foreach ($this->missing as $path) {
                $this->line("  - {$path}");
            }
            $this->line('Try: composer reinstall emerson-ph/ai-team-setup');

            return self::FAILURE;
        }

        $this->info("✅ AI Team Setup installed successfully ({$this->copied} files).");
        $this->newLine();
        $this->showNextSteps();

        return self::SUCCESS;
    }

    protected function section(string $title): void
    {
        $this->newLine();
        $this->info($title);
    }

    protected function shouldOverwrite(): bool
    {
        return ! $this->option('no-force');
    }

    protected function copyFile(string $from, string $to): void
    {
        if (! $this->files->isFile($from)) {
            $this->missing[] = $from;

            return;
        }

        if ($this->files->exists($to) && ! $this->shouldOverwrite()) {
            $this->line("  skipped (exists): {$to}");

            return;
        }

        $this->files->ensureDirectoryExists(dirname($to));
        $this->files->copy($from, $to);
        $this->copied++;
        $this->line('  ✓ '.$this->relative($to));
    }

    protected function copyDir(string $from, string $to): void
    {
        if (! $this->files->isDirectory($from)) {
            $this->missing[] = $from;

            return;
        }

        foreach ($this->files->allFiles($from, true) as $file) {
            $this->copyFile($file->getPathname(), $to.'/'.$file->getRelativePathname());
        }
    }

    /**
     * Tool-specific copies are generated from AGENTS.md (same as sync-ai-files.*).
     */
    protected function generateDerivedFiles(): void
    {
        $agents = base_path('AGENTS.md');

        if (! $this->files->exists($agents)) {
            return;
        }

        foreach (['GEMINI.md', '.windsurfrules', '.clinerules', '.github/copilot-instructions.md'] as $target) {
            $this->copyFile($agents, base_path($target));
        }
    }

    protected function relative(string $path): string
    {
        return ltrim(str_replace([base_path(), '\\'], ['', '/'], $path), '/');
    }

    protected function showNextSteps(): void
    {
        $this->comment('Next steps:');
        $this->line('1. MySQL: update phpunit.xml (DB_CONNECTION=mysql, DB_DATABASE=app_testing). See docs/ai/TEAM.md (Section 13.1)');
        $this->line('2. Playwright (optional): docs/ai/PLAYWRIGHT.md (Section 2)');
        $this->line('3. Packages (on demand): docs/ai/PACKAGES.md');
        $this->line('4. After editing AGENTS.md or TEAM.md run ./sync-ai-files.sh (macOS/Linux/WSL) or');
        $this->line('   powershell -ExecutionPolicy Bypass -File .\sync-ai-files.ps1 (Windows)');
        $this->line('Start reading: docs/ai/TEAM.md');
    }

    protected function isWindows(): bool
    {
        return strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
    }
}
