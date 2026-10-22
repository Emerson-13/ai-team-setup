<?php

namespace Emerson\AITeamSetup\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class InstallAITeam extends Command
{
    protected $signature = 'ai-team:install
                            {--config : Publish all configuration files}
                            {--docs : Publish documentation only}
                            {--scripts : Publish sync scripts only}
                            {--all : Publish everything (default)}';

    protected $description = 'Install AI Team Setup - configure AI tools with role-based strategy council';

    public function handle()
    {
        $this->info('🤖 Installing AI Team Setup...');
        $this->newLine();

        // Determine what to publish
        $hasOption = $this->option('config') || $this->option('docs') || $this->option('scripts');
        $publishAll = !$hasOption || $this->option('all');

        if ($publishAll || $this->option('config')) {
            $this->publishConfig();
        }

        if ($publishAll || $this->option('docs')) {
            $this->publishDocs();
        }

        if ($publishAll || $this->option('scripts')) {
            $this->publishScripts();
        }

        $this->newLine();
        $this->info('✅ AI Team Setup installed successfully!');
        $this->newLine();
        $this->showNextSteps();
    }

    protected function publishConfig()
    {
        $this->info('📋 Publishing configuration files...');

        $this->call('vendor:publish', [
            '--provider' => 'Emerson\\AITeamSetup\\AITeamSetupServiceProvider',
            '--tag' => 'ai-team-config',
            '--force' => true,
        ]);

        $this->line('  ✓ Configuration files published');
    }

    protected function publishDocs()
    {
        $this->info('📚 Publishing documentation...');

        $this->call('vendor:publish', [
            '--provider' => 'Emerson\\AITeamSetup\\AITeamSetupServiceProvider',
            '--tag' => 'ai-team-docs',
            '--force' => true,
        ]);

        $this->line('  ✓ Documentation published');
    }

    protected function publishScripts()
    {
        $this->info('🔧 Publishing sync scripts...');

        $this->call('vendor:publish', [
            '--provider' => 'Emerson\\AITeamSetup\\AITeamSetupServiceProvider',
            '--tag' => 'ai-team-scripts',
            '--force' => true,
        ]);

        // Make scripts executable on Unix
        if (!$this->isWindows()) {
            @chmod(base_path('sync-ai-files.sh'), 0755);
        }

        $this->line('  ✓ Scripts published');
    }

    protected function showNextSteps()
    {
        $this->comment('Next steps:');
        $this->newLine();
        $this->line('1. <fg=blue>MySQL Setup:</> Update phpunit.xml');
        $this->line('   Replace SQLite with: DB_CONNECTION=mysql DB_DATABASE=app_testing');
        $this->line('   See: docs/ai/TEAM.md (Section 13.1)');
        $this->newLine();
        $this->line('2. <fg=blue>Playwright (optional):</> For E2E tests');
        $this->line('   Follow: docs/ai/PLAYWRIGHT.md (Section 2)');
        $this->newLine();
        $this->line('3. <fg=blue>Packages (on-demand):</> Install tools as needed');
        $this->line('   Check: docs/ai/PACKAGES.md');
        $this->newLine();
        $this->line('4. <fg=blue>Keep in sync:</> After editing AGENTS.md or TEAM.md, run:');
        $this->line('   <fg=yellow>./sync-ai-files.sh</> (macOS/Linux/WSL)');
        $this->line('   <fg=yellow>powershell -ExecutionPolicy Bypass -File .\\sync-ai-files.ps1</> (Windows)');
        $this->newLine();
        $this->line('📖 Start reading: <fg=cyan>docs/ai/TEAM.md</> for the full playbook');
        $this->newLine();
    }

    protected function isWindows()
    {
        return strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
    }
}
