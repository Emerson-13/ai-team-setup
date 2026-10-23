import { expect, test } from '@playwright/test';
import { USERS } from '../support/users';

// Role x page matrix, derived from the role matrix in the Team Brief (docs/ai/ACCESS.md Section 3.2).
// ADAPT routes and expectations. One row per "yes" AND per "no": every "no" is a test.
type Expect = 'allow' | 'deny';

const MATRIX: { role: keyof typeof USERS; path: string; expect: Expect }[] = [
  // Client side
  { role: 'adminA', path: '/orders', expect: 'allow' },
  { role: 'staffA', path: '/orders', expect: 'allow' },
  { role: 'staffA', path: '/settings/roles', expect: 'deny' },          // staff cannot manage company roles
  { role: 'adminA', path: '/admin/companies', expect: 'deny' },         // client session must never reach admin side
  // Platform side
  { role: 'superAdmin', path: '/admin/companies', expect: 'allow' },
  { role: 'platformSupport', path: '/admin/companies', expect: 'allow' },
  { role: 'platformSupport', path: '/admin/roles', expect: 'deny' },    // support cannot manage roles
  { role: 'superAdmin', path: '/orders', expect: 'deny' },              // admin session is not a client user
];

for (const row of MATRIX) {
  test.describe(`${row.role} -> ${row.path}`, () => {
    test.use({ storageState: USERS[row.role].file });

    test(`AC-ACCESS: ${row.expect}`, async ({ page }) => {
      const response = await page.goto(row.path);
      const status = response?.status() ?? 0;
      const landedOnLogin = /login/.test(page.url());

      if (row.expect === 'allow') {
        expect(status).toBeLessThan(400);
        expect(landedOnLogin).toBe(false);
      } else {
        // Denied = 403/404, or redirect to a login/forbidden page. Never a 200 with the content.
        expect(status >= 400 || landedOnLogin).toBe(true);
      }
    });
  });
}

// Hidden buttons are cosmetic. Prove the server refuses the action too (ADAPT endpoint and payload).
test.describe('server refuses actions the UI hides', () => {
  test.use({ storageState: USERS.staffA.file });

  test('AC-ACCESS: staff cannot call a manager-only endpoint directly', async ({ request }) => {
    const res = await request.delete('/orders/some-existing-id', { headers: { Accept: 'application/json' } });
    expect([403, 404]).toContain(res.status());
  });
});
