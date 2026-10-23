# ACCESS.md: Roles, Permissions, Admin Side and Client Side

Read this when the task touches **roles, permissions, login areas, an admin panel, super admin, per-company roles, impersonation, or "who can see/do what"**. All of these are at least **size L** (see TEAM.md Section 5).

Companion to TEAM.md (Sections 11, 12, 18), PACKAGES.md (spatie/laravel-permission row), and PLAYWRIGHT.md.

The code in this file is a **pattern to adapt, not a paste-and-pray recipe.** Before using any Spatie call, read the docs for the **installed major version** (`composer show spatie/laravel-permission`) and confirm the behavior with the tests in Section 10. If the docs and this file disagree, the docs win; record the difference in the Team Brief.

---

## 1. Vocabulary (use the same words in every file)

| Term | Meaning |
|---|---|
| **Platform side** (admin side) | The back-office run by the platform owner's staff. Manages companies, billing, support, system settings. |
| **Client side** | The customer-facing app. Users belong to one or more **companies** (tenants) and only touch their own company's data. |
| **Super Admin** | A platform-side identity that passes every platform permission check. Exists **only** on the platform side. |
| **Platform role** | e.g. Support, Finance, Content Manager. A named bundle of platform permissions. |
| **Company role** | e.g. Owner, Admin, Manager, Staff, Viewer. A named bundle of permissions **inside one company**. |
| **Permission** | A single action on a resource, e.g. `orders.update`. **Permissions are what code checks. Roles are only labels that carry permissions.** |

Three questions are answered separately, and all three must pass:

1. **Authentication:** who are you? (guard)
2. **Tenant ownership:** does this record belong to your company? (scope + policy)
3. **Permission:** may your role do this action? (Spatie + policy)

A role never grants access to another company's data. Passing question 3 does not skip question 2.

---

## 2. Decide first (write each as an AD-n in the Team Brief)

Do not build until these are answered. Strategy Council and the user decide; the Architect records.

| # | Decision | Default | Deviate only when |
|---|---|---|---|
| **AD-A** | Are platform staff and client users separate identities? | **Yes.** Separate guard `admin`, separate `admin_users` table, separate login URL (`/admin/login`), separate session cookie, separate route file. | One person must be both staff and a client user with one login. Then use one `users` table with a `type` column and still keep separate guards for the two areas. |
| **AD-B** | Are client roles scoped per company? | **Yes.** Spatie **teams** enabled, `team_foreign_key = company_id`. The same user can be Owner in company A and Staff in company B. | Every user belongs to exactly one company and roles are global. Then teams can stay off. |
| **AD-C** | Super Admin mechanism | `Gate::before` on the **admin guard only**, returns `true` or `null` (never `false`). | Never on the client side. A client "Owner" is a normal role that is **given all company permissions**, not a bypass. |
| **AD-D** | Who may create or change roles? | Platform: Super Admin only (`roles.manage`). Client: company Owner only, inside their own company, for company roles only. | Customers need custom roles per company. Then add a role editor with the escalation rule in Section 7. |
| **AD-E** | Is impersonation needed? | **No.** | Support must see what a client sees. Then follow Section 8. |
| **AD-F** | Platform roles known now? | List them with the user (Super Admin, Admin, Support, Finance, ...). | Unknown: start with Super Admin plus one limited role, add more later through the seeder. |

**Known risk for AD-A + AD-B together:** Spatie's teams mode needs a team id for every assignment, and the docs state the team id is "always required" for these relationships. Platform staff have no company. The default is a **reserved platform team id** (config value `access.platform_team_id`, for example `0`) used only on the admin guard. **Do not assume this works. Prove it with the isolation tests in Section 10 before building on it.** If it fails on the installed version, stop and record a new AD (for example a separate permission table for platform roles) instead of patching around it.

---

## 3. Permission design

### 3.1 Naming

- Format: `resource.action`, lowercase, dot-separated: `orders.view`, `orders.create`, `orders.update`, `orders.delete`, `orders.export`.
- Platform permissions are prefixed `admin.`: `admin.companies.view`, `admin.companies.suspend`, `admin.roles.manage`, `admin.billing.refund`.
- Use the standard verbs (`view`, `create`, `update`, `delete`) plus **explicit verbs for risky actions** (`export`, `approve`, `refund`, `impersonate`, `manage`). Risky actions get their own permission; they do not hide inside `update`.
- `view` is split into `viewAny` (list) and `view` (one record) in the Policy, but one permission (`orders.view`) usually covers both.
- Never create a permission just for a UI element. Create it for an **action the server enforces**.

### 3.2 The role matrix (required deliverable)

Every L/XL task that touches access adds a matrix to the Team Brief **before code**, and QA derives tests from it.

```text
Platform side (guard: admin)
Permission                   | Super Admin | Admin | Support | Finance
admin.companies.view         | yes (bypass)| yes   | yes     | no
admin.companies.suspend      | yes         | yes   | no      | no
admin.billing.refund         | yes         | no    | no      | yes
admin.roles.manage           | yes         | no    | no      | no

Client side (guard: web, scoped by company)
Permission                   | Owner | Admin | Manager | Staff | Viewer
orders.view                  | yes   | yes   | yes     | yes   | yes
orders.create                | yes   | yes   | yes     | yes   | no
orders.update                | yes   | yes   | yes     | own   | no
orders.delete                | yes   | yes   | no      | no    | no
roles.manage (company)       | yes   | no    | no      | no    | no
```

`own` means the Policy additionally checks the record's owner. Write it in the matrix so it is not forgotten.

---

## 4. Setup pattern (Laravel + Spatie)

### 4.1 Guards and providers (`config/auth.php`)

```php
'guards' => [
    'web'   => ['driver' => 'session', 'provider' => 'users'],
    'admin' => ['driver' => 'session', 'provider' => 'admin_users'],
],
'providers' => [
    'users'       => ['driver' => 'eloquent', 'model' => App\Models\User::class],
    'admin_users' => ['driver' => 'eloquent', 'model' => App\Models\AdminUser::class],
],
'passwords' => [
    'users'       => ['provider' => 'users', 'table' => 'password_reset_tokens', 'expire' => 60, 'throttle' => 60],
    'admin_users' => ['provider' => 'admin_users', 'table' => 'admin_password_reset_tokens', 'expire' => 60, 'throttle' => 60],
],
```

Each authenticatable model that uses Spatie sets its guard:

```php
class AdminUser extends Authenticatable
{
    use HasRoles;
    protected string $guard_name = 'admin';   // Spatie reads this
}
```

Platform roles and permissions are created with `guard_name = 'admin'`; company roles and permissions with `guard_name = 'web'`. Never mix.

### 4.2 Spatie configuration (before the first migration)

- Publish the config and migration: `php artisan vendor:publish --provider="Spatie\Permission\PermissionServiceProvider"`.
- In `config/permission.php`: `'teams' => true` and `'team_foreign_key' => 'company_id'` (if AD-B = yes).
- **Edit the migration before migrating** if users use UUID/ULID keys (`model_id` type) and decide the `company_id` column type to match the `companies` table. Already migrated by mistake? Spatie documents `php artisan permission:setup-teams`; read it first.
- MySQL: keep the Spatie tables on InnoDB with utf8mb4 like every other table (TEAM.md Section 13.1).

### 4.3 Set the active company on every client request

Roles on the client side only resolve correctly when the team id is set. A middleware sets it from the **server-side session**, never from a request parameter the user controls:

```php
class SetPermissionsTeam
{
    public function handle(Request $request, Closure $next)
    {
        if ($user = $request->user('web')) {
            $companyId = session('company_id');

            // The active company must be one the user actually belongs to.
            abort_unless($companyId && $user->companies()->whereKey($companyId)->exists(), 403);

            app(PermissionRegistrar::class)->setPermissionsTeamId($companyId);
            $user->unsetRelation('roles')->unsetRelation('permissions');
        }

        return $next($request);
    }
}
```

- Register it so it runs **before `SubstituteBindings`** (middleware priority), or route-model-binding resolves before the team is set and you get 404 where 403 is expected (Laravel 11.27+: `addToMiddlewarePriorityBefore(...)`).
- On the admin guard, a sibling middleware sets the **platform team id** (`config('access.platform_team_id')`).
- **Switching company** = update `session('company_id')`, call `setPermissionsTeamId()` again, and `unsetRelation('roles')->unsetRelation('permissions')`.

### 4.4 Super Admin (platform only)

```php
// AppServiceProvider::boot()
Gate::before(function ($user, $ability) {
    // return true or null. NEVER false: false would block normal policy checks.
    return $user instanceof AdminUser && $user->hasRole('Super Admin') ? true : null;
});
```

Consequences you must respect:

- It works for `can()`, `@can`, `Gate::allows`, policies, and `can:` middleware. It does **not** affect `hasPermissionTo()`, `hasAnyPermission()` and similar Spatie methods, which only see assigned permissions. **So all authorization goes through `can()` / policies, never `hasPermissionTo()` in app code.**
- This is the **only** place a role name is hard-coded. Everywhere else, check permissions.
- It never applies to a client `User`. The `instanceof AdminUser` check is deliberate.
- Super Admin bypasses permissions, **not** tenant scoping bugs or business rules (a suspended company stays suspended). If a Policy rule must hold for everyone, put it in `Gate::after` or in the Service, not in a rule a bypass skips.

### 4.5 Routes

```php
// routes/web.php (client)
Route::middleware(['auth:web', 'set.team'])->group(function () {
    Route::resource('orders', OrderController::class);   // Policy via authorizeResource or authorize()
});

// routes/admin.php (platform), loaded with prefix 'admin' and name 'admin.'
Route::middleware(['auth:admin', 'set.platform.team'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('companies', [CompanyController::class, 'index'])->middleware('can:admin.companies.view');
});
```

Route middleware (`can:`) is the **coarse** gate. The **Policy is the real gate** (ownership + permission), and the Form Request or Service enforces it again for anything not going through a controller (jobs, exports, imports, commands, broadcasts).

### 4.6 Policies

```php
class OrderPolicy
{
    public function update(User $user, Order $order): bool
    {
        return $order->company_id === session('company_id')          // 1. tenant ownership
            && $user->can('orders.update');                          // 2. permission
    }
}
```

`can()` (not `hasPermissionTo()`) keeps the Gate pipeline in play. Tenant ownership is checked **inside every Policy method** that receives a record.

### 4.7 Sharing permissions with the UI (Inertia)

```php
// HandleInertiaRequests::share()
'auth' => [
    'user' => fn () => $request->user()?->only('id', 'name', 'email'),
    'can'  => fn () => $request->user() ? $request->user()->getAllPermissions()->pluck('name')->all() : [],
],
```

In Vue: `v-if="can('orders.create')"` via a small composable. **This only hides buttons.** Hiding is cosmetic; the server must refuse the action regardless. Never put role names or permission logic in Vue.

---

## 5. Seeding roles and permissions

- One **idempotent** `RolesAndPermissionsSeeder` (`firstOrCreate`, then `syncPermissions`). It runs on every deploy and in tests, so re-running changes nothing unexpectedly.
- Define the matrix in one PHP array (single source of truth for seeder, docs, and tests).
- Call `app(PermissionRegistrar::class)->forgetCachedPermissions()` at the start of the seeder and in test setup.
- **Platform roles:** seeded globally for the admin guard.
- **Company roles:** created **per company** (team) when a company is created, inside the same transaction, by the Service that creates the company (`CompanyOnboardingService`), not by a controller or an observer that can fail silently. Backfill existing companies with a migration/command, and test that backfill.
- Never seed a real Super Admin password. Create the first Super Admin with an artisan command (`php artisan admin:create-super --email=...`) that prompts for the password.
- The E2E seeder creates one user per role for both sides (PLAYWRIGHT.md).

---

## 6. Where permissions must be enforced (all of them)

| Layer | Rule |
|---|---|
| Route | `auth:{guard}` + coarse `can:` |
| Policy | Tenant ownership + permission, on every record action |
| Form Request `authorize()` | For create/update flows that depend on the request |
| Service | Re-check for anything callable outside HTTP (jobs, commands, imports, exports) |
| Queries and exports | Scoped to the company; export has its own permission (`orders.export`) |
| Queued jobs, notifications, broadcasts | Carry `company_id`; set the team id in the job before any permission check |
| Broadcast channels (`routes/channels.php`) | Authorize by company **and** permission |
| API tokens (Sanctum) | Abilities match permissions; a token never exceeds its user's permissions |
| Inertia props / API Resources | Do not return fields the role may not see (hiding in Vue is not protection) |
| Files and downloads | Authorize on the file's record, not on the URL being unguessable |

---

## 7. Privilege rules (the part most apps get wrong)

1. **No privilege escalation.** A user may only assign roles and permissions that they hold themselves. Company Owner can assign company roles only inside their own company; they can never assign a platform role.
2. **Last-owner / last-super-admin protection.** The last Super Admin cannot be deleted, demoted, or deactivated. Each company must keep at least one Owner.
3. **Roles and permissions are not editable through mass assignment.** Role assignment goes through a dedicated Service with its own permission (`roles.manage` / `admin.roles.manage`) and an audit entry.
4. **System roles** (Super Admin, Owner) are flagged and cannot be renamed or deleted from the UI.
5. **Super Admin is assigned only by artisan command or seeder**, never from a web form.
6. **Cross-guard separation.** A `web` session must not reach `/admin/*`, and an `admin` session must not act as a client user. They are different guards, so test it.
7. **Audit everything about access**: role created/changed/deleted, permission added/removed, role assigned/removed, login to admin side, failed admin logins, impersonation start/stop (spatie/laravel-activitylog or an equivalent; PACKAGES.md). Record `company_id`, actor guard, actor id, target.
8. **Admin side hardening (recommended):** 2FA for every platform user (Fortify), stricter throttle, a separate session lifetime, optional IP allow-list.

---

## 8. Impersonation (only if AD-E = yes)

It is an account-takeover feature. If it exists it must have **all** of these:

- Own permission `admin.users.impersonate`; Super Admin only by default.
- Cannot impersonate another platform user or a Super Admin.
- A **permanent visible banner** with a "Stop impersonating" button.
- Time limit, and the original admin id stored in the session.
- Destructive or sensitive actions blocked while impersonating (password change, billing, delete account, role changes).
- Start and stop written to the audit log, with the reason.

---

## 9. Client-side specifics

- A user can belong to several companies; the **active company lives in the session** and is validated against membership on every request (middleware in 4.3).
- A company's roles are its own. Editing "Manager" in company A never changes company B.
- Default company roles come from the seeder array; the Owner role holds all company permissions and is kept in sync when new permissions are released (a migration/seeder run on deploy).
- Invitations: an invite carries `company_id` and a role id; accepting it assigns that role **inside that company only**. Validate that the inviter holds the right to assign that role (Section 7.1).
- Subscription or plan limits (feature flags) are **separate from roles**. A role says what a person may do; a plan says what the company has bought. Check both, and do not model plans as roles.

---

## 10. Testing (QA derives these from the matrix, not from the code)

**Backend (Pest, MySQL `*_testing`):**

1. **Matrix test.** A dataset of role x endpoint -> expected status (200/403/404), generated from the same array the seeder uses. Every "no" in the matrix is a test.
2. **Cross-tenant test.** Same permission, other company's record -> 403/404.
3. **Cross-guard test.** Client session on `/admin/*` is refused; admin session on client routes is refused.
4. **Team scoping test (proves AD-A + AD-B).** The same user holds different roles in company A and B and gets different results after switching. Platform roles do not appear under a company team, and company roles do not appear under the platform team. If this fails, stop (see Section 2).
5. **Escalation test.** A non-super user cannot assign a role they do not hold; Owner cannot assign a platform role.
6. **Last-owner / last-super-admin test.**
7. **Super Admin bypass test.** Passes `can()`, and still fails a business rule that must hold for everyone.
8. **Queue test.** A job that checks a permission sets the right team id and does not leak another company's.
9. **Cache test.** After role changes, `forgetCachedPermissions()` makes the change effective; seeders and tests reset the cache.

**E2E (Playwright, `*_e2e`):** one user per role per side, the `access-matrix.spec.ts` template, plus a denial for each risky action. Template: `docs/ai/templates/playwright/tests/e2e/specs/access-matrix.spec.ts`.

Anything not run is **Not Tested** (AGENTS.md honesty rule).

---

## 11. Review checklist (Security Reviewer, independent of the author)

- [ ] Every route has `auth:{guard}`; no route is accidentally unauthenticated.
- [ ] Every record action goes through a Policy that checks tenant **and** permission.
- [ ] No `hasRole('...')` outside `Gate::before`; no `hasPermissionTo()` in app code (use `can()`).
- [ ] No role names or permission logic in Vue; UI hiding is cosmetic only.
- [ ] Super Admin bypass is admin-guard only and returns `true` or `null`.
- [ ] Middleware order: team middleware runs before `SubstituteBindings`.
- [ ] Jobs, exports, notifications and broadcast channels set the team id and authorize.
- [ ] Role assignment cannot escalate; last owner / last super admin protected.
- [ ] Access changes are audited; admin login is hardened.
- [ ] Seeder is idempotent; company-role backfill exists for old companies.
- [ ] Matrix, cross-tenant, cross-guard and escalation tests exist and ran.

---

## 12. Common mistakes (do not repeat)

- Checking `$user->role === 'admin'` or a boolean `is_admin` column.
- Letting a client session reach admin routes because both use the same guard.
- Setting the team id from a request parameter.
- Forgetting the team id in queued jobs (permissions silently resolve against the wrong company or none).
- Returning `false` from `Gate::before`.
- Calling `hasPermissionTo()` and expecting Super Admin to pass.
- Treating "has permission" as "may see this record" (no ownership check).
- Seeding permissions without resetting the Spatie cache, so tests pass or fail at random.
- Giving Owner a bypass instead of explicit permissions, so new permissions silently skip checks.
- Letting the UI be the only protection.
