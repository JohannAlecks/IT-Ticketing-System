const { test, expect, apiStatus } = require('../fixtures.cjs');
test('role navigation, direct routes and Admin APIs use current authorization @smoke', async ({ fx }) => {
  for (const role of ['USER', 'AGENT', 'ADMIN']) {
    const { page } = await fx.actor(role);
    await expect(page.getByRole('complementary').getByRole('link', { name: 'Users', exact: true })).toHaveCount(role === 'ADMIN' ? 1 : 0);
    for (const route of ['/users/summary', '/departments', '/email-logs']) expect(await apiStatus(page, route)).toBe(role === 'ADMIN' ? 200 : 403);
    await page.goto('/users'); await expect(page).toHaveURL(role === 'ADMIN' ? /\/users$/ : /\/dashboard$/);
    await page.goto('/reports'); await expect(page).toHaveURL(role === 'USER' ? /\/dashboard$/ : /\/reports$/);
  }
});
test('requester ownership and Agent assignment restrictions are enforced by the real API and detail screen', async ({ fx }) => {
  const owner = await fx.actor('USER'); const agent = await fx.actor('AGENT'); const foreign = await fx.account('AGENT'); const other = await fx.account();
  const row = await fx.ticket(other, { assignedToId: foreign.id });
  for (const { page } of [owner, agent]) {
    await page.goto('/tickets/' + row.id);
    await expect(page.getByRole('heading', { name: /Ticket not found|don't have access/ })).toBeVisible();
    expect([403, 404]).toContain(await apiStatus(page, '/tickets/' + row.id));
    await expect(page.getByRole('heading', { name: row.title })).toHaveCount(0);
  }
});
