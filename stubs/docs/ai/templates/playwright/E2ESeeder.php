<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Known data for Playwright. ADAPT model names, columns, and ids to the project.
 * Must match tests/e2e/support/users.ts. Runs ONLY when APP_ENV=e2e.
 */
class E2ESeeder extends Seeder
{
    public function run(): void
    {
        abort_unless(app()->environment('e2e'), 500, 'E2ESeeder runs only in the e2e environment.');

        // Two tenants, so cross-tenant tests are meaningful.
        // $companyA = Company::factory()->create(['name' => 'E2E Company A']);
        // $companyB = Company::factory()->create(['name' => 'E2E Company B']);

        // Users per role (password "password"; hashed by the factory or Hash::make).
        // $adminA = User::factory()->for($companyA)->create(['email' => 'admin.a@e2e.test']);   // + admin role/permissions
        // $staffA = User::factory()->for($companyA)->create(['email' => 'staff.a@e2e.test']);   // + limited role
        // $adminB = User::factory()->for($companyB)->create(['email' => 'admin.b@e2e.test']);

        // Platform side (admin guard): one user per platform role. See docs/ai/ACCESS.md.
        // $super   = AdminUser::factory()->create(['email' => 'super@e2e.test']);    // assign 'Super Admin'
        // $support = AdminUser::factory()->create(['email' => 'support@e2e.test']);  // assign 'Support' (limited)
        // Company roles are created per company by the onboarding Service; assign Owner/Staff inside each company (team).

        // Known records with fixed ids used by tenant-isolation.spec.ts and realtime.spec.ts.
        // Order::factory()->for($companyB)->create(['id' => '00000000-0000-7000-8000-0000000000b1', 'number' => 'ORD-B-0001']);
        // Order::factory()->for($companyA)->create(['number' => 'ORD-A-0001', 'status' => 'pending']);

        // If spatie/laravel-permission is used: call app(PermissionRegistrar::class)->forgetCachedPermissions() after seeding.
    }
}
