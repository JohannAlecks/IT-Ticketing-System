const { test, expect, signIn } = require('../fixtures.cjs');
const { audit, finish, theme } = require('../a11y.cjs');

async function visibleFocus(locator) {
  await expect(locator).toBeFocused();
  // Navigation panels animate for 200ms; verify the final focused geometry,
  // not a single intermediate offscreen animation frame. No fixed sleeps.
  await expect.poll(() => locator.evaluate(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 &&
      r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }), { timeout: 2000 }).toBe(true);
}
async function containedTabs(page, dialog, count) {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
}

test('keyboard public skip link, form order and server-error focus @mobile', async ({ fx }, info) => {
  const page = await (await fx.context()).newPage(); await theme(page, 'light'); const rows = [];
  await page.goto('/login'); await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
  await visibleFocus(skip); await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab'); await visibleFocus(page.getByLabel('Email', { exact: true }));
  await page.keyboard.press('Tab'); await visibleFocus(page.getByLabel('Password', { exact: true }));
  await page.keyboard.press('Tab'); await visibleFocus(page.getByRole('button', { name: 'Sign in', exact: true }));
  await page.getByRole('link', { name: 'Create one', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused(); await expect(page).toHaveTitle('Create account | HelpDesk');
  await page.getByLabel('Full name', { exact: true }).fill(fx.prefix + ' Validation');
  await page.getByLabel('Email', { exact: true }).fill(fx.prefix + '-validation@example.test');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account', exact: true }).focus(); await page.keyboard.press('Enter');
  const summary = page.getByLabel('Please correct the form errors', { exact: true });
  await expect(summary).toBeFocused();
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAccessibleDescription(/at least 8 characters/);
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await expect(password).toBeFocused();
  await audit(page, 'keyboard:public:validation', rows); finish(rows, info);
});

test('keyboard modal containment, menus, mobile navigation and dark reflow @mobile', async ({ fx }, info) => {
  const page = await (await fx.context()).newPage(); await theme(page, 'dark'); const user = await fx.account('ADMIN');
  await fx.notices(user, 1); await signIn(page, user); const rows = [];
  if (info.project.name.startsWith('mobile')) {
    const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Workspace navigation', exact: true });
    await visibleFocus(dialog.getByRole('button', { name: 'Close navigation', exact: true }));
    await containedTabs(page, dialog, 22);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    expect(await page.locator('[data-workspace-navigation]').evaluate(el => el.inert)).toBe(true);
  }
  await page.goto('/users'); const add = page.getByRole('button', { name: 'Add User', exact: true });
  await add.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Add a user', exact: true });
  await visibleFocus(dialog.getByRole('button', { name: 'Close Add a user', exact: true }));
  await containedTabs(page, dialog, 12); await audit(page, 'keyboard:admin:dialog', rows);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(add).toBeFocused();
  const menu = page.getByRole('button', { name: /^Account menu/ }); await menu.focus(); await page.keyboard.press('Enter');
  await visibleFocus(page.getByRole('button', { name: 'Log out', exact: true }));
  await page.keyboard.press('Escape'); await expect(menu).toBeFocused(); await expect(menu).toHaveAttribute('aria-expanded', 'false');
  const bell = page.getByRole('button', { name: 'Notifications, 1 unread', exact: true });
  await bell.focus(); await page.keyboard.press('Enter');
  await visibleFocus(page.getByRole('button', { name: 'Mark all read', exact: true }));
  await page.keyboard.press('Escape'); await expect(bell).toBeFocused();
  await page.goto('/settings?section=profile'); await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.getByRole('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.getByRole('button', { name: 'Save profile' }).evaluate(el => parseFloat(getComputedStyle(el).transitionDuration) < 0.01)).toBe(true);
  await audit(page, 'keyboard:admin:320-reduced-motion', rows); finish(rows, info);
});

test('keyboard search, notification tabs, native ticket navigation and sorting @mobile', async ({ fx }, info) => {
  const user = await fx.account(); const ticket = await fx.ticket(user); await fx.notices(user, 1);
  const page = await (await fx.context()).newPage(); await theme(page, 'light'); await signIn(page, user); const rows = [];
  const search = page.getByRole('combobox', { name: 'Global search' }); await search.focus(); await search.fill(fx.prefix);
  await expect(page.getByRole('option').first()).toBeVisible(); await page.keyboard.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Escape'); await expect(search).toBeFocused(); await expect(search).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/notifications'); const all = page.getByRole('tab', { name: 'All', exact: true }); await all.focus();
  await page.keyboard.press('ArrowRight'); const unread = page.getByRole('tab', { name: 'Unread', exact: true });
  await expect(unread).toBeFocused(); await expect(unread).toHaveAttribute('aria-selected', 'true'); await expect(all).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Home'); await expect(all).toBeFocused(); await expect(all).toHaveAttribute('aria-selected', 'true');
  await audit(page, 'keyboard:user:notification-tabs', rows);
  await page.goto('/tickets'); const sort = page.getByRole('button', { name: 'Sort by Title', exact: true }); await sort.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('columnheader').filter({ has: sort })).toHaveAttribute('aria-sort', 'ascending');
  await page.keyboard.press('Enter'); await expect(page.getByRole('columnheader').filter({ has: sort })).toHaveAttribute('aria-sort', 'descending');
  const link = page.getByRole('link', { name: ticket.title, exact: true }); await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused(); await expect(page).toHaveTitle('Ticket details | HelpDesk');
  await audit(page, 'keyboard:user:ticket-detail', rows);
  await page.goto('/tickets'); const saveView = page.getByRole('button', { name: 'Save current view', exact: true });
  // Keyboard activation must start on an enabled, focused control; unlike
  // click(), focus() does not wait for the saved-view request to finish.
  await expect(saveView).toBeEnabled(); await saveView.focus(); await visibleFocus(saveView); await page.keyboard.press('Enter');
  await expect(page.getByLabel('View name', { exact: true })).toBeFocused();
  await page.getByLabel('View name', { exact: true }).fill(fx.prefix + ' Accessible view');
  await page.getByRole('button', { name: 'Save view name', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/saved-views\//);
  const remove = page.getByRole('button', { name: 'Delete view', exact: true }); await remove.focus(); await page.keyboard.press('Enter');
  const confirmation = page.getByRole('alertdialog', { name: 'Delete saved view confirmation', exact: true });
  await visibleFocus(confirmation.getByRole('button', { name: 'Close Delete saved view confirmation', exact: true }));
  await containedTabs(page, confirmation, 5); await audit(page, 'keyboard:user:delete-view-dialog', rows);
  await page.keyboard.press('Escape'); await expect(confirmation).toHaveCount(0); await expect(remove).toBeFocused();
  finish(rows, info);
});
