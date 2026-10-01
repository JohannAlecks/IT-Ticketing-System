const { test, expect, signIn } = require('../fixtures.cjs');
const { audit, finish, theme } = require('../a11y.cjs');
require('./accessibility.keyboard.cjs');
for (const appearance of ['light', 'dark']) {
  test(`public pages ${appearance} @mobile`, async ({ fx }, info) => {
    test.setTimeout(240000); const page = await (await fx.context()).newPage(); await theme(page, appearance); const rows = [];
    for (const route of ['/login', '/register', '/check-email', '/verify-email', '/not-a-route']) { await page.goto(route); await audit(page, `public:${appearance}:${route}`, rows); }
    await page.goto('/register'); await page.getByLabel('Full name').fill(fx.prefix + ' Registered');
    await page.getByLabel('Email', { exact: true }).fill(fx.prefix + '-registered@example.test'); await page.getByLabel('Password', { exact: true }).fill(fx.credential);
    await page.getByRole('button', { name: 'Create account', exact: true }).click(); await expect(page).toHaveURL(/check-email$/);
    await audit(page, `public:${appearance}:disabled-email`, rows); finish(rows, info);
  });
  for (const role of ['USER', 'AGENT', 'ADMIN']) test(`${role} surfaces ${appearance} @mobile`, async ({ fx }, info) => {
    test.setTimeout(300000); const page = await (await fx.context()).newPage(); await theme(page, appearance); const user = await fx.account(role);
    const requester = role === 'USER' ? user : await fx.account();
    const ticket = await fx.ticket(requester, role === 'AGENT' ? { assignedToId: user.id } : {});
    const article = await fx.db.knowledgeArticle.create({ data: { authorId: user.id, title: fx.prefix + ' Accessible guidance', slug: fx.prefix + '-guide', summary: 'Synthetic support guidance.', content: 'Clear synthetic recovery instructions.', visibility: 'PUBLIC', status: 'PUBLISHED', publishedAt: new Date() } });
    await fx.notices(user, 1); await signIn(page, user); const rows = [];
    const routes = ['/dashboard', '/tickets', '/tickets/new', '/tickets/' + ticket.id, '/tickets/archived', '/notifications', '/knowledge', '/knowledge/' + article.slug, '/profile', '/get-started', '/search?q=synthetic',
      ...['profile', 'appearance', 'security', 'notifications', 'shortcuts'].map(s => '/settings?section=' + s),
      ...(role !== 'USER' ? ['/reports', '/knowledge/manage', '/knowledge/new'] : []),
      ...(role === 'AGENT' ? ['/my-tickets'] : []), ...(role === 'ADMIN' ? ['/users', '/departments', '/email-logs', '/audit-log', '/settings?section=sla', '/settings?section=application'] : [])];
    for (const route of routes) {
      await page.goto(route); await audit(page, `${role}:${appearance}:${route.replace(ticket.id, ':ticket').replace(article.slug, ':article')}`, rows);
    }
    await page.goto('/dashboard'); await page.getByRole('button', { name: 'Notifications, 1 unread', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Recent notifications' })).toBeVisible(); await audit(page, `${role}:${appearance}:bell-open`, rows); await page.keyboard.press('Escape');
    const search = page.getByRole('combobox', { name: 'Global search' }); await search.fill(fx.prefix);
    await expect(page.getByRole('option').first()).toBeVisible(); await audit(page, `${role}:${appearance}:search-open`, rows); await page.keyboard.press('Escape');
    if (role === 'ADMIN') {
      await page.goto('/users'); await page.getByRole('button', { name: 'Add User', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Add a user' })).toBeVisible(); await audit(page, `${role}:${appearance}:add-user-dialog`, rows); await page.keyboard.press('Escape');
      await page.goto('/departments'); await page.getByRole('button', { name: 'Create department', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible(); await audit(page, `${role}:${appearance}:department-dialog`, rows); await page.keyboard.press('Escape');
    }
    if (info.project.name.startsWith('mobile')) {
      await page.goto('/dashboard'); await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await audit(page, `${role}:${appearance}:mobile-nav-open`, rows);
      await page.goto('/settings?section=profile'); await page.setViewportSize({ width: 320, height: 800 });
      await audit(page, `${role}:${appearance}:320-profile`, rows);
    }
    finish(rows, info);
  });
}
