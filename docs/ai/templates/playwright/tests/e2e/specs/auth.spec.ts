import { expect, test } from '@playwright/test';
import { NO_AUTH, PASSWORD, USERS } from '../support/users';

test.use({ storageState: NO_AUTH });

test.describe('Authentication', () => {
  test('AC-1: valid credentials reach the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.adminA.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('AC-2: wrong password shows an error and stays on login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.adminA.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: /log in|sign in/i }).click();
    await expect(page.getByText(/credentials|do not match|invalid/i)).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test('AC-3: guests are redirected to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });
});
