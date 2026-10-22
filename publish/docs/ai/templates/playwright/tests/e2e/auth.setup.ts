import { expect, test as setup } from '@playwright/test';
import { NO_AUTH, PASSWORD, USERS } from './support/users';

setup.use({ storageState: NO_AUTH });

// Log in once per role through the real UI and save the session for the other specs.
for (const [role, user] of Object.entries(USERS)) {
  setup(`authenticate ${role}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);          // ADAPT labels to the app's login form
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/dashboard/);                // ADAPT landing route
    await page.context().storageState({ path: user.file });
  });
}
