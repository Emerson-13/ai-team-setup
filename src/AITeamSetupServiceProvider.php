<?php

namespace Emerson\AITeamSetup;

use Illuminate\Support\ServiceProvider;
use Emerson\AITeamSetup\Commands\InstallAITeam;

class AITeamSetupServiceProvider extends ServiceProvider
{
    public function register()
    {
        //
    }

    public function boot()
    {
        $this->publishesAssets();
        $this->registerCommands();
    }

    protected function publishesAssets()
    {
        $packagePath = __DIR__ . '/../publish';

        $this->publishes([
            $packagePath . '/AGENTS.md' => base_path('AGENTS.md'),
            $packagePath . '/CLAUDE.md' => base_path('CLAUDE.md'),
            $packagePath . '/GEMINI.md' => base_path('GEMINI.md'),
            $packagePath . '/README-AI-SETUP.md' => base_path('README-AI-SETUP.md'),
        ], 'ai-team-docs');

        $this->publishes([
            $packagePath . '/.claude' => base_path('.claude'),
            $packagePath . '/.github' => base_path('.github'),
            $packagePath . '/.cursor' => base_path('.cursor'),
            $packagePath . '/.windsurfrules' => base_path('.windsurfrules'),
            $packagePath . '/.clinerules' => base_path('.clinerules'),
        ], 'ai-team-config');

        $this->publishes([
            $packagePath . '/docs/ai' => base_path('docs/ai'),
        ], 'ai-team-docs');

        $this->publishes([
            $packagePath . '/sync-ai-files.sh' => base_path('sync-ai-files.sh'),
            $packagePath . '/sync-ai-files.ps1' => base_path('sync-ai-files.ps1'),
        ], 'ai-team-scripts');
    }

    protected function registerCommands()
    {
        if ($this->app->runningInConsole()) {
            $this->commands([
                InstallAITeam::class,
            ]);
        }
    }
}
