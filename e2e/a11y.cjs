const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs'); const path = require('node:path');
const { expect } = require('@playwright/test');
const { summaryContrast } = require('./contrast.cjs');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
async function audit(page, state, records) {
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  // Never retain HTML, text, accessible names, URLs, tokens or fixture IDs.
  const safe = { status: 'a11y-scan', state, violations: result.violations.map(v => ({ rule: v.id, impact: v.impact, nodes: v.nodes.length,
    elements: [...new Set(v.nodes.map(n => /^<([a-z0-9]+)/i.exec(n.html)?.[1] || 'unknown'))],
    colors: v.nodes.flatMap(n => [...n.any, ...n.all].filter(c => c.id === 'color-contrast').map(c => ({ foreground: c.data?.fgColor, background: c.data?.bgColor, ratio: c.data?.contrastRatio }))) })),
    incomplete: result.incomplete.map(v => ({ rule: v.id, nodes: v.nodes.length })) };
  if (state.endsWith(':/dashboard')) {
    safe.gradientContrast = await summaryContrast(page);
  }
  records.push(safe); console.log(JSON.stringify(safe));
  if (safe.gradientContrast) {
    expect(safe.gradientContrast).toHaveLength(4);
    for (const sample of safe.gradientContrast) expect(sample.conservativeRatio).toBeGreaterThanOrEqual(sample.required);
  }
}
function finish(records, info) {
  const dir = path.resolve(__dirname, 'artifacts/accessibility'); fs.mkdirSync(dir, { recursive: true });
  const name = `${process.env.E2E_RUN_ID}-${info.project.name}-${info.title.replace(/[^a-z0-9-]/gi, '_')}.json`;
  fs.writeFileSync(path.join(dir, name), JSON.stringify(records, null, 2));
  expect(records.length).toBeGreaterThan(0);
  expect(records.flatMap(r => r.violations.map(v => ({ state: r.state, rule: v.rule, impact: v.impact, nodes: v.nodes })))).toEqual([]);
}
async function theme(page, value) { await page.addInitScript(v => localStorage.setItem('theme-preference', v), value); }
module.exports = { audit, finish, theme, TAGS };
