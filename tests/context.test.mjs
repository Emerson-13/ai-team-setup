import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { project, context, hasPhp } from './helpers.mjs';

test('context: builds a compact map from a Laravel project', () => {
  const d = project({ fixture: true }); const r = context(d, ['--print']);
  assert.match(r.out, /laravel \^12/); assert.match(r.out, /spatie-permission/); assert.match(r.out, /phpunit db: mysql/);
  assert.match(r.out, /bookings\(company_id:fk, customer_id:fk, starts_at:dt, status:enum, meta:json, notes:text\) \+softdeletes/); // create + alter merged
  assert.match(r.out, /Booking \[bookings\] \| belongsTo\(Company\) \| uses SoftDeletes \| scopes upcoming/);
  assert.match(r.out, /Company \| hasMany\(Booking\)/);
  assert.match(r.out, /RESOURCE \/bookings -> BookingController/); assert.match(r.out, /POST \/bookings\/\{booking\}\/cancel -> BookingController@cancel/);
  assert.match(r.out, /BookingPolicy: viewAny,view,update/); assert.match(r.out, /controllers: BookingController\(index,store\)/); // private methods are not listed
  assert.match(r.out, /inertia pages \(2\): Bookings\/Index, Dashboard/); assert.match(r.out, /playwright \(1\): smoke/);
});

test('context: fresh on the second run, rebuilt after a change', () => {
  const d = project({ fixture: true });
  assert.match(context(d).out, /context built/); assert.match(context(d).out, /context fresh/);
  writeFileSync(join(d, 'app/Models/Extra.php'), '<?php\nclass Extra {}\n');
  assert.match(context(d).out, /context built/);
});

test('context: --find and --section print only what was asked', () => {
  const d = project({ fixture: true });
  const f = context(d, ['--find', 'booking']).out; assert.ok(f.split('\n').every((l) => /^\[\w+\]/.test(l) || !l)); assert.ok(f.length < 1500);
  assert.match(context(d, ['--section', 'tables']).out, /^## tables/); assert.doesNotMatch(context(d, ['--section', 'tables']).out, /## models/);
  assert.match(context(d, ['--find', 'zzz-not-there']).out, /no match/); assert.match(context(d, ['--section', 'nope']).out, /Sections: stack, tables/);
});

test('context: respects the token budget on a large project', () => {
  const d = project({ fixture: true });
  for (let i = 0; i < 250; i++) {
    writeFileSync(join(d, `app/Models/Thing${i}.php`), `<?php\nclass Thing${i} extends Model {\n public function owner() { return $this->belongsTo(Company::class); }\n}\n`);
    writeFileSync(join(d, `database/migrations/2026_03_01_${String(i).padStart(6, '0')}_create_thing${i}_table.php`), `<?php\nSchema::create('thing${i}', function (Blueprint $table) {\n $table->id();\n $table->string('name');\n $table->timestamps();\n});\n`);
  }
  const r = context(d, ['--print', '--max-tokens', '2000']); assert.ok(r.out.length <= 2000 * 4 + 800, `too big: ${r.out.length}`);
  assert.match(r.out, /showing \d+ of \d+\]/); assert.match(r.out, /\+\d+ more: npm run ai:context/);
});

test('context: uses php artisan route:list when the app can boot', { skip: !hasPhp && 'php not installed' }, () => {
  const d = project({ fixture: true });
  mkdirSync(join(d, 'vendor'), { recursive: true }); writeFileSync(join(d, 'vendor/autoload.php'), '<?php\n');
  writeFileSync(join(d, 'artisan'), `<?php
echo json_encode([['domain'=>null,'method'=>'GET|HEAD','uri'=>'api/v1/bookings','name'=>'b.index','action'=>'App\\\\Http\\\\Controllers\\\\BookingController@index','middleware'=>['api','App\\\\Http\\\\Middleware\\\\Authenticate','throttle:60,1']]]);
`);
  const r = context(d, ['--print']).out; assert.match(r, /routes \(php artisan route:list\)/); assert.match(r, /GET \/api\/v1\/bookings -> BookingController@index \[Authenticate,throttle:60,1\]/);
  assert.match(context(d, ['--print', '--no-artisan', '--rebuild']).out, /static scan/);
});
