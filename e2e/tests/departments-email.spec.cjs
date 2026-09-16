const { test, expect } = require('../fixtures.cjs');
test('department creation/editing, inactive retention, active options and merge with affected members', async ({ fx }) => {
  const admin = await fx.actor('ADMIN'); const owner = await fx.actor(); const target = await fx.department('Target');
  const page = admin.page; const name = fx.prefix + ' Source'; await page.goto('/departments');
  await page.getByRole('button', { name: 'Create department', exact: true }).click(); await page.getByLabel('Department name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create department', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const row = await fx.db.department.findFirstOrThrow({ where: { name } });
  await owner.page.goto('/settings?section=profile'); await owner.page.getByLabel('Department', { exact: true }).selectOption(row.id);
  await owner.page.getByRole('button', { name: 'Save profile', exact: true }).click(); await expect(owner.page.getByText('Profile saved. Your name and department are refreshed across this account.')).toBeVisible();
  await page.reload(); await page.getByLabel('Actions for ' + name).selectOption('update'); await page.getByRole('dialog').getByLabel('Description', { exact: true }).fill('Synthetic updated department');
  await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) })).toContainText('Synthetic updated department');
  await page.getByLabel('Actions for ' + name).selectOption('status');
  await expect(page.getByRole('dialog')).toContainText(owner.user.name); await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await owner.page.reload(); await expect(owner.page.getByLabel('Department', { exact: true })).toHaveValue(row.id);
  await expect(owner.page.getByRole('option', { name: name + ' (inactive)', exact: true })).toHaveCount(1);
  await page.getByLabel('Department status').selectOption('ALL'); await page.getByLabel('Actions for ' + name).selectOption('merge');
  await page.getByLabel('Target department', { exact: true }).selectOption(target.id); await page.getByRole('button', { name: 'Confirm change' }).click();
  await expect.poll(async () => (await fx.db.user.findUniqueOrThrow({ where: { id: owner.user.id } })).departmentId).toBe(target.id);
  await owner.page.reload(); await expect(owner.page.getByLabel('Department', { exact: true })).toHaveValue(target.id);
});
test('Admin Email Logs show synthetic honest statuses, masked recipients and no delivery claim', async ({ fx }) => {
  const { page } = await fx.actor('ADMIN'); await fx.emailStates(); await page.goto('/email-logs');
  await expect(page.getByRole('heading', { name: 'Email delivery is disabled' })).toBeVisible();
  await expect(page.getByText('Masked operational metadata. Accepted does not mean delivered.')).toBeVisible();
  for (const status of ['DISABLED', 'UNKNOWN', 'ACCEPTED', 'FAILED']) {
    await page.getByRole('combobox', { name: 'Email status', exact: true }).selectOption(status);
    const table = page.getByRole('table', { name: 'Email submission outcomes; recipients are masked' });
    await expect(table.getByRole('row')).toHaveCount(2); await expect(table).toContainText('s***@e***.***');
    await expect(table).not.toContainText('synthetic@example.test');
  }
  expect(await page.getByRole('option', { name: /^Delivered$/i }).count()).toBe(0);
});
