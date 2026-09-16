const { test: base, expect } = require('@playwright/test');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs'); const path = require('node:path');
const { database, fingerprint, runtimeIdentity, temporaryRoot, serverRequire, WEB, API, fail } = require('./safety.cjs');
const { contextOptions, withIsolatedBrowser } = require('./browser-fixture.cjs');
async function signIn(page, account) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.credential);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // Prove the real responsive utility CSS is active, not merely the markup.
  const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (page.viewportSize().width < 768) await expect(navigation).toBeVisible();
  else await expect(navigation).toBeHidden();
}
async function signOut(page, account) {
  // Account menu has no explicit label; its accessible name is rendered initials
  // plus the account's name on desktop, and initials on mobile.
  const initials = account.name.split(' ').map((v) => v[0]).slice(0, 2).join('').toUpperCase();
  const accountButton = page.getByRole('banner').getByRole('button', { name: new RegExp(initials) });
  const logoutButton = page.getByRole('button', { name: 'Log out', exact: true });
  // Use actual touch events in the touch-enabled emulation project rather than
  // a synthetic mouse hover/leave sequence on its account menu.
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    await accountButton.tap(); await expect(logoutButton).toBeVisible(); await logoutButton.tap();
  } else {
    await accountButton.click(); await expect(logoutButton).toBeVisible(); await logoutButton.click();
  }
  await expect(page).toHaveURL(/\/login$/);
}
async function apiStatus(page, route, method = 'GET', body) {
  // This exercises negative authorization through the actual browser session.
  // The credential remains inside the page; only the HTTP status is returned.
  return page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return response.status;
  }, { url: API + '/api' + route, method, body });
}
const test = base.extend({
  browser: [async ({}, use, info) => withIsolatedBrowser(use, info), { scope: 'worker' }],
  fx: async ({ browser }, use, info) => {
    await runtimeIdentity(); temporaryRoot(process.env.E2E_TEMP_ROOT);
    const db = await database(); let before;
    try { before = await fingerprint(db); } catch (error) { await db.$disconnect(); throw error; }
    const prefix = 'e2e-' + randomUUID(); const contexts = []; const userIds = []; const logIds = []; const policyOriginals = new Map();
    const uploadRoot = path.join(process.env.E2E_TEMP_ROOT, 'uploads');
    const uploadBefore = new Set(fs.existsSync(uploadRoot) ? fs.readdirSync(uploadRoot) : []);
    const roleAccounts = new Map(); let sequence = 0;
    const credential = 'Synthetic!' + randomBytes(18).toString('hex');
    const password = await serverRequire('bcrypt').hash(credential, 12);
    const account = async (role = 'USER', extra = {}) => {
      const id = randomUUID(); userIds.push(id);
      const user = await db.user.create({ data: { id, name: `${prefix} ${role} ${++sequence}`, email: `${prefix}-${sequence}@example.test`, role, password, emailVerified: true, ...extra } });
      return { ...user, credential };
    };
    const context = async () => {
      const config = info.project.use;
      const ctx = await browser.newContext(contextOptions(config)); contexts.push(ctx);
      await ctx.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return [WEB, API].includes(url.origin) ? route.continue() : route.abort('blockedbyclient');
      });
      return ctx;
    };
    const fx = { db, prefix, credential, account, context,
      async actor(role = 'USER') {
        if (roleAccounts.has(role)) return roleAccounts.get(role);
        const user = await account(role); const ctx = await context(); const page = await ctx.newPage();
        await signIn(page, user); const actor = { user, page, context: ctx }; roleAccounts.set(role, actor); return actor;
      },
      async ticket(owner, extra = {}) {
        const policy = await db.slaPolicy.findUnique({ where: { priority: 'MEDIUM' } });
        const now = new Date();
        return db.ticket.create({ data: { title: `${prefix} Printer connection ${++sequence}`, description: 'Synthetic browser fixture with detailed reproduction steps.', createdById: owner.id,
          ...serverRequire('./src/modules/sla/sla.engine').createSnapshot(policy, now), ...extra } });
      },
      async department(label, extra = {}) {
        const name = `${prefix} ${label}`;
        return db.department.create({ data: { name, normalizedName: name.toLowerCase(), ...extra } });
      },
      async notices(user, count = 14) {
        for (let i = 0; i < count; i++) await db.notification.create({ data: { recipientId: user.id, type: 'ACCOUNT_REACTIVATED', title: `${prefix} Notice ${i}`, message: 'Synthetic mandatory event', dedupeKey: `${prefix}:${user.id}:${i}` } });
      },
      async emailStates() {
        for (const status of ['DISABLED', 'UNKNOWN', 'ACCEPTED', 'FAILED']) {
          const id = randomUUID(); logIds.push(id);
          await db.emailLog.create({ data: { id, messageType: 'EMAIL_VERIFICATION', recipientMasked: 's***@e***.***', idempotencyHash: createHash('sha256').update(id).digest('hex'),
            provider: status === 'DISABLED' ? 'DISABLED' : 'RESEND', status, attemptCount: status === 'DISABLED' ? 0 : 1,
            errorCategory: { DISABLED: 'EMAIL_DISABLED', UNKNOWN: 'NOT_CONFIRMED', FAILED: 'PROVIDER_REJECTED', ACCEPTED: null }[status],
            ...(status === 'ACCEPTED' ? { acceptedAt: new Date(), providerMessageId: randomUUID() } : {}), ...(status === 'FAILED' ? { failedAt: new Date() } : {}) } });
        }
      },
      async preservePolicy(id) { if (!policyOriginals.has(id)) policyOriginals.set(id, await db.slaPolicy.findUniqueOrThrow({ where: { id } })); },
    };
    try { await use(fx); }
    finally {
      await Promise.all(contexts.map((ctx) => ctx.close()));
      try {
        await runtimeIdentity();
        await expect.poll(async () => {
          const r = await fetch(API + '/health', { signal: AbortSignal.timeout(3000) });
          return r.headers.get('x-e2e-active-requests');
        }, { timeout: 15000 }).toBe('0');
        // Resolve only synthetic IDs: browser-created accounts/departments are
        // restricted to this unguessable prefix; tickets/articles to owned users.
        const users = await db.user.findMany({ where: { OR: [{ id: { in: userIds } }, { email: { startsWith: prefix + '-' } }] }, select: { id: true } });
        const ids = users.map((u) => u.id);
        const tickets = await db.ticket.findMany({ where: { createdById: { in: ids } }, select: { id: true } }); const tids = tickets.map((t) => t.id);
        const articles = await db.knowledgeArticle.findMany({ where: { authorId: { in: ids } }, select: { id: true } }); const aids = articles.map((a) => a.id);
        const deps = await db.department.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } }); const dids = deps.map((d) => d.id);
        const tokens = await db.emailVerificationToken.findMany({ where: { userId: { in: ids } }, select: { id: true } });
        const hashes = tokens.map((token) => createHash('sha256').update(`verify-email/${token.id}`).digest('hex'));
        await db.$transaction(async (tx) => {
          await tx.emailLog.deleteMany({ where: { OR: [{ id: { in: logIds } }, { idempotencyHash: { in: hashes } }] } });
          await tx.notification.deleteMany({ where: { OR: [{ recipientId: { in: ids } }, { actorId: { in: ids } }] } });
          await tx.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { entityId: { in: [...ids, ...tids, ...aids, ...dids] } }] } });
          await tx.ticketSatisfaction.deleteMany({ where: { cycle: { ticketId: { in: tids } } } });
          await tx.ticketResolutionCycle.deleteMany({ where: { ticketId: { in: tids } } });
          await tx.ticket.deleteMany({ where: { id: { in: tids } } });
          await tx.knowledgeArticle.deleteMany({ where: { id: { in: aids } } });
          await tx.user.deleteMany({ where: { id: { in: ids } } });
          await tx.department.deleteMany({ where: { id: { in: dids } } });
          for (const [id, original] of policyOriginals) { const { id: _, ...data } = original; await tx.slaPolicy.update({ where: { id }, data }); }
        });
        if (fs.existsSync(uploadRoot)) {
          temporaryRoot(process.env.E2E_TEMP_ROOT);
          const store = serverRequire('./src/modules/attachments/attachment.storage').createStore(uploadRoot);
          for (const filename of fs.readdirSync(uploadRoot)) if (!uploadBefore.has(filename)) await store.remove(filename);
          if (JSON.stringify(fs.readdirSync(uploadRoot).sort()) !== JSON.stringify([...uploadBefore].sort())) throw fail('UPLOAD_FIXTURE_CLEANUP');
        }
        if (JSON.stringify(await fingerprint(db)) !== JSON.stringify(before)) throw fail('TEST_FIXTURE_CLEANUP');
        console.log(JSON.stringify({ status: 'test-fixture-cleanup', baselineRestored: true, temporaryUploadsRestored: true }));
      } finally { await db.$disconnect(); }
    }
  },
});
module.exports = { test, expect, signIn, signOut, apiStatus };
