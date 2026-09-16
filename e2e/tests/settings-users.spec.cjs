const { test, expect, signIn, signOut, apiStatus } = require('../fixtures.cjs');
async function section(page, key, label) {
  if (page.viewportSize().width < 768) await page.getByLabel('Settings section', { exact: true }).selectOption(key);
  else await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: label, exact: true }).click();
}
test('profile save/discard, navigation warnings and appearance persist @smoke @mobile', async ({ fx }) => {
  const { page, user } = await fx.actor(); const dep = await fx.department('Profile');
  await page.goto('/settings?section=profile'); await page.getByLabel('Full name').fill(fx.prefix + ' Unsaved');
  await section(page, 'appearance', 'Appearance'); const dialog = page.getByRole('dialog', { name: 'Discard profile changes?' });
  await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click(); await expect(page.getByLabel('Full name')).toHaveValue(user.name);
  const name = fx.prefix + ' Saved'; await page.getByLabel('Full name').fill(name); await page.getByLabel('Department', { exact: true }).selectOption(dep.id);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click(); await expect(page.getByText('Profile saved. Your name and department are refreshed across this account.')).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
  await section(page, 'appearance', 'Appearance'); await expect(page).toHaveURL(/section=appearance/); await expect(dialog).toHaveCount(0);
  await page.getByRole('radio', { name: 'dark', exact: true }).check(); await page.reload(); await expect(page.getByRole('radio', { name: 'dark', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'light', exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (page.viewportSize().width < 768) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  }
});
test('password validation/visibility, wrong-current rejection and successful browser password change', async ({ fx }) => {
  const { page, user } = await fx.actor(); await page.goto('/settings?section=security');
  await page.getByLabel('Current password', { exact: true }).fill('Synthetic-wrong!123');
  await page.getByRole('button', { name: 'Show current password' }).click(); await expect(page.getByLabel('Current password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide current password' }).click();
  const next = fx.credential + 'Changed!'; await page.getByLabel('New password', { exact: true }).fill(next); await page.getByLabel('Confirm password', { exact: true }).fill('Mismatch');
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled();
  await page.getByLabel('Confirm password', { exact: true }).fill(next); await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByText('Password change failed. Check your current password and try again.')).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill(user.credential); await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByText('Password changed.', { exact: true })).toBeVisible(); await signOut(page, user); await signIn(page, { ...user, credential: next });
});
test('Admin directory filters, details, lifecycle confirmations and self-protection @mobile', async ({ fx }) => {
  const { page, user } = await fx.actor('ADMIN'); const target = await fx.account('AGENT'); await page.goto('/users');
  await expect(page.getByRole('region', { name: 'Account metrics' })).toBeVisible();
  await page.getByLabel('Search name or email').fill(target.email); await page.getByLabel('Sort accounts').selectOption('name');
  const actions = page.getByLabel('Actions for ' + target.name, { exact: true }).filter({ visible: true });
  // selectOption dispatches selection without focusing the control. Establish
  // the keyboard origin before asserting that the modal restores it.
  await actions.focus(); await expect(actions).toBeFocused();
  await actions.selectOption('details'); await expect(page.getByRole('dialog', { name: 'User details' })).toContainText(target.name); await page.keyboard.press('Escape');
  await expect(actions).toBeFocused();
  await actions.selectOption('role'); await page.getByLabel('Proposed role').selectOption('USER'); await page.getByRole('button', { name: 'Confirm role change' }).click();
  await expect.poll(async () => (await fx.db.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe('USER');
  await actions.selectOption('status'); await page.getByRole('button', { name: 'Deactivate account', exact: true }).click();
  await page.getByLabel('Account status', { exact: true }).selectOption('INACTIVE'); await actions.selectOption('status'); await page.getByRole('button', { name: 'Reactivate account', exact: true }).click();
  await expect.poll(async () => (await fx.db.user.findUniqueOrThrow({ where: { id: target.id } })).isActive).toBe(true);
  expect(await apiStatus(page, '/users/' + user.id + '/deactivate', 'PATCH', {})).toBe(403);
  expect(await apiStatus(page, '/users/' + user.id + '/role', 'PATCH', { role: 'USER' })).toBe(403);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('Admin pagination and role filters keep synthetic account ordering stable', async ({ fx }) => {
  const { page } = await fx.actor('ADMIN');
  for (let i = 0; i < 21; i++) await fx.account('USER', { name: `${fx.prefix} Directory ${String(i).padStart(2, '0')}` });
  await page.goto('/users'); await page.getByLabel('Search name or email').fill(fx.prefix);
  await page.getByLabel('Role filter').selectOption('USER'); await page.getByLabel('Sort accounts').selectOption('name');
  const pagination = page.getByRole('navigation', { name: 'User pagination' });
  await expect(pagination).toContainText('1–20 of 21 accounts');
  await expect(page.getByRole('table', { name: 'Admin account directory' }).getByRole('row')).toHaveCount(21);
  await pagination.getByRole('button', { name: 'Next', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(pagination).toContainText('21–21 of 21 accounts');
  await expect(page.getByRole('button', { name: `${fx.prefix} Directory 20`, exact: true })).toBeVisible();
  await pagination.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByRole('button', { name: `${fx.prefix} Directory 00`, exact: true })).toBeVisible();
});
