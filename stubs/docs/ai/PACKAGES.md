# Packages: Catalog and Setup Guide

> Companion to `docs/ai/TEAM.md` (Sections 8, 11.10, 13.1, 18, 27). The **Platform / Realtime Engineer** owns this file's topics; every other role follows it.
>
> This guide covers the Laravel first-party suite plus a vetted set of PHP and JS packages. It cannot list every package that exists. **Any package not listed goes through the Intake Checklist (Section 1)** and gets the same setup block (Section 15).
>
> Versions and commands change. Before installing, confirm against the project's `composer.json` / `package.json` and the package's current docs. If you cannot verify a command, say so in the Team Brief (mark **Not Tested**).

---

## 0. Baseline for this stack

```text
Laravel (11+ or 12) | PHP 8.2+ | Vue 3 + TypeScript + Inertia | Tailwind CSS | MySQL 8 (InnoDB, utf8mb4)
Pest | Pint | Larastan | Playwright | Reverb (when realtime is needed)
```

Always on in a new project: MySQL config (Section 2), Pest, Pint, Larastan, Playwright, queue worker. Everything else is **install on demand** when a requirement needs it.

---

## 1. Package Intake Checklist (required before `composer require` / `npm install`)

The default is **no new package** (TEAM.md Section 11). A package is added only when all of these are answered in the Team Brief (Packages section) and recorded as an AD-n:

```text
1. NEED         Which BR-/AC- needs it? What is the cost of building it ourselves?
2. FIRST-PARTY  Does Laravel/Inertia/Vue already provide it? (prefer first-party, then Spatie-class maintainers)
3. HEALTH       Last release date, open critical issues, supports our Laravel + PHP versions, downloads/stars as a rough signal
4. LICENSE      Compatible with the product (commercial SaaS)
5. SECURITY     Run `composer audit` / `npm audit`; review what it reads/writes, network calls, and admin UIs it exposes
6. TENANCY      Is it tenant-aware? Does it need a company/team key? Can it leak data across tenants?
7. MYSQL        Works on MySQL (no Postgres-only assumptions), UUID keys supported (check morph/foreign key columns in its migrations)
8. ARCHITECTURE Does it respect Service layer / Form Requests / Resources, or force logic into controllers/models?
9. TESTS        How will we test it (feature test, Playwright)? What is the fake/sandbox for external APIs?
10. EXIT        How do we remove it? What data does it own?
11. OPS         New env keys, processes, cron entries, queues, disk, cost
```

Reject abandoned packages (for example `beyondcode/laravel-websockets`; use Reverb). After install: commit `composer.lock` / `package-lock.json`, add env keys to `.env.example`, add the setup notes to the Release notes.

---

## 2. Foundation: MySQL, env, local environment

**`.env` / `.env.example`**

```dotenv
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=app
DB_USERNAME=root
DB_PASSWORD=
```

Create three databases on the same server: `app`, `app_testing`, `app_e2e`. Then follow TEAM.md Section 13.1 (replace SQLite lines in `phpunit.xml`, add the test-database guard).

**Windows / Laragon notes**

- Laragon bundles MySQL (or MariaDB, check with `SELECT VERSION();` and record it in the Team Brief). Create databases from Laragon's HeidiSQL or `mysql -u root -e "CREATE DATABASE app_testing CHARACTER SET utf8mb4;"`.
- `ext-pcntl` and `ext-posix` do not exist on native Windows. That means **Horizon**, **Pail**, and **Octane** (Swoole) will not run natively; use WSL2/Docker for those, or use `queue:work` locally and run Horizon only in Linux production. Laravel's `composer dev` script may include Pail; remove it on Windows.
- Redis: Laragon offers it as an add-on; with PhpRedis unavailable, use `predis/predis` locally (`REDIS_CLIENT=predis`).
- `mysqldump` path for backups: set `dump.dump_binary_path` in the `mysql` connection (`config/database.php`) to Laragon's MySQL `bin` folder.
- Mail: use Mailpit (bundled with Laragon or standalone) on `127.0.0.1:1025`.
- Playwright on Windows: `npx playwright install chromium` (no `--with-deps`).
- Long-running local processes each need their own terminal (or `concurrently`): `php artisan serve` (or the Laragon vhost), `npm run dev`, `php artisan queue:work`, `php artisan reverb:start --debug`, `php artisan schedule:work`.

---

## 3. Realtime: WebSockets with Laravel Reverb + Echo

**Use when:** users must see changes without refreshing (notifications, live status, dashboards, chat, collaborative lists). **Do not use** for things a refresh or a 30-second poll handles fine.

**Choice:** Reverb (first-party, self-hosted, Pusher-protocol compatible). Alternatives behind the same Echo client: Pusher Channels or Ably (hosted, pay per usage; fewer ops). Not recommended: `beyondcode/laravel-websockets` (abandoned), Soketi (check maintenance before choosing).

### 3.1 Install

```bash
php artisan install:broadcasting        # Laravel 11+: creates routes/channels.php, config/broadcasting.php, installs Echo + pusher-js; choose Reverb when prompted
# or manually:
composer require laravel/reverb
php artisan reverb:install
npm install --save-dev laravel-echo pusher-js
```

Confirm `bootstrap/app.php` loads channels: `->withRouting(..., channels: __DIR__.'/../routes/channels.php', ...)`.

### 3.2 Environment

```dotenv
BROADCAST_CONNECTION=reverb
QUEUE_CONNECTION=database        # or redis; broadcasting events are queued, a worker is REQUIRED

REVERB_APP_ID=local-app
REVERB_APP_KEY=local-key
REVERB_APP_SECRET=local-secret   # server side only, never exposed to Vite
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http
REVERB_SERVER_HOST=0.0.0.0       # where the Reverb process binds
REVERB_SERVER_PORT=8080

VITE_REVERB_APP_KEY="${REVERB_APP_KEY}"
VITE_REVERB_HOST="${REVERB_HOST}"
VITE_REVERB_PORT="${REVERB_PORT}"
VITE_REVERB_SCHEME="${REVERB_SCHEME}"
```

Production: generate real random id/key/secret, set `REVERB_HOST` to the public domain, `REVERB_SCHEME=https`, `REVERB_PORT=443` (behind the proxy).

### 3.3 Client (Vue 3 + TypeScript + Inertia)

`resources/js/echo.ts`:

```ts
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window { Pusher: typeof Pusher; Echo: Echo<'reverb'>; }
}

window.Pusher = Pusher;
window.Echo = new Echo({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: import.meta.env.VITE_REVERB_HOST,
  wsPort: Number(import.meta.env.VITE_REVERB_PORT ?? 80),
  wssPort: Number(import.meta.env.VITE_REVERB_PORT ?? 443),
  forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
  enabledTransports: ['ws', 'wss'],
});
```

Import it once in `resources/js/app.ts` (`import './echo';`). Optional: the first-party `@laravel/echo-vue` composables (`useEcho`) if the project's Laravel/starter-kit version provides them; verify the current package docs before adopting.

A composable that cleans up after itself (a leaked listener is a bug):

```ts
import { onBeforeUnmount, onMounted } from 'vue';

export function usePrivateChannel<T>(name: string, event: string, handler: (payload: T) => void) {
  onMounted(() => window.Echo.private(name).listen(event, handler));
  onBeforeUnmount(() => window.Echo.leave(name));
}
```

Usage with Inertia (refetch just the affected prop; the server stays the source of truth):

```ts
import { router } from '@inertiajs/vue3';
usePrivateChannel(`company.${companyId}.orders`, '.order.status.updated', () =>
  router.reload({ only: ['orders'] }),
);
```

### 3.4 Server: event, channel, authorization

```php
// app/Events/OrderStatusUpdated.php
class OrderStatusUpdated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Order $order) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("company.{$this->order->company_id}.orders")];
    }

    public function broadcastAs(): string { return 'order.status.updated'; }   // client listens to '.order.status.updated' (leading dot)

    public function broadcastWith(): array
    {
        return ['id' => $this->order->id, 'status' => $this->order->status->value];  // minimum fields only
    }
}
```

```php
// routes/channels.php  (tenant isolation + authorization, tested)
Broadcast::channel('company.{companyId}.orders', function (User $user, string $companyId) {
    return $user->belongsToCompany($companyId) && $user->can('viewAny', Order::class);
});
```

Dispatch from the **Service**, after the business operation succeeds: `OrderStatusUpdated::dispatch($order);` (not from the controller, not from Vue).

### 3.5 Rules and gotchas

- Event names: without `broadcastAs()`, the client event is the class name and needs the full namespace; with `broadcastAs()` it needs a leading dot (`.order.status.updated`). Pick one convention per project.
- `afterCommit` (the `ShouldDispatchAfterCommit` interface, or `after_commit` on the queue connection) prevents clients from receiving events for rolled-back transactions.
- **A queue worker must be running** for `ShouldBroadcast`. If nothing arrives, check the worker first, then Reverb, then channel authorization (`/broadcasting/auth` returns 403).
- Private/presence channels authenticate at `/broadcasting/auth` using the session (Inertia) or Sanctum (`Broadcast::routes(['middleware' => ['auth:sanctum']])` for token/SPA clients).
- Channel IDs are strings; with UUID models compare as strings, never cast to int.
- Public channels carry no tenant data. Presence channels expose member info to all members; return only id and display name.
- Payload size: keep it small; ids and changed fields, then refetch.
- Rate and cost: throttle client-triggered events (`whisper` / client events are not authorized by the server); prefer server-originated events.
- Scaling: one Reverb process is fine for most apps. For multiple servers set `REVERB_SCALING_ENABLED=true` (needs Redis) and put a load balancer in front.
- The UI must still be correct after a page refresh, and must handle "disconnected" gracefully (show stale data, reconnect, refetch on reconnect).

### 3.6 Running and production

```bash
php artisan reverb:start --debug              # local
php artisan reverb:start --host=0.0.0.0 --port=8080   # production process
php artisan reverb:restart                    # after every deploy (like queue:restart)
```

- Run Reverb under a process manager (Supervisor/systemd) with a raised open-files limit (`minfds` in Supervisor; `ulimit -n`).
- Put it behind Nginx/Caddy with WebSocket upgrade headers (`Upgrade`, `Connection: upgrade`) on `/app` and `/apps`, TLS terminated at the proxy.
- Shared hosting (for example Hostinger shared plans) usually **cannot** run a long-lived Reverb process. Use a VPS, or use hosted Pusher/Ably with the same Echo code (`BROADCAST_CONNECTION=pusher`/`ably`, change `broadcaster` and keys). Record this decision as an AD-n.
- Release checklist additions: new env keys, Reverb process, proxy rules, firewall port, `reverb:restart`, queue worker restart.

### 3.7 Tests

- Backend feature test: assert the event is dispatched (`Event::fake`) with the right payload, and that **channel authorization** returns true for a member and false for another tenant's user.
- Playwright (`docs/ai/PLAYWRIGHT.md`, realtime spec): two browser contexts, act in one, expect the update in the other, with Reverb and the queue worker running.

---

## 4. Queues, scheduler, cache, sessions

| Need | Setup |
|---|---|
| **Queues (default)** | `QUEUE_CONNECTION=database` on MySQL for low/medium volume. Tables: `jobs`, `job_batches`, `failed_jobs` (included in recent Laravel migrations; otherwise `php artisan make:queue-table`, `queue:batches-table`, `queue:failed-table`). Run `php artisan queue:work --tries=3`; restart on deploy with `queue:restart`. |
| **High volume** | Redis queue (`QUEUE_CONNECTION=redis`, PhpRedis on Linux, Predis on Windows) + **Horizon**. |
| **Job rules** | Idempotent, retry-safe, `backoff()`, `tries`, tenant id on the job, no Eloquent model with stale state (re-fetch), `failed()` handler, unique jobs where duplicates are harmful. |
| **Scheduler** | One cron entry: `* * * * * php /path/artisan schedule:run`. Define tasks in `routes/console.php` (Laravel 11+) with `->withoutOverlapping()` and `->onOneServer()` when multi-server. Locally: `php artisan schedule:work`. |
| **Cache / sessions** | `database` for small apps; Redis for production scale. Cache keys include the tenant id. `Cache::lock` works for MySQL-backed cache but is slower than Redis. |

### Laravel Horizon (Redis queues, Linux/WSL only)

```bash
composer require laravel/horizon
php artisan horizon:install
php artisan horizon          # run under Supervisor in production
php artisan horizon:terminate   # on every deploy
```

Authorize the dashboard in `HorizonServiceProvider::gate()`. Tag jobs per tenant (`tags()` returns `['company:'.$id]`) for filtering. Tune supervisors and `balance` in `config/horizon.php`. Not available on native Windows.

---

## 5. Authentication and authorization packages

| Package | Use when | Setup notes |
|---|---|---|
| **Laravel starter kit (Vue + Inertia)** | New Inertia + Vue app | Use the official kit for new projects. Never install a starter kit into an existing app. |
| **Sanctum** | API tokens, mobile app, or SPA cookie auth. Not needed for a pure Inertia web app. | `php artisan install:api`; add `HasApiTokens` to User; set `SANCTUM_STATEFUL_DOMAINS`; use abilities; test 401/403 paths. |
| **Fortify** | Headless auth backend (login, register, 2FA, reset) | Pair with Inertia pages. Enable only the features needed. |
| **Passport** | You must be an OAuth2 server for third-party clients | Heavier than Sanctum; justify in an AD-n. |
| **Socialite** | "Sign in with Google/Facebook/GitHub" | `composer require laravel/socialite`; keys in `config/services.php`; table `social_accounts` (provider, provider_user_id, user_id); decide account-linking rules in the Brief; community providers via SocialiteProviders. |
| **spatie/laravel-permission** | Roles and permissions | `composer require spatie/laravel-permission`; publish and edit the migration **before** migrating: UUID users need `model_id` as uuid; for multi-company set `'teams' => true` and `team_foreign_key` to `company_id`, then call `setPermissionsTeamId($companyId)` in a middleware on every request and in every job that checks permissions. Reset the permission cache in seeders/tests. Back it with Policies; never check permission names inline in controllers. **For admin side + client side, super admin, and per-company roles follow `docs/ai/ACCESS.md`.** |
| **Laravel policies/gates** | Always | One policy per tenant-owned model; policies check tenant ownership **and** permission. |

---

## 6. Frontend and Inertia packages

| Package | Use when | Notes |
|---|---|---|
| **Inertia** (`inertiajs/inertia-laravel`, `@inertiajs/vue3`) | Default | Props are visible in the page source: share only what the page needs; never share secrets or whole models. |
| **Inertia SSR** | Public pages that need SEO (landing, pricing, blog) | `php artisan inertia:start-ssr` (Node process; add to deploy/process list). **Default for public pages is plain Blade (TEAM.md Section 8.1).** Use SSR only if public pages must live inside the SPA; record an AD-n. |
| **Precognition** (`laravel-precognition-vue-inertia`) | Live validation using the **same Form Request** rules | Add `HandlePrecognitiveRequests` middleware to the routes; keeps one source of validation truth. |
| **Wayfinder** (`laravel/wayfinder`, `@laravel/vite-plugin-wayfinder`) **or Ziggy** (`tightenco/ziggy`) | Typed/named routes in TypeScript | Choose one (match the project). With Wayfinder, route files still use fully qualified controller references. |
| **Tailwind CSS** | Default | Match the installed major version; use the project's design tokens. |
| **@vueuse/core** | Common composables (debounce, storage, media queries) | Prefer over hand-rolled helpers. |
| **Pinia** | Only for real cross-page client state | Not for server data (Inertia props are the source). |
| **vue-i18n** | Multiple UI languages | Keep keys in English; server messages through Laravel lang files. |
| **TanStack Table / Chart.js / ApexCharts** | Data grids and charts | Server-side pagination/sorting/filtering for large data. |
| **shadcn-vue / reka-ui / Headless UI, lucide-vue-next** | Accessible primitives and icons | Reuse the project's existing component set. |
| **Vitest + @vue/test-utils + jsdom** | Component and composable unit tests | Browser journeys belong to Playwright. |
| **ESLint, Prettier, `vue-tsc --noEmit`** | Static checks | Run in CI. |

---

## 7. Tenancy, audit, data, files

| Package | Use when | Setup notes |
|---|---|---|
| **Single-database tenancy (default)** | Company/organization scoping | `company_id` on tenant-owned tables, a global scope or explicit scoped queries, policies, tenant-aware cache keys and storage paths (TEAM.md Section 12). |
| **spatie/laravel-multitenancy / stancl/tenancy** | Only if a database per tenant is truly required | Large architectural decision (AD-n); complicates migrations, queues, tests, and Reverb channels. Not the default. |
| **spatie/laravel-activitylog** | Audit trail of who changed what | `LogsActivity` + `getActivitylogOptions()` (log only needed attributes, `logOnlyDirty`); record `company_id` in properties; avoid logging secrets/PII; for critical operations log explicitly from the Service. |
| **owen-it/laravel-auditing** | Alternative audit trail with old/new values per model | Choose one audit package, not both. |
| **Laravel Scout** | Search beyond SQL | `composer require laravel/scout`, publish config. `SCOUT_DRIVER=database` for small data (MySQL), Meilisearch/Typesense/Algolia for scale. Index with `toSearchableArray()`; set `SCOUT_QUEUE=true`; **filter every search by tenant** (`where('company_id', ...)` plus filterable attribute in Meilisearch/Typesense). |
| **spatie/laravel-medialibrary** | File uploads with conversions | Publish and run migration (UUID support: check the `uuid` column and morph key type); private disk + temporary URLs for tenant files; custom `PathGenerator` including the company id; queue conversions; enforce mime/size in Form Requests. |
| **spatie/laravel-query-builder** | Filter/sort/include query-string APIs | Allow-list filters and sorts; always add tenant scope first. |
| **spatie/laravel-data** | Typed DTOs | Only if it simplifies the Service layer; do not mix with Resources without a clear rule. |
| **maatwebsite/excel** | Import/export spreadsheets | Use `WithChunkReading` and queued exports for large files; validate imported rows; needs `zip` and `gd` extensions. |
| **barryvdh/laravel-dompdf** or **spatie/laravel-pdf** | PDF output (payslips, invoices) | DomPDF needs no browser; spatie/laravel-pdf needs Chromium/Browsershot. |
| **spatie/laravel-backup** | Scheduled DB + file backups | Set the MySQL `dump_binary_path` (Section 2); schedule `backup:run`; test a restore. |
| **spatie/laravel-health** | Health checks (DB, queue, schedule, disk) | Expose behind auth or a secret; wire to uptime monitoring. |
| **spatie/laravel-settings / spatie/laravel-translatable / spatie/laravel-sluggable** | Typed settings / translated fields / slugs | Only when the requirement exists. |

---

## 8. Billing and payments

- **Laravel Cashier** (Stripe: `laravel/cashier`; Paddle: `laravel/cashier-paddle`) for subscriptions. For B2B SaaS put `Billable` on the **company/tenant** model, not the user. Publish/run migrations (check UUID key types), route webhooks outside CSRF, verify signatures, make webhook handlers idempotent, and keep plan limits in a Service.
- **Check payment provider availability for the target market before choosing** (some providers do not support every country). If the market needs a local gateway, evaluate the provider's official SDK or a maintained package through the Intake Checklist; often a small `PaymentGateway` Service + webhook controller is safer than an unmaintained package.
- Credits/usage billing: store an append-only ledger (`credit_transactions`), never just a mutable balance; update balance and ledger in one transaction with `lockForUpdate`; money as decimal or integer minor units (TEAM.md Section 15). Always at least size L.

---

## 9. Observability and debugging

| Package | Environment | Notes |
|---|---|---|
| **Laravel Telescope** | Local/staging only | `composer require laravel/telescope --dev`; if enabled outside local, gate it; prune entries; never in production with real user data unless locked down. |
| **Laravel Pulse** | Production-friendly performance dashboard | `composer require laravel/pulse`, publish and migrate; authorize the dashboard; use Redis ingest at high traffic. |
| **Laravel Nightwatch** | Hosted monitoring (optional) | Evaluate with the Intake Checklist (cost, data sent). |
| **sentry/sentry-laravel** (+ `@sentry/vue`) | Production error tracking | Scrub PII; tag `company_id`; upload source maps. |
| **barryvdh/laravel-debugbar** | Local only (`--dev`) | Use it to spot N+1; never enabled in production. |
| **Laravel Pail** | Local tail of logs | Needs `pcntl`: Linux/WSL; on Windows use `Get-Content storage/logs/laravel.log -Wait`. |
| **Laravel Boost** (`laravel/boost`, dev) | AI-agent helper (MCP server, docs search, guidelines) | `composer require laravel/boost --dev` then `php artisan boost:install`. It writes its own guideline files for AI tools: **merge, do not overwrite** `AGENTS.md`/`CLAUDE.md`; keep this team's rules first. |

---

## 10. Quality tooling (always on)

```bash
composer require pestphp/pest pestphp/pest-plugin-laravel --dev --with-all-dependencies
./vendor/bin/pest --init
composer require laravel/pint --dev                  # included by default in new apps
composer require larastan/larastan --dev            # create phpstan.neon (level 5 to start, raise over time)
npm install --save-dev @playwright/test              # see docs/ai/PLAYWRIGHT.md
```

Run in CI: `pint --test`, `phpstan analyse`, `pest --parallel`, `vue-tsc --noEmit`, ESLint, `npm run build`, Playwright.

**Architecture tests (Pest `arch`) enforce this team's rules automatically** (adjust namespaces to the project):

```php
// tests/Arch/ArchitectureTest.php
arch('controllers hold no persistence logic')
    ->expect('App\Http\Controllers')->not->toUse([\Illuminate\Support\Facades\DB::class]);

arch('services do not depend on the HTTP layer')
    ->expect('App\Services')->not->toUse([\Illuminate\Http\Request::class, 'App\Http\Controllers']);

arch('no debugging leftovers')
    ->expect(['dd', 'dump', 'ray', 'var_dump'])->not->toBeUsed();

arch('models extend Eloquent')
    ->expect('App\Models')->toExtend(\Illuminate\Database\Eloquent\Model::class);
```

Optional: `rector/rector` for safe automated upgrades (run in refactor mode only), `pestphp/pest-plugin-type-coverage`.

---

## 11. Feature flags, experiments, performance

- **Laravel Pennant** (`composer require laravel/pennant`, publish and migrate; the `features` table works on MySQL): gradual rollouts, per-plan features, A/B tests for marketing experiments. For tenant-level flags use `Feature::for($company)`; define features in a provider; test both states.
- **Laravel Octane**: Linux production only, and **only after profiling shows a need**. Long-lived workers keep state between requests: audit singletons, static properties, and any "current tenant" context for leaks. Not on native Windows.
- **Response caching / HTTP caching**: `spatie/laravel-responsecache` for public marketing pages only (never for authenticated tenant data).
- **Redis**: required for Horizon, Reverb scaling, fast cache/locks.

---

## 12. Mail, notifications, SMS

- Mail: built-in transports for SES, Postmark, Mailgun (and Resend through its vendor package). Local: Mailpit. Production deliverability (SPF, DKIM, DMARC) goes in the release checklist.
- Notifications: queue them (`ShouldQueue`); respect user preferences; one class per lifecycle message (the Marketing Strategist's list, `docs/ai/STRATEGY.md`).
- SMS/push/chat channels: first-party `laravel/vonage-notification-channel`, or `laravel-notification-channels/*` packages after the Intake Checklist.

---

## 13. Dev environment and browser testing

- **Sail** (Docker) is optional; if the project uses Laragon or another local stack, do not add Sail.
- **Dusk is not used.** Browser testing standard is **Playwright** (`docs/ai/PLAYWRIGHT.md`).
- Node: use the version in `.nvmrc`/`engines`; commit lockfiles.

---

## 14. Quick decision table

| Requirement | Default choice | Install when |
|---|---|---|
| WebSockets / live updates | Reverb + Echo | A BR needs live updates |
| Background work | Database queue; Redis + Horizon at scale | Always queue; Horizon when volume demands (Linux only) |
| API for mobile/third parties | Sanctum | An API consumer exists |
| Roles/permissions | spatie/laravel-permission (+ policies) | More than one role |
| Audit trail | activitylog | Compliance or "who changed this" |
| Search | Scout (database driver first) | List search beyond simple filters |
| File uploads | medialibrary | Uploads with conversions/organization |
| Subscriptions | Cashier | Recurring billing on a supported provider |
| Feature flags / A/B | Pennant | Gradual rollout or experiments |
| Monitoring | Pulse + Sentry | Production |
| Local debugging | Debugbar, Telescope | Local only |
| Static analysis / style | Larastan, Pint | Always |
| Tests | Pest + Playwright | Always |
| Typed routes in TS | Wayfinder or Ziggy (one) | Frontend needs route helpers |
| Live validation | Precognition | Forms where Form Request rules should drive the UI |

---

## 15. Setup block template (use for any package not listed)

Add this to the Team Brief (Packages) for every package:

```text
PACKAGE:        vendor/name  (version)
WHY:            BR-/AC- ids it satisfies; why not first-party or custom
INSTALL:        exact commands
CONFIG:         files changed, published assets, migrations (check UUID + MySQL)
ENV KEYS:       new keys with example values (added to .env.example)
PROCESSES:      queue worker / scheduler / Reverb / SSR / Horizon needed?
TENANCY:        how tenant isolation is preserved
SECURITY:       exposed routes/dashboards and how they are authorized
TESTS:          feature tests + Playwright coverage; fakes/sandboxes for external APIs
ROLLBACK:       how to remove it and what data it leaves
STATUS:         Implemented / Tested / Verified / Not Tested
```
