// Never print Playwright error bodies, locator call logs, request data or attachments.
const { emit } = require('./evidence.cjs');
const record = (value) => emit(process.env.E2E_RUN_ID, value);
function safeFailure(error) {
  const message = error?.message || '';
  return { category: /(?:E2E refused|Test database refused): ([A-Z_]+)/.exec(message)?.[1] ||
    (/No tests found/.test(message) ? 'NO_TESTS_FOUND' : /strict mode violation/i.test(message) ? 'STRICT_LOCATOR' : /is not a function/i.test(message) ? 'NOT_FUNCTION' : /timeout|timed out/i.test(message) ? 'TIMEOUT' : 'ASSERTION_OR_RUNNER'),
    assertion: /\b(to[A-Z][A-Za-z]+)\(/.exec(message)?.[1],
    frames: [...(error?.stack || '').matchAll(/([A-Za-z0-9_.-]+\.cjs):(\d+):\d+/g)].slice(0, 4).map((m) => `${m[1]}:${m[2]}`) };
}
class SafeReporter {
  onStdOut(chunk) {
    for (const line of String(chunk).split('\n')) {
      try { const value = JSON.parse(line); if (['a11y-scan', 'browser-cleanup', 'browser-cleanup-diagnostic', 'test-fixture-cleanup', 'readiness-transport-diagnostic'].includes(value.status)) record(value); } catch { /* never forward raw logs */ }
    }
  }
  onBegin(config, suite) { this.total = suite.allTests().length; this.passed = 0; this.invalid = 0; this.executed = 0; this.skipped = 0; this.retries = 0; record({ e2eCollected: this.total }); }
  onTestEnd(test, result) {
    if (result.status === 'skipped') this.skipped++; else this.executed++;
    this.retries += result.retry > 0 ? 1 : 0;
    const passed = result.status === 'passed' && result.retry === 0;
    if (passed) this.passed++; else this.invalid++;
    record({ project: test.parent.project()?.name, file: require('path').basename(test.location.file), line: test.location.line, status: result.status, retry: result.retry, ...(passed ? {} : { failures: result.errors.map(safeFailure) }) });
  }
  onError(error) { this.invalid = (this.invalid || 0) + 1; record({ status: 'runner-error', ...safeFailure(error) }); }
  onEnd(result) {
    const valid = this.total > 0 && this.passed === this.total && !this.invalid && result.status === 'passed';
    record({ total: this.total, executed: this.executed, passed: this.passed, skipped: this.skipped, notRun: Math.max(0, (this.total || 0) - (this.executed || 0) - (this.skipped || 0)), retries: this.retries, skippedOrFailed: this.invalid, status: valid ? 'passed' : 'failed' });
    return { status: valid ? 'passed' : 'failed' };
  }
  printsToStdio() { return true; }
}
module.exports = SafeReporter;
