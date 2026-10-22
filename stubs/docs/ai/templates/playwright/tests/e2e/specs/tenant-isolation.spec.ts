import { expect, test } from '@playwright/test';
import { RECORDS, USERS } from '../support/users';

// Company A admin must never see Company B data, in the UI or the API (IDOR check).
test.use({ storageState: USERS.adminA.file });

test.describe('Tenant isolation', () => {
  test('AC-7: company A admin cannot open a company B record page', async ({ page }) => {
    const response = await page.goto(`/orders/${RECORDS.companyBOrderId}`);   // ADAPT route
    expect([403, 404]).toContain(response?.status());
    await expect(page.getByText(RECORDS.companyBOrderNumber)).toHaveCount(0);
  });

  test('AC-8: company A admin cannot read a company B record through the API', async ({ request }) => {
    const res = await request.get(`/orders/${RECORDS.companyBOrderId}`, {
      headers: { Accept: 'application/json' },
    });
    expect([403, 404]).toContain(res.status());
  });

  test('AC-9: company A list never contains company B rows', async ({ page }) => {
    await page.goto('/orders');
    await expect(page.getByText(RECORDS.companyBOrderNumber)).toHaveCount(0);
  });
});
