// Must match database/seeders/E2ESeeder.php. Adapt emails, ids, and routes to the project.
export const PASSWORD = 'password';

export const USERS = {
  adminA: { email: 'admin.a@e2e.test', file: 'playwright/.auth/admin-a.json' },
  staffA: { email: 'staff.a@e2e.test', file: 'playwright/.auth/staff-a.json' },
  adminB: { email: 'admin.b@e2e.test', file: 'playwright/.auth/admin-b.json' },
} as const;

export const NO_AUTH = { cookies: [], origins: [] };

// Fixed ids/numbers created by the seeder, used by cross-tenant tests.
export const RECORDS = {
  companyBOrderId: '00000000-0000-7000-8000-0000000000b1',
  companyBOrderNumber: 'ORD-B-0001',
};
