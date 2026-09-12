const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
test('sidebar subtitle shows installed version and leaves native heading untouched', () => {
  const logo = { dataset: {} };
  const title = { textContent: 'Woodcutting' };
  const h = harness({ document: { querySelector: selector => selector === 'nav-component .logo' ? logo : title } });
  h.context.installSidebarVersion();
  assert.equal(logo.dataset.iwStatusVersion, `with status panel v${require('../../package.json').version}`);
  h.context.setStatusHeader(true);
  h.context.setStatusHeader(false);
  assert.equal(title.textContent, 'Woodcutting');
});
