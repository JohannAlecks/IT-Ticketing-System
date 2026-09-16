const { test, expect, signIn, signOut } = require('../fixtures.cjs');
test('same-tab account switch clears notification, search and report caches without a stale flash', async ({ fx }) => {
  const user = await fx.account('AGENT'); const other = await fx.account('AGENT');
  const page = await (await fx.context()).newPage();
  const oldTicket = await fx.ticket(user, { assignedToId: user.id });
  const newTicket = await fx.ticket(other, { assignedToId: other.id }); await fx.notices(user, 1);
  // Prepare unread state before login's initial query; do not depend on a later
  // background poll to discover a fixture inserted after that query completed.
  await signIn(page, user);
  await page.getByRole('link', { name: 'My Reports', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Detailed report tickets' }).getByRole('link', { name: oldTicket.title, exact: true })).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Global search' }); await search.fill(fx.prefix);
  await expect(page.getByRole('option').filter({ hasText: oldTicket.title })).toBeVisible();
  await page.getByRole('button', { name: 'View all results', exact: true }).click();
  await expect(page.getByRole('link', { name: new RegExp(oldTicket.title) })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications, 1 unread', exact: true }).click();
  await page.getByRole('link', { name: 'View all notifications' }).click();
  await expect(page.getByText(fx.prefix + ' Notice 0', { exact: true })).toBeVisible();
  await signOut(page, user);
  await page.evaluate((forbidden) => {
    window.__e2eCacheLeak = false;
    const check = () => { if (forbidden.some((text) => document.body.innerText.includes(text))) window.__e2eCacheLeak = true; };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true }); check();
  }, [oldTicket.title, fx.prefix + ' Notice 0']);
  // No page.goto/reload here: preserve the same document and query client.
  await page.getByLabel('Email', { exact: true }).fill(other.email);
  await page.getByLabel('Password', { exact: true }).fill(other.credential);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Notifications, 0 unread', exact: true }).click();
  await expect(page.getByText('You’re all caught up.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View all notifications' }).click();
  await expect(page.getByText(fx.prefix + ' Notice 0', { exact: true })).toHaveCount(0);
  await search.fill(fx.prefix); await expect(page.getByRole('option').filter({ hasText: newTicket.title })).toBeVisible();
  await expect(page.getByRole('option').filter({ hasText: oldTicket.title })).toHaveCount(0);
  await page.getByRole('button', { name: 'View all results', exact: true }).click();
  await expect(page.getByRole('link', { name: new RegExp(newTicket.title) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(oldTicket.title) })).toHaveCount(0);
  await page.getByRole('link', { name: 'My Reports', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Detailed report tickets' }).getByRole('link', { name: newTicket.title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: oldTicket.title, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__e2eCacheLeak)).toBe(false);
});
test('login validation, protected redirects and logout @smoke @mobile', async ({ fx }) => {
  const ctx = await fx.context(); const page = await ctx.newPage(); const user = await fx.account();
  await page.goto('/tickets'); await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-wrong!123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
  // The protected redirect intentionally preserves /tickets as the destination.
  await page.getByLabel('Password', { exact: true }).fill(user.credential);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/tickets$/); await signOut(page, user);
  await page.goto('/users'); await expect(page).toHaveURL(/\/login$/);
});
test('inactive and unverified accounts cannot authenticate; registration reports disabled email honestly', async ({ fx }) => {
  const ctx = await fx.context(); const page = await ctx.newPage();
  for (const [extra, message] of [[{ isActive: false }, 'Invalid email or password'], [{ emailVerified: false }, 'Please verify your email address before logging in.']]) {
    const user = await fx.account('USER', extra); await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(user.email); await page.getByLabel('Password', { exact: true }).fill(user.credential);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByText(message, { exact: true })).toBeVisible();
  }
  await page.goto('/register'); await page.getByLabel('Full name').fill(fx.prefix + ' Registered');
  await page.getByLabel('Email', { exact: true }).fill(fx.prefix + '-registered@example.test');
  await page.getByLabel('Password', { exact: true }).fill(fx.credential);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Email delivery is unavailable' })).toBeVisible();
  await page.goto('/tickets'); await expect(page).toHaveURL(/\/login$/);
});
test('real delayed role-refresh response cannot restore an old session after logout/account switch', async ({ fx }) => {
  const { page, user } = await fx.actor(); const other = await fx.account(); const ticket = await fx.ticket(user);
  await page.goto('/tickets'); await expect(page.getByRole('row', { name: 'Open ' + ticket.title, exact: true })).toBeVisible();
  let release, arrived; const gate = new Promise((r) => { release = r; }); const ready = new Promise((r) => { arrived = r; });
  await page.route('**/api/auth/me', async (route) => { const response = await route.fetch(); arrived(); await gate; await route.fulfill({ response }).catch(() => {}); }, { times: 1 });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await ready;
    await signOut(page, user);
    await page.evaluate((forbidden) => {
      window.__e2eLeak = false; const check = () => { if (document.body.innerText.includes(forbidden)) window.__e2eLeak = true; };
      new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true }); check();
    }, ticket.title);
    await page.getByLabel('Email', { exact: true }).fill(other.email);
    await page.getByLabel('Password', { exact: true }).fill(other.credential);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    release(); await page.getByRole('link', { name: 'My Tickets', exact: true }).click(); await expect(page.getByRole('row', { name: 'Open ' + ticket.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole('banner')).toContainText(other.name);
    expect(await page.evaluate(() => window.__e2eLeak)).toBe(false);
  } finally { release(); }
});
