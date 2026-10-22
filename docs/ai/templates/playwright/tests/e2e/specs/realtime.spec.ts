import { expect, test } from '@playwright/test';
import { USERS } from '../support/users';

// Requires BROADCAST_CONNECTION=reverb in .env.e2e (the config then starts Reverb) and QUEUE_CONNECTION=sync.
test('AC-12: a status change in one browser appears live in another', async ({ browser }) => {
  const watcher = await browser.newContext({ storageState: USERS.staffA.file });
  const actor = await browser.newContext({ storageState: USERS.adminA.file });
  const watcherPage = await watcher.newPage();
  const actorPage = await actor.newPage();

  // Wait until the private channel is authorized, so the event cannot be missed.
  const channelAuthorized = watcherPage.waitForResponse(
    (r) => r.url().includes('/broadcasting/auth') && r.status() === 200,
  );
  await watcherPage.goto('/orders');                                   // ADAPT route
  await channelAuthorized;

  await actorPage.goto('/orders');
  await actorPage.getByRole('row', { name: /ORD-A-0001/ }).getByRole('button', { name: /approve/i }).click(); // ADAPT

  // No reload on the watcher: the update must arrive over the WebSocket.
  await expect(watcherPage.getByRole('row', { name: /ORD-A-0001/ })).toContainText(/approved/i, { timeout: 15_000 });

  await watcher.close();
  await actor.close();
});
