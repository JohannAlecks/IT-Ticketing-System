const { test } = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { browserLifecycle } = require('./browser-fixture.cjs');
const { failureState, failureError, cleanupStep, decode } = require('./failure.cjs');
const { createOwnedRoot, exactRoot, removeOwnedRoot, waitForExit } = require('./cleanup.cjs');
const { fail } = require('./safety.cjs');

test('launch failure remains primary when profile and artifact cleanup also fail', async () => {
  const rows = [];
  await assert.rejects(browserLifecycle({
    launch: async () => { throw Object.assign(new Error('spawn EPERM private credentials and path'), { code: 'EPERM' }); },
    verify: async () => {}, use: async () => assert.fail('must not execute tests'), wait: async () => {},
    inspect: async (state) => {
      await cleanupStep(state, 'profile-cleanup', () => { throw fail('BROWSER_PROFILE_CLEANUP'); });
      await cleanupStep(state, 'artifact-cleanup', () => { throw fail('BROWSER_ARTIFACT_CLEANUP'); });
    }, record: (row) => rows.push(row),
  }), (error) => {
    const result = decode(error); assert.equal(result.primary.phase, 'launch'); assert.equal(result.primary.code, 'EPERM');
    assert.deepEqual(result.secondary.map((e) => e.phase), ['profile-cleanup', 'artifact-cleanup']);
    assert.doesNotMatch(error.message, /private|credentials|path/); return true;
  });
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'browser-failure');
});

test('assertion stays primary through page, browser, process and artifact failures', async () => {
  const order = []; const context = { pages: () => [{ close: async () => { order.push('page'); throw new Error('private page'); } }], close: async () => order.push('context') };
  const browser = { version: () => 'synthetic', contexts: () => [context], close: async () => { order.push('browser'); throw new Error('private browser'); } };
  await assert.rejects(browserLifecycle({ launch: async () => browser, verify: async () => {},
    use: async () => { throw new Error('expect(locator).toBeVisible() private text'); },
    wait: async () => { order.push('process'); throw fail('OWNED_PROCESS_EXIT_TIMEOUT'); },
    inspect: async () => { order.push('inspect'); throw new Error('private artifact'); }, record: () => {},
  }), (e) => {
    const r = decode(e); assert.equal(r.primary.phase, 'assertion'); assert.equal(r.primary.assertion, 'toBeVisible');
    assert.deepEqual(r.secondary.map((s) => s.phase), ['page-close', 'browser-close', 'process-shutdown', 'artifact-cleanup']);
    assert.doesNotMatch(e.message, /private/); return true;
  });
  assert.deepEqual(order, ['page', 'context', 'browser', 'process', 'inspect']);
});

test('successful browser cleanup closes all pages then contexts then browser before waiting', async () => {
  const order = []; const browser = { version: () => 'synthetic', contexts: () => [{ pages: () => [{ close: async () => order.push('page') }], close: async () => order.push('context') }], close: async () => order.push('browser') };
  await browserLifecycle({ launch: async () => browser, verify: async () => {}, use: async () => {}, wait: async () => order.push('exit'), inspect: async () => order.push('inspect'), record: () => {} });
  assert.deepEqual(order, ['page', 'context', 'browser', 'exit', 'inspect']);
});

test('delayed owned process exit is awaited without terminating another process', async () => {
  let time = 0; let checks = 0;
  await waitForExit(async () => ++checks === 3, { now: () => time, delay: async (ms) => { time += ms; }, timeoutMs: 500 });
  assert.equal(checks, 3); assert.equal(time, 200);
});
test('permanent process shutdown failure is bounded', async () => {
  let time = 0;
  await assert.rejects(waitForExit(async () => false, { now: () => time, delay: async (ms) => { time += ms; }, timeoutMs: 300 }), /OWNED_PROCESS_EXIT_TIMEOUT/);
  assert.equal(time, 300);
});
test('transient Windows directory locks use short bounded backoff then succeed', async () => {
  const token = createOwnedRoot(); let attempts = 0; const delays = [];
  try {
    fs.mkdirSync(path.join(token.directory, 'synthetic'));
    await removeOwnedRoot(token, { remove: (target, options) => { attempts++; if (attempts < 4) throw Object.assign(new Error('locked'), { code: ['EPERM', 'EBUSY', 'ENOTEMPTY'][attempts - 1] }); fs.rmSync(target, options); }, delay: async (ms) => delays.push(ms) });
    assert.equal(attempts, 4); assert.deepEqual(delays, [50, 100, 200]); assert.equal(fs.existsSync(token.directory), false);
  } finally { if (fs.existsSync(token.directory)) await removeOwnedRoot(token); }
});
test('permanent lock fails after four attempts without claiming cleanup', async () => {
  const token = createOwnedRoot(); let attempts = 0;
  try {
    await assert.rejects(removeOwnedRoot(token, { remove: () => { attempts++; throw Object.assign(new Error('locked'), { code: 'EPERM' }); }, delay: async () => {} }), { code: 'EPERM' });
    assert.equal(attempts, 4); assert.equal(fs.existsSync(token.directory), true);
  } finally { await removeOwnedRoot(token); }
});
test('unrecognized removal failures are never retried', async () => {
  const token = createOwnedRoot(); let attempts = 0;
  try {
    await assert.rejects(removeOwnedRoot(token, { remove: () => { attempts++; throw Object.assign(new Error('io'), { code: 'EIO' }); }, delay: async () => assert.fail('no retry') }), { code: 'EIO' });
    assert.equal(attempts, 1);
  } finally { await removeOwnedRoot(token); }
});
test('exact-root ownership rejects forged, broad and other-run targets', async () => {
  const token = createOwnedRoot(); const other = createOwnedRoot();
  try {
    for (const directory of [token.directory, other.directory, path.dirname(token.directory), path.join(token.directory, 'child')]) {
      await assert.rejects(removeOwnedRoot({ directory }), /ROOT_OWNERSHIP/);
    }
    assert.equal(exactRoot(token), token.directory); assert.equal(fs.existsSync(other.directory), true);
  } finally { await removeOwnedRoot(token); await removeOwnedRoot(other); }
});
test('root identity is rechecked before a second destructive attempt', async () => {
  const token = createOwnedRoot(); let calls = 0;
  try {
    await assert.rejects(removeOwnedRoot(token, { remove: () => { calls++; throw Object.assign(new Error('lock'), { code: 'EBUSY' }); }, delay: async () => { fs.rmdirSync(exactRoot(token)); } }), /TEMP_ROOT|ENOENT/);
    assert.equal(calls, 1);
  } finally { if (fs.existsSync(token.directory)) await removeOwnedRoot(token); }
});
test('successful complete root cleanup preserves a different owned run', async () => {
  const token = createOwnedRoot(); const other = createOwnedRoot();
  try {
    fs.writeFileSync(path.join(token.directory, 'synthetic.txt'), 'synthetic'); await removeOwnedRoot(token);
    assert.equal(fs.existsSync(token.directory), false); assert.equal(fs.existsSync(other.directory), true);
  } finally { await removeOwnedRoot(other); }
});
test('runner-level cleanup preserves already-sanitized launch evidence', async () => {
  const state = failureState(new Error('launch timeout contains secret'), 'launch');
  const outer = failureState(failureError(state), 'runtime');
  await cleanupStep(outer, 'root-cleanup', () => { throw Object.assign(new Error('private path'), { code: 'ENOTEMPTY' }); });
  assert.equal(outer.primary.phase, 'launch'); assert.equal(outer.primary.category, 'TIMEOUT');
  assert.equal(outer.secondary[0].code, 'ENOTEMPTY'); assert.doesNotMatch(failureError(outer).message, /secret|private/);
});
test('report decoding rejects unapproved fields and arbitrary paths', () => {
  assert.equal(decode(new Error('E2E_FAILURE {"primary":{"phase":"launch","category":"FAILED","path":"private"},"secondary":[]}')), null);
});
