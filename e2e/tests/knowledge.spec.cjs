const { test, expect, apiStatus } = require('../fixtures.cjs');
test('published internal knowledge stays private in API, search and a downgraded session', async ({ fx }) => {
  const staff = await fx.actor('AGENT'); const reader = await fx.actor();
  const create = (visibility) => fx.db.knowledgeArticle.create({ data: {
    title: `${fx.prefix} ${visibility} recovery`, slug: `${fx.prefix}-${visibility.toLowerCase()}`,
    summary: 'Synthetic authorization fixture', content: `${fx.prefix} ${visibility} body`,
    visibility, status: 'PUBLISHED', publishedAt: new Date(), authorId: staff.user.id,
  } });
  const internal = await create('INTERNAL'); const publicArticle = await create('PUBLIC');
  expect(await apiStatus(staff.page, '/knowledge/' + internal.slug)).toBe(200);
  expect(await apiStatus(reader.page, '/knowledge/' + internal.slug)).toBe(404);
  expect(await apiStatus(reader.page, '/knowledge/' + internal.id + '/feedback', 'PUT', { helpful: true })).toBe(404);
  expect(await fx.db.articleFeedback.count({ where: { articleId: internal.id } })).toBe(0);
  await reader.page.goto('/knowledge'); await reader.page.getByLabel('Search knowledge').fill(fx.prefix);
  await reader.page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(reader.page.getByRole('link', { name: publicArticle.title, exact: true })).toBeVisible();
  await expect(reader.page.getByRole('link', { name: internal.title, exact: true })).toHaveCount(0);
  await reader.page.goto('/search?q=' + encodeURIComponent(fx.prefix));
  await expect(reader.page.getByRole('link', { name: new RegExp(publicArticle.title) })).toBeVisible();
  await expect(reader.page.getByText(internal.title, { exact: true })).toHaveCount(0);
  await staff.page.goto('/knowledge/' + internal.slug);
  await expect(staff.page.getByRole('heading', { name: internal.title, exact: true })).toBeVisible();
  // Change only this test-owned account, then let the real /auth/me refresh
  // invalidate role-scoped caches without a document reload.
  await fx.db.user.update({ where: { id: staff.user.id }, data: { role: 'USER' } });
  await staff.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(staff.page.getByRole('complementary').getByRole('link', { name: 'Manage Knowledge', exact: true })).toHaveCount(0);
  await expect(staff.page.getByText('This article could not be loaded.', { exact: true })).toBeVisible();
  await expect(staff.page.getByText(internal.content, { exact: true })).toHaveCount(0);
  expect(await apiStatus(staff.page, '/knowledge/' + internal.slug)).toBe(404);
});
test('real draft, submission, return, publication, feedback, archive and republish workflow', async ({ fx }) => {
  const agent = await fx.actor('AGENT'); const admin = await fx.actor('ADMIN'); const reader = await fx.actor(); const title = fx.prefix + ' Restore printer connection';
  await agent.page.goto('/knowledge/new'); await agent.page.getByLabel('Title', { exact: true }).fill(title);
  await agent.page.getByLabel('Summary', { exact: true }).fill('Synthetic printer recovery instructions for browser coverage.');
  await agent.page.getByLabel('Article content').fill('Synthetic instructions: verify the connection, restart the print queue and retry the document.');
  await agent.page.getByLabel('Visibility', { exact: true }).selectOption('PUBLIC'); await agent.page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(agent.page).toHaveURL(/\/knowledge\/[a-f0-9-]+\/edit$/);
  await agent.page.getByRole('link', { name: 'Back to Manage Knowledge', exact: true }).click();
  await expect(agent.page).toHaveURL(/\/knowledge\/manage$/);
  const draft = await fx.db.knowledgeArticle.findFirstOrThrow({ where: { title } });
  expect(await apiStatus(reader.page, '/knowledge/' + draft.slug)).toBe(404);
  const otherStaff = await fx.account('AGENT'); const otherContext = await fx.context(); const otherPage = await otherContext.newPage();
  await require('../fixtures.cjs').signIn(otherPage, otherStaff);
  expect([403, 404]).toContain(await apiStatus(otherPage, '/knowledge/manage/' + draft.id));
  const article = agent.page.getByRole('article').filter({ has: agent.page.getByRole('heading', { name: title }) });
  await article.getByRole('button', { name: 'Submit for review' }).click(); await agent.page.getByRole('dialog').getByRole('button', { name: 'Submit for review' }).click();
  await admin.page.goto('/knowledge/manage'); await admin.page.getByRole('tab', { name: 'In Review' }).click();
  const review = admin.page.getByRole('article').filter({ has: admin.page.getByRole('heading', { name: title }) });
  await review.getByRole('button', { name: 'Return to draft' }).click(); await admin.page.getByLabel('Required review note').fill('Synthetic review requests one clearer step.');
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Return to draft' }).click();
  await agent.page.reload(); await agent.page.getByRole('tab', { name: 'My Drafts' }).click(); await article.getByRole('button', { name: 'Submit for review' }).click();
  await agent.page.getByRole('dialog').getByRole('button', { name: 'Submit for review' }).click();
  await admin.page.reload(); await admin.page.getByRole('tab', { name: 'In Review' }).click(); await review.getByRole('button', { name: 'Publish', exact: true }).click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
  await expect.poll(() => fx.db.knowledgeArticle.count({ where: { title, status: 'PUBLISHED' } })).toBe(1);
  const row = await fx.db.knowledgeArticle.findFirstOrThrow({ where: { title } });
  await reader.page.goto('/knowledge'); await reader.page.getByLabel('Search knowledge').fill(title);
  await reader.page.getByRole('button', { name: 'Apply', exact: true }).click();
  await reader.page.getByRole('link', { name: title, exact: true }).click();
  await reader.page.getByRole('button', { name: 'Helpful', exact: true }).click();
  await expect(reader.page.getByRole('button', { name: 'Helpful', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await admin.page.getByRole('tab', { name: 'Published', exact: true }).click(); await review.getByRole('button', { name: 'Archive', exact: true }).click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
  await expect.poll(() => fx.db.knowledgeArticle.count({ where: { id: row.id, status: 'ARCHIVED' } })).toBe(1);
  await reader.page.reload(); await expect(reader.page.getByRole('heading', { name: title })).toHaveCount(0);
  await admin.page.getByRole('tab', { name: 'Archived', exact: true }).click(); await review.getByRole('button', { name: 'Republish' }).click();
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Republish' }).click();
  await expect.poll(() => fx.db.knowledgeArticle.count({ where: { id: row.id, status: 'PUBLISHED' } })).toBe(1);
  await reader.page.reload(); await expect(reader.page.getByRole('heading', { name: title })).toBeVisible();
});
