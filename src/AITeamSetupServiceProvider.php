<?php

namespace Emerson\AITeamSetup;

use Emerson\AITeamSetup\Commands\InstallAITeam;
use Illuminate\Support\ServiceProvider;

class AITeamSetupServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([InstallAITeam::class]);
        }
    }
}
