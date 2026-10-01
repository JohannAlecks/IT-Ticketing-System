// Bounded current-browser compatibility, not a rerun of the 324-state audit.
const { test, expect, signIn } = require('../fixtures.cjs');
const { audit, finish, theme } = require('../a11y.cjs');
require('./accessibility.keyboard.cjs');

for (const appearance of ['light', 'dark']) {
  test(`compatibility authenticated Summary, notifications and profile ${appearance} @mobile`, async ({ fx }, info) => {
    const user = await fx.account('ADMIN'); await fx.notices(user, 1);
    const page = await (await fx.context()).newPage(); await theme(page, appearance);
    await signIn(page, user); const rows = [];
    await expect(page.getByRole('heading', { name: 'System Summary', exact: true })).toBeVisible();
    await audit(page, `compatibility:${appearance}:/dashboard`, rows);
    const bell = page.getByRole('button', { name: 'Notifications, 1 unread', exact: true });
    await bell.click();
    await expect(page.getByRole('dialog', { name: 'Recent notifications', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all read', exact: true })).toBeFocused();
    await audit(page, `compatibility:${appearance}:notification-dropdown`, rows);
    await page.keyboard.press('Escape'); await expect(bell).toBeFocused();
    await page.goto('/settings?section=profile');
    await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeVisible();
    await audit(page, `compatibility:${appearance}:profile`, rows);
    finish(rows, info);
  });
}
