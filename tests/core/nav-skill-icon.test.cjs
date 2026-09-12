const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('../harness.cjs');
test('Status menu uses the native active skill across switches and falls back when idle', () => {
  let skill = 'Woodcutting', active = true;
  const h = harness({ document: { querySelector: () => active ? { querySelector: () => ({ textContent: skill }) } : null } });
  assert.equal(h.context.statusNavActivity().image, '/assets/misc/woodcutting.png');
  skill = 'Two-handed';
  assert.equal(h.context.statusNavActivity().image, '/assets/misc/two-handed.png');
  assert.equal(h.context.statusNavActivity().active, true);
  active = false;
  assert.equal(h.context.statusNavActivity().active, false);
  assert.equal(h.context.statusNavActivity().image, '/assets/icon.png');
});
