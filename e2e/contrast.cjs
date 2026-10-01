// Conservative WCAG luminance bounds for the Summary's CSS gradient only.
// No page text, identifiers, DOM snapshots or screenshots leave the browser.
async function summaryContrast(page) {
  return page.locator('section[aria-labelledby="dashboard-heading"]').evaluate(section => {
    const parse = value => {
      const parts = value.match(/[\d.]+/g)?.map(Number);
      if (!parts || parts.length < 3) throw Error('Unsupported computed color');
      return [...parts.slice(0, 3), parts[3] ?? 1];
    };
    const style = getComputedStyle(section), base = parse(style.backgroundColor);
    if (base[3] !== 1) throw Error('Gradient base must be opaque');
    const stops = (style.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse);
    if (stops.length < 2) throw Error('Expected Summary gradient');
    const colors = stops.map(c => c.slice(0, 3).map((channel, i) => channel * c[3] + base[i] * (1 - c[3])));
    const lower = [0, 1, 2].map(i => Math.min(...colors.map(c => c[i])));
    const upper = [0, 1, 2].map(i => Math.max(...colors.map(c => c[i])));
    const luminance = rgb => rgb.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
    const min = luminance(lower), max = luminance(upper);
    return [...section.querySelectorAll('p,h1')].map(el => {
      const css = getComputedStyle(el), foreground = parse(css.color); if (foreground[3] !== 1) throw Error('Text must be opaque');
      const value = luminance(foreground), ratio = value < min ? (min + .05) / (value + .05) : value > max ? (value + .05) / (max + .05) : 1;
      const large = parseFloat(css.fontSize) >= 24 || (parseFloat(css.fontSize) >= 18.66 && Number(css.fontWeight) >= 700);
      return { element: el.tagName.toLowerCase(), foreground: foreground.slice(0, 3), lower, upper, conservativeRatio: Number(ratio.toFixed(3)), required: large ? 3 : 4.5 };
    });
  });
}
module.exports = { summaryContrast };
